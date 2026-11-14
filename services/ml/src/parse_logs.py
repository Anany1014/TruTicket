"""
parse_logs.py
=============
Parses Apache-format web logs from Phase 1 and Phase 2.
Extracts session-level features grouped by session_id.

Log format (IP field is anonymised as '-'):
  - - [01/Nov/2019:10:47:35 +0000] "GET /url HTTP/1.1" 200 735 "referer" SESSION_ID "UA"

Field positions (space-delimited tokens in regex groups):
  1  : IP        → always '-'
  2  : ident     → always '-'
  3  : [date]    → timestamp in brackets
  4  : "method url protocol"
  5  : status code
  6  : response bytes
  7  : "referer"
  8  : session_id    → 26-char alphanumeric, or '-' if cookie not yet set
  9  : "user_agent"

Design notes
------------
- 'HTTPS' is NOT inferred from the referer field.  HTTPS status is unknown
  because the IP is anonymised and we have no TLS termination logs.
  We instead record `log_referer_is_https` as an observation-only signal.
- Lines where session_id == '-' are counted separately for context, but are
  NOT added to any session's record (we cannot attribute them).
- Internal Apache dummy-connection lines ("OPTIONS * HTTP/1.0" with
  user-agent "Apache/...") are detected and excluded from session features.
- Division-by-zero is avoided throughout with explicit guards.
- All timestamps are parsed as timezone-aware datetimes and stored as
  Unix epoch floats for arithmetic.

URL categories
--------------
  static     : .css .js .ico .png .jpg .woff etc.
  mouse_post : POST to /storage/store_sess_total_mousemv_db.php
  content    : any path under /content/
  home       : '/' or '' (the landing page)
  fingerprint: /js/fingerprint_browser.js (special signal)
  other      : everything else
"""

from __future__ import annotations

import logging
import re
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

logger = logging.getLogger(__name__)

# ── Regex for one log line ────────────────────────────────────────────────────
_LOG_RE = re.compile(
    r'- - '
    r'\[(?P<ts>[^\]]+)\] '
    r'"(?P<method>[A-Z]+) (?P<url>\S+) (?P<proto>HTTP/[\d.]+)" '
    r'(?P<status>\d{3}) (?P<bytes>\d+) '
    r'"(?P<referer>[^"]*)" '
    r'(?P<session>[a-z0-9]{26}|-) '
    r'"(?P<ua>[^"]*)"'
)

_TS_FMT = "%d/%b/%Y:%H:%M:%S %z"

# ── URL classification constants ──────────────────────────────────────────────
_STATIC_EXTS    = frozenset([
    ".css", ".js", ".ico", ".png", ".jpg", ".jpeg",
    ".gif", ".woff", ".woff2", ".ttf", ".svg", ".map",
])
_MOUSE_POST_URL = "/storage/store_sess_total_mousemv_db.php"
_FINGERPRINT_JS = "/js/fingerprint_browser.js"
_CONTENT_PREFIX = "/content/"
_APACHE_UA      = re.compile(r"Apache/\d", re.IGNORECASE)


def _url_category(method: str, url: str, ua: str) -> str:
    """Return coarse URL category for a single request."""
    # Internal Apache dummy connections — ignore for session features
    if _APACHE_UA.search(ua) and method == "OPTIONS":
        return "apache_internal"
    clean = url.split("?")[0]
    ext   = Path(clean).suffix.lower()
    if ext in _STATIC_EXTS:
        return "static"
    if clean == _MOUSE_POST_URL:
        return "mouse_post"
    if clean == _FINGERPRINT_JS:
        return "fingerprint"
    if clean.startswith(_CONTENT_PREFIX):
        return "content"
    if clean in ("/", ""):
        return "home"
    return "other"


# ── Single-line parser ────────────────────────────────────────────────────────

def _parse_line(line: str) -> Optional[Dict]:
    """Parse one log line. Returns None on failure or no match."""
    m = _LOG_RE.match(line.strip())
    if not m:
        return None
    try:
        ts = datetime.strptime(m.group("ts"), _TS_FMT).timestamp()   # Unix float
    except ValueError:
        return None

    method  = m.group("method")
    url     = m.group("url")
    ua      = m.group("ua")

    return {
        "ts":         ts,
        "method":     method,
        "url":        url,
        "proto":      m.group("proto"),
        "status":     int(m.group("status")),
        "bytes":      int(m.group("bytes")),
        "referer":    m.group("referer"),
        "session_id": m.group("session"),
        "ua":         ua,
        "url_cat":    _url_category(method, url, ua),
    }


# ── File / directory parsers ──────────────────────────────────────────────────

def parse_log_file(path: Path) -> List[Dict]:
    """Parse all parseable lines in one log file."""
    rows, skipped = [], 0
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        for line in fh:
            rec = _parse_line(line)
            if rec is None:
                skipped += 1
            else:
                rows.append(rec)
    logger.debug("%-45s  parsed=%d  skipped=%d", path.name, len(rows), skipped)
    return rows


def parse_log_directory(directory: Path) -> List[Dict]:
    """Parse every *.log file found (recursively) in `directory`."""
    all_rows = []
    log_files = sorted(directory.rglob("*.log"))
    logger.info("Parsing %d log files from %s …", len(log_files), directory)
    for f in log_files:
        all_rows.extend(parse_log_file(f))
    logger.info("Total rows from directory: %d", len(all_rows))
    return all_rows


def parse_log_files(*paths: Path) -> List[Dict]:
    """Parse one or more explicit log file paths."""
    all_rows = []
    for p in paths:
        if p.exists():
            all_rows.extend(parse_log_file(p))
        else:
            logger.error("Log file not found: %s", p)
    return all_rows


