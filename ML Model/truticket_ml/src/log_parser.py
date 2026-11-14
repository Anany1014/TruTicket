"""
TruTicket ML — Web Log Parser
Parses Apache-format web logs from Phase 1 and Phase 2 and returns a
per-session feature dictionary. No labels are assigned here.

Log format (IP anonymised):
  - - [01/Nov/2019:10:47:35 +0000] "GET /url HTTP/1.1" 200 735 "referer" SESSION_ID "UA"

The SESSION_ID field is the 7th space-delimited token AFTER the closing quote
of the status+bytes+referer block.  Many lines have "-" if the cookie was not
yet set (first request of a session).
"""

from __future__ import annotations

import re
import logging
from pathlib import Path
from datetime import datetime
from collections import Counter, defaultdict
from typing import Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)

# ── Regex for a single log line ───────────────────────────────────────────────
# Groups: timestamp, method, url, protocol, status, bytes, referer, session_id, user_agent
_LOG_RE = re.compile(
    r'- - \[(?P<ts>[^\]]+)\] '
    r'"(?P<method>\w+) (?P<url>\S+) (?P<proto>HTTP/[\d.]+)" '
    r'(?P<status>\d{3}) (?P<bytes>\d+) '
    r'"(?P<referer>[^"]*)" '
    r'(?P<session>[a-z0-9]{26}|-) '
    r'"(?P<ua>[^"]*)"'
)

_TS_FMT = "%d/%b/%Y:%H:%M:%S %z"

# ── URL classification helpers ────────────────────────────────────────────────
_STATIC_EXTS    = {".css", ".js", ".ico", ".png", ".jpg", ".gif", ".woff", ".woff2"}
_STATIC_PATHS   = {"/favicon.ico"}
_MOUSE_STORE    = "/storage/store_sess_total_mousemv_db.php"
_CONTENT_PREFIX = "/content/"

def _classify_url(url: str) -> str:
    """Return coarse category for a request URL."""
    if url in _STATIC_PATHS:
        return "static"
    p = Path(url.split("?")[0])
    if p.suffix in _STATIC_EXTS:
        return "static"
    if url == _MOUSE_STORE:
        return "mouse_post"
    if url.startswith(_CONTENT_PREFIX):
        return "content"
    if url == "/" or url == "":
        return "home"
    return "other"


def parse_log_line(line: str) -> Optional[Dict]:
    """Parse a single log line. Returns None if the line doesn't match."""
    m = _LOG_RE.match(line.strip())
    if not m:
        return None
    try:
        ts = datetime.strptime(m.group("ts"), _TS_FMT)
    except ValueError:
        return None
    return {
        "timestamp":  ts,
        "method":     m.group("method"),
        "url":        m.group("url"),
        "protocol":   m.group("proto"),
        "status":     int(m.group("status")),
        "bytes":      int(m.group("bytes")),
        "referer":    m.group("referer"),
        "session_id": m.group("session"),    # may be "-"
        "user_agent": m.group("ua"),
        "url_cat":    _classify_url(m.group("url")),
    }


def parse_log_file(path: Path) -> List[Dict]:
    """Parse all valid lines in a log file and return a list of dicts."""
    rows = []
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            parsed = parse_log_line(line)
            if parsed:
                rows.append(parsed)
    logger.debug("Parsed %d lines from %s", len(rows), path.name)
    return rows


def parse_log_directory(directory: Path) -> List[Dict]:
    """Parse all *.log files in a directory recursively."""
    rows = []
    for f in sorted(directory.glob("**/*.log")):
        rows.extend(parse_log_file(f))
    return rows


# ── Session-level feature extraction ─────────────────────────────────────────