# ── Session index ─────────────────────────────────────────────────────────────

def build_session_index(rows: List[Dict]) -> Dict[str, List[Dict]]:
    """
    Group rows by session_id.
    Rows with session_id == '-' are excluded (cannot be attributed).
    """
    idx: Dict[str, List[Dict]] = defaultdict(list)
    anon = 0
    for r in rows:
        sid = r["session_id"]
        if sid and sid != "-":
            idx[sid].append(r)
        else:
            anon += 1
    logger.info(
        "Session index: %d unique sessions | %d anonymous rows excluded",
        len(idx), anon
    )
    return dict(idx)


# ── Session-level feature extraction ─────────────────────────────────────────

def extract_log_features(session_rows: List[Dict]) -> Dict:
    """
    Compute one feature vector for a list of rows that all belong to the
    same session_id (already filtered by the caller).

    The session_id itself is NOT included here — the caller adds it.
    """
    if not session_rows:
        return _empty_log_features()

    # Sort by time
    rows = sorted(session_rows, key=lambda r: r["ts"])
    ts   = np.array([r["ts"] for r in rows], dtype=float)

    # ── Totals ───────────────────────────────────────────────────────────────
    total      = len(rows)
    urls       = [r["url"] for r in rows]
    unique_urls = len(set(urls))
    url_counts  = Counter(urls)
    max_reps    = max(url_counts.values())

    cat_counts  = Counter(r["url_cat"] for r in rows)
    static_n    = cat_counts.get("static",   0)
    content_n   = cat_counts.get("content",  0)
    home_n      = cat_counts.get("home",     0)
    mouse_n     = cat_counts.get("mouse_post", 0)
    fp_n        = cat_counts.get("fingerprint", 0)
    other_n     = cat_counts.get("other",    0)
    internal_n  = cat_counts.get("apache_internal", 0)

    post_n      = sum(1 for r in rows if r["method"] == "POST")
    get_n       = sum(1 for r in rows if r["method"] == "GET")

    # HTTP version
    http10_n    = sum(1 for r in rows if r["proto"] == "HTTP/1.0")
    http10_ratio = http10_n / total

    # ── Timing ───────────────────────────────────────────────────────────────
    duration_s  = float(ts[-1] - ts[0]) if len(ts) > 1 else 0.0
    gaps        = np.diff(ts) if len(ts) > 1 else np.array([0.0])

    gap_mean    = float(np.mean(gaps))
    gap_std     = float(np.std(gaps))
    gap_min     = float(np.min(gaps))
    gap_max     = float(np.max(gaps))
    gap_median  = float(np.median(gaps))
    rps         = total / duration_s if duration_s > 0 else float(total)

    # ── Content navigation ───────────────────────────────────────────────────
    content_urls   = [r["url"] for r in rows if r["url_cat"] == "content"]
    unique_content = len(set(content_urls))
    revisited_c    = sum(1 for u, c in Counter(content_urls).items() if c > 1)
    content_revisit_ratio = (
        revisited_c / unique_content if unique_content > 0 else 0.0
    )

    # Static-to-dynamic ratio (guard: avoid /0)
    static_dyn_ratio = static_n / content_n if content_n > 0 else float(static_n)

    # ── Referer observation (NOT an HTTPS inference) ─────────────────────────
    referer_https_obs = int(
        any(r["referer"].lower().startswith("https://") for r in rows)
    )

    # ── User agent ───────────────────────────────────────────────────────────
    ua_values      = [r["ua"] for r in rows if r["ua"] not in ("", "-")]
    is_empty_ua    = int(len(ua_values) == 0)
    has_fp_js      = int(fp_n > 0)   # downloaded fingerprint JS

    return {
        # counts
        "log_total_requests":        total,
        "log_get_requests":          get_n,
        "log_post_requests":         post_n,
        "log_unique_urls":           unique_urls,
        "log_static_requests":       static_n,
        "log_content_requests":      content_n,
        "log_home_requests":         home_n,
        "log_mouse_post_count":      mouse_n,
        "log_fingerprint_js_hits":   fp_n,
        "log_other_requests":        other_n,
        "log_internal_requests":     internal_n,
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
        "log_content_revisit_ratio": content_revisit_ratio,
        "log_max_url_repetitions":   max_reps,
        "log_static_dyn_ratio":      static_dyn_ratio,
        # protocol
        "log_http10_ratio":          http10_ratio,
        # UA / signals
        "log_has_fingerprint_js":    has_fp_js,
        "log_is_empty_ua":           is_empty_ua,
        "log_referer_is_https_obs":  referer_https_obs,  # observation only
    }


def _empty_log_features() -> Dict:
    """Zero-filled feature dict for sessions absent from the logs."""
    keys = [
        "log_total_requests", "log_get_requests", "log_post_requests",
        "log_unique_urls", "log_static_requests", "log_content_requests",
        "log_home_requests", "log_mouse_post_count", "log_fingerprint_js_hits",
        "log_other_requests", "log_internal_requests",
        "log_session_duration_s", "log_requests_per_second",
        "log_gap_mean_s", "log_gap_std_s", "log_gap_min_s",
        "log_gap_max_s", "log_gap_median_s",
        "log_unique_content_pages", "log_content_revisit_ratio",
        "log_max_url_repetitions", "log_static_dyn_ratio",
        "log_http10_ratio", "log_has_fingerprint_js",
        "log_is_empty_ua", "log_referer_is_https_obs",
    ]
    return {k: 0.0 for k in keys}