def extract_log_features(rows: List[Dict], session_id: str) -> Dict:
    """
    Given all log rows that belong to `session_id`, compute
    session-level numeric features.

    Returns a dict keyed by feature name. Values are always numeric
    (int or float). Missing / degenerate cases return safe defaults.
    """
    # Filter to this session, sort by timestamp
    sess = [r for r in rows if r["session_id"] == session_id]
    if not sess:
        return _empty_log_features()

    sess.sort(key=lambda r: r["timestamp"])
    timestamps = [r["timestamp"].timestamp() for r in sess]  # Unix floats

    # ── Basic counts ────────────────────────────────────────────────────────
    total_reqs     = len(sess)
    urls           = [r["url"] for r in sess]
    unique_urls    = len(set(urls))
    url_counts     = Counter(urls)

    static_reqs    = sum(1 for r in sess if r["url_cat"] == "static")
    content_reqs   = sum(1 for r in sess if r["url_cat"] == "content")
    mouse_posts    = sum(1 for r in sess if r["url_cat"] == "mouse_post")
    home_reqs      = sum(1 for r in sess if r["url_cat"] == "home")
    other_reqs     = total_reqs - static_reqs - content_reqs - mouse_posts - home_reqs

    # HTTP 1.0 ratio (older/simpler bots often use 1.0)
    http10_count   = sum(1 for r in sess if r["protocol"] == "HTTP/1.0")
    http10_ratio   = http10_count / total_reqs

    # ── Timing features ──────────────────────────────────────────────────────
    duration_s     = timestamps[-1] - timestamps[0] if len(timestamps) > 1 else 0.0
    gaps           = np.diff(timestamps) if len(timestamps) > 1 else np.array([0.0])

    gap_mean       = float(np.mean(gaps))
    gap_std        = float(np.std(gaps))
    gap_min        = float(np.min(gaps))
    gap_max        = float(np.max(gaps))
    gap_median     = float(np.median(gaps))
    rps            = total_reqs / duration_s if duration_s > 0 else float(total_reqs)

    # ── URL diversity / navigation ───────────────────────────────────────────
    content_urls     = [r["url"] for r in sess if r["url_cat"] == "content"]
    unique_content   = len(set(content_urls))
    content_revisits = sum(1 for u, c in Counter(content_urls).items() if c > 1)
    max_repetitions  = max(url_counts.values())

    revisit_ratio    = (
        content_revisits / unique_content if unique_content > 0 else 0.0
    )
    static_dyn_ratio = (
        static_reqs / content_reqs if content_reqs > 0 else float(static_reqs)
    )

    # ── HTTPS detection (via referer field) ──────────────────────────────────
    is_https = int(
        any(r["referer"].startswith("https://") for r in sess)
    )

    # ── User agent ───────────────────────────────────────────────────────────
    ua = sess[0]["user_agent"] if sess else ""
    is_empty_ua    = int(ua.strip() == "" or ua.strip() == "-")
    is_apache_internal = int("Apache" in ua and "dummy" in ua)

    return {
        # counts
        "log_total_requests":        total_reqs,
        "log_unique_urls":           unique_urls,
        "log_static_requests":       static_reqs,
        "log_content_requests":      content_reqs,
        "log_mouse_post_count":      mouse_posts,
        "log_home_requests":         home_reqs,
        # timing
        "log_session_duration_s":    duration_s,
        "log_requests_per_second":   rps,
        "log_gap_mean_s":            gap_mean,
        "log_gap_std_s":             gap_std,
        "log_gap_min_s":             gap_min,
        "log_gap_max_s":             gap_max,
        "log_gap_median_s":          gap_median,
        # navigation
        "log_unique_content_pages":  unique_content,
        "log_content_revisit_ratio": revisit_ratio,
        "log_max_url_repetitions":   max_repetitions,
        "log_static_dyn_ratio":      static_dyn_ratio,
        # protocol/UA
        "log_http10_ratio":          http10_ratio,
        "log_is_https":              is_https,
        "log_is_empty_ua":           is_empty_ua,
        "log_is_apache_internal":    is_apache_internal,
    }


def _empty_log_features() -> Dict:
    """Return zero-filled log feature dict for sessions with no log data."""
    keys = [
        "log_total_requests", "log_unique_urls", "log_static_requests",
        "log_content_requests", "log_mouse_post_count", "log_home_requests",
        "log_session_duration_s", "log_requests_per_second",
        "log_gap_mean_s", "log_gap_std_s", "log_gap_min_s",
        "log_gap_max_s", "log_gap_median_s",
        "log_unique_content_pages", "log_content_revisit_ratio",
        "log_max_url_repetitions", "log_static_dyn_ratio",
        "log_http10_ratio", "log_is_https",
        "log_is_empty_ua", "log_is_apache_internal",
    ]
    return {k: 0.0 for k in keys}


def build_session_log_index(rows: List[Dict]) -> Dict[str, List[Dict]]:
    """Group parsed log rows by session_id (skipping '-' sessions)."""
    index: Dict[str, List[Dict]] = defaultdict(list)
    for r in rows:
        sid = r["session_id"]
        if sid and sid != "-":
            index[sid].append(r)
    return dict(index)

