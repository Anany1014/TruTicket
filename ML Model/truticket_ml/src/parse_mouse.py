"""
parse_mouse.py
==============
Extracts kinematic features from raw mouse-movement data for both phases.

Phase 1 format
--------------
One folder per session:
    phase1/data/mouse_movements/<experiment>/<session_id>/mouse_movements.json

The JSON is a SINGLE object (not newline-delimited) with keys:
    session_id              : 26-char string
    total_behaviour         : encoded string "[m(x,y)][c(l)][m(x,y)]..."
    mousemove_times         : encoded string of timestamps
    mousemove_total_behaviour : (same as total_behaviour in some versions)

Phase 2 format
--------------
Newline-delimited JSON (NDJSON), one record per line:
    phase2/data/mouse_movements/{humans,bots}/<file>.json

Each line is a JSON object with keys:
    session_id                  : base 26-char ID (no _N suffix)
    mousemove_total_behaviour   : encoded event string
    mousemove_times             : encoded timestamp string
    mousemove_client_height_width : encoded viewport string "[(h,w)]..."
    mousemove_visited_urls      : encoded URL string "[url][url]..."
    unique_id, _id              : metadata (not used for ML)

Event encoding
--------------
Events are square-bracket delimited:
    m(x,y)   → mouse move   to pixel (x, y)
    c(l)     → left click
    c(r)     → right click
    c(m)     → middle click

Timestamps
----------
Phase 1 mousemove_times : "[t1,t2,t3,...]" — values in MILLISECONDS since page load
Phase 2 mousemove_times : "[t1,t2,t3,...]" — values in MILLISECONDS since page load
Timestamps align index-for-index with m() events (clicks may not have a time entry).

We DO NOT assume a 1-to-1 correspondence between timestamps and events when the
counts differ. If len(timestamps) != len(move_events) we still extract spatial
features but flag speed-based features as UNRELIABLE (set to NaN).

Straightness Index
------------------
Defined as:
    straightness = straight_line_distance / total_path_length

- Ranges 0 → 1; value of 1 means perfectly straight (bot-like).
- If total_path_length == 0 we return NaN, not 0 (avoids misleading result).
- NOTE: Higher = more bot-like (opposite of some literature conventions).
"""

from __future__ import annotations

import json
import logging
import math
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)

# ── Event parsing ─────────────────────────────────────────────────────────────

_MOVE_RE  = re.compile(r"\[m\((-?\d+),(-?\d+)\)\]")
_CLICK_RE = re.compile(r"\[c\([lrm]\)\]")
_TS_RE    = re.compile(r"[\[\(](\d+(?:\.\d+)?)[\]\)]")

# Phase 2 viewport: "[(h,w)][(h,w)]..."
_VP_RE    = re.compile(r"\[\((\d+),(\d+)\)\]")

# Phase 2 visited URLs: "[url1][url2]..."
_URL_RE   = re.compile(r"\[([^\]]+)\]")


def _parse_move_events(behaviour: str) -> List[Tuple[int, int]]:
    """Extract list of (x, y) tuples from the event string."""
    return [(int(m.group(1)), int(m.group(2))) for m in _MOVE_RE.finditer(behaviour)]


def _parse_click_count(behaviour: str) -> int:
    return len(_CLICK_RE.findall(behaviour))


def _parse_timestamps(ts_str: str) -> List[float]:
    """
    Extract millisecond timestamps from the encoded timestamp string.

    Both Phase 1 and Phase 2 store timestamps as a plain comma-separated
    string with NO surrounding brackets:
        "199701829,199701832,199701847,..."   (Phase 1 — ms since page load origin)
        "1593975071137,1593975071228,..."     (Phase 2 — Unix epoch ms)

    The values align 1-for-1 with m() (move) events, NOT with click events.
    If a JSON array form is encountered it is also handled gracefully.
    """
    if not ts_str or ts_str.strip() in ("", "null", "[]", "null\r"):
        return []

    s = ts_str.strip()

    # Case 1: JSON array  e.g. "[123, 456, ...]"
    if s.startswith("["):
        try:
            vals = json.loads(s)
            if isinstance(vals, list):
                return [float(v) for v in vals if v is not None]
        except (json.JSONDecodeError, TypeError):
            pass

    # Case 2: plain comma-separated digits (Phase 1 and Phase 2 actual format).
    #
    # Phase 1  timestamps: 9–11 digit integers (ms since page-load origin)
    # Phase 2  timestamps: exactly 13 digit integers (Unix epoch ms)
    #
    # Phase 2 dataset artifact: ~18 per-session tokens are only 9 digits —
    # truncated epoch values from a session-boundary split inside the NDJSON.
    # These are discarded by the length filter below.
    s_clean = s.strip("[]() \t\r\n")
    parts = s_clean.split(",")
    result_9_11 = []   # Phase 1 candidate
    result_13   = []   # Phase 2 candidate
    for p in parts:
        p = p.strip()
        if not p or not p.isdigit():
            continue
        length = len(p)
        if 9 <= length <= 11:
            result_9_11.append(float(p))
        elif length == 13:
            result_13.append(float(p))
        # else: discard (corrupt / truncated)

    # Prefer 13-digit (Phase 2 epoch ms) if both are present, otherwise use whichever exists
    if result_13:
        return result_13
    if result_9_11:
        return result_9_11

    # Case 3: fallback bracket-delimited  "[t1][t2]..."
    return [float(m.group(1)) for m in _TS_RE.finditer(ts_str)]


def _parse_viewport(vp_str: str) -> List[Tuple[int, int]]:
    """Extract list of (height, width) tuples from viewport string."""
    return [(int(m.group(1)), int(m.group(2))) for m in _VP_RE.finditer(vp_str)]


def _parse_visited_urls(url_str: str) -> List[str]:
    """Extract visited URLs from the encoded URL string."""
    if not url_str or url_str.strip() in ("", "null"):
        return []
    return [m.group(1).strip() for m in _URL_RE.finditer(url_str) if m.group(1).strip()]


# ── Kinematic feature computation ─────────────────────────────────────────────

def compute_mouse_features(
    points: List[Tuple[int, int]],
    timestamps_ms: List[float],
    click_count: int,
) -> Dict:
    """
    Compute session-level kinematic features from mouse move events.

    Parameters
    ----------
    points        : list of (x, y) pixel coordinates (m() events only)
    timestamps_ms : list of millisecond timestamps aligned to points
                    (may be empty or mismatched in length → speed = NaN)
    click_count   : number of click events

    Returns
    -------
    dict of feature_name → numeric value (NaN where not calculable)
    """
    n_moves = len(points)

    if n_moves == 0:
        return _empty_mouse_features()

    # ── Step distances ───────────────────────────────────────────────────────
    distances = []
    for i in range(1, n_moves):
        dx = points[i][0] - points[i-1][0]
        dy = points[i][1] - points[i-1][1]
        distances.append(math.hypot(dx, dy))

    total_path_length = sum(distances)

    # ── Straightness index ───────────────────────────────────────────────────
    # straight_line = distance from first to last point
    dx_total = points[-1][0] - points[0][0]
    dy_total = points[-1][1] - points[0][1]
    straight_line = math.hypot(dx_total, dy_total)

    if total_path_length > 0:
        straightness = straight_line / total_path_length
    else:
        straightness = float("nan")     # only one point, can't define straightness

    # ── Step distance stats ──────────────────────────────────────────────────
    if distances:
        dist_arr    = np.array(distances, dtype=float)
        dist_mean   = float(np.mean(dist_arr))
        dist_std    = float(np.std(dist_arr))
        dist_min    = float(np.min(dist_arr))
        dist_max    = float(np.max(dist_arr))
    else:
        dist_mean = dist_std = dist_min = dist_max = float("nan")

    # ── Direction changes ────────────────────────────────────────────────────
    direction_changes = 0
    if n_moves >= 3:
        angles = []
        for i in range(1, n_moves):
            dx = points[i][0] - points[i-1][0]
            dy = points[i][1] - points[i-1][1]
            if dx != 0 or dy != 0:
                angles.append(math.atan2(dy, dx))

        for i in range(1, len(angles)):
            diff = abs(angles[i] - angles[i-1])
            if diff > math.pi:
                diff = 2 * math.pi - diff
            if diff > math.pi / 6:   # > 30° counts as a direction change
                direction_changes += 1

    dir_change_rate = direction_changes / n_moves if n_moves > 0 else 0.0

    # ── Speed features ───────────────────────────────────────────────────────
    # Only computed when timestamps are available AND count matches points
    timestamps_reliable = (
        len(timestamps_ms) >= 2
        and len(timestamps_ms) == n_moves
    )

    if timestamps_reliable:
        time_diffs_ms  = np.diff(np.array(timestamps_ms, dtype=float))
        # Convert ms → s and avoid division by zero
        time_diffs_s   = np.where(time_diffs_ms > 0, time_diffs_ms / 1000.0, np.nan)
        dist_arr2      = np.array(distances, dtype=float)
        # speed in pixels/second
        speeds         = np.where(
            ~np.isnan(time_diffs_s),
            dist_arr2 / time_diffs_s,
            np.nan
        )
        valid_speeds   = speeds[~np.isnan(speeds)]
        speed_mean     = float(np.nanmean(valid_speeds)) if len(valid_speeds) > 0 else float("nan")
        speed_std      = float(np.nanstd(valid_speeds))  if len(valid_speeds) > 1 else float("nan")
        speed_max      = float(np.nanmax(valid_speeds))  if len(valid_speeds) > 0 else float("nan")
    else:
        speed_mean = speed_std = speed_max = float("nan")

    # ── Click ratio ──────────────────────────────────────────────────────────
    total_events = n_moves + click_count
    click_to_move_ratio = click_count / n_moves if n_moves > 0 else float("nan")

    return {
        # presence
        "mouse_has_data":           1,
        # counts
        "mouse_total_moves":        n_moves,
        "mouse_total_clicks":       click_count,
        "mouse_total_events":       total_events,
        "mouse_click_to_move":      click_to_move_ratio,
        # path geometry
        "mouse_total_path_px":      total_path_length,
        "mouse_straight_line_px":   straight_line,
        "mouse_straightness":       straightness,          # 1=straight=bot-like
        # step distances
        "mouse_dist_mean":          dist_mean,
        "mouse_dist_std":           dist_std,
        "mouse_dist_min":           dist_min,
        "mouse_dist_max":           dist_max,
        # direction
        "mouse_direction_changes":  direction_changes,
        "mouse_dir_change_rate":    dir_change_rate,
        # speed (NaN if timestamps unreliable)
        "mouse_speed_mean_px_s":    speed_mean,
        "mouse_speed_std_px_s":     speed_std,
        "mouse_speed_max_px_s":     speed_max,
        "mouse_speed_reliable":     int(timestamps_reliable),
    }


def _empty_mouse_features() -> Dict:
    """Return NaN-filled mouse feature dict for sessions with no mouse data."""
    keys = [
        "mouse_has_data", "mouse_total_moves", "mouse_total_clicks",
        "mouse_total_events", "mouse_click_to_move",
        "mouse_total_path_px", "mouse_straight_line_px", "mouse_straightness",
        "mouse_dist_mean", "mouse_dist_std", "mouse_dist_min", "mouse_dist_max",
        "mouse_direction_changes", "mouse_dir_change_rate",
        "mouse_speed_mean_px_s", "mouse_speed_std_px_s", "mouse_speed_max_px_s",
        "mouse_speed_reliable",
    ]
    result = {k: float("nan") for k in keys}
    result["mouse_has_data"]       = 0
    result["mouse_speed_reliable"] = 0
    return result


# ── Viewport features (Phase 2 only) ─────────────────────────────────────────

def compute_viewport_features(vp_str: str) -> Dict:
    """
    Extract viewport (browser window size) features from Phase 2 data.
    Returns zeroed dict if string is empty or unparseable.
    """
    viewports = _parse_viewport(vp_str)
    if not viewports:
        return {
            "vp_height_modal":    float("nan"),
            "vp_width_modal":     float("nan"),
            "vp_change_count":    float("nan"),
            "vp_is_uniform":      float("nan"),
        }

    heights = [v[0] for v in viewports]
    widths  = [v[1] for v in viewports]

    # Modal (most frequent) viewport size
    from collections import Counter
    modal_pair = Counter(viewports).most_common(1)[0][0]

    # Number of distinct sizes → proxy for page-to-page scrolling/resizing
    distinct_sizes = len(set(viewports))
    change_count   = distinct_sizes - 1   # transitions between distinct sizes

    # Bots often keep the viewport perfectly uniform (all same dimensions)
    is_uniform = int(distinct_sizes == 1)

    return {
        "vp_height_modal":    float(modal_pair[0]),
        "vp_width_modal":     float(modal_pair[1]),
        "vp_change_count":    float(change_count),
        "vp_is_uniform":      float(is_uniform),
    }


# ── Navigation features (Phase 2 only) ───────────────────────────────────────

def compute_navigation_features(url_str: str) -> Dict:
    """
    Extract URL navigation features from Phase 2 mousemove_visited_urls.
    """
    if not url_str or url_str.strip() in ("", "null"):
        return {
            "nav_total_url_visits":    float("nan"),
            "nav_unique_urls":         float("nan"),
            "nav_repetition_ratio":    float("nan"),
            "nav_max_repetitions":     float("nan"),
            "nav_url_entropy":         float("nan"),
            "nav_unique_categories":   float("nan"),
        }

    urls = _parse_visited_urls(url_str)
    if not urls:
        return {
            "nav_total_url_visits":    0.0,
            "nav_unique_urls":         0.0,
            "nav_repetition_ratio":    float("nan"),
            "nav_max_repetitions":     0.0,
            "nav_url_entropy":         float("nan"),
            "nav_unique_categories":   0.0,
        }

    from collections import Counter
    url_counts  = Counter(urls)
    total       = len(urls)
    unique      = len(url_counts)
    max_rep     = max(url_counts.values())
    repeated    = sum(1 for c in url_counts.values() if c > 1)
    rep_ratio   = repeated / unique if unique > 0 else float("nan")

    # Shannon entropy of URL distribution
    probs    = np.array(list(url_counts.values()), dtype=float) / total
    entropy  = float(-np.sum(probs * np.log2(probs + 1e-12)))

    # Content categories: extract path segment after /content/
    cat_re = re.compile(r"/content/([^/]+)")
    categories = set()
    for url in urls:
        m = cat_re.search(url)
        if m:
            categories.add(m.group(1))

    return {
        "nav_total_url_visits":    float(total),
        "nav_unique_urls":         float(unique),
        "nav_repetition_ratio":    rep_ratio,
        "nav_max_repetitions":     float(max_rep),
        "nav_url_entropy":         entropy,
        "nav_unique_categories":   float(len(categories)),
    }


# ── Phase 1 loader ────────────────────────────────────────────────────────────

def load_phase1_mouse_features(mouse_root: Path) -> Dict[str, Dict]:
    """
    Walk every session folder under mouse_root (which covers both
    humans_and_advanced_bots and humans_and_moderate_bots).

    Returns: { session_id → feature_dict }

    When the same session_id appears in both subdirectories (the 50 shared
    human sessions) we process both but store only once — the data is identical
    since it's the same session.
    """
    results: Dict[str, Dict] = {}
    experiment_dirs = [d for d in mouse_root.iterdir() if d.is_dir()]

    for exp_dir in sorted(experiment_dirs):
        for session_dir in sorted(exp_dir.iterdir()):
            if not session_dir.is_dir():
                continue
            session_id  = session_dir.name
            json_file   = session_dir / "mouse_movements.json"

            if not json_file.exists():
                logger.warning("No mouse_movements.json in %s", session_dir)
                continue

            if session_id in results:
                continue   # already processed (shared human session)

            try:
                with open(json_file, "r", encoding="utf-8", errors="replace") as fh:
                    data = json.load(fh)
            except (json.JSONDecodeError, OSError) as exc:
                logger.warning("Failed to parse %s: %s", json_file, exc)
                results[session_id] = _empty_mouse_features()
                results[session_id]["session_id"] = session_id
                continue

            # Phase 1 uses 'total_behaviour' (some files also have 'mousemove_total_behaviour')
            behaviour = data.get("total_behaviour") or data.get("mousemove_total_behaviour", "")
            ts_raw    = data.get("mousemove_times", "")

            points     = _parse_move_events(behaviour)
            clicks     = _parse_click_count(behaviour)
            timestamps = _parse_timestamps(ts_raw)

            feats = compute_mouse_features(points, timestamps, clicks)
            feats["session_id"] = session_id
            results[session_id] = feats

    logger.info("Phase 1: loaded mouse features for %d sessions", len(results))
    return results


# ── Phase 2 loader ────────────────────────────────────────────────────────────

def load_phase2_mouse_features(
    human_json: Path,
    adv_bot_json: Path,
    mod_bot_json: Path,
) -> Dict[str, Dict]:
    """
    Load all Phase 2 NDJSON mouse movement files.
    Returns: { session_id → feature_dict }
    Each line in the file is one complete JSON record (NDJSON format).
    """
    results: Dict[str, Dict] = {}

    source_map = {
        "human":        human_json,
        "advanced_bot": adv_bot_json,
        "moderate_bot": mod_bot_json,
    }

    for source_label, fpath in source_map.items():
        if not fpath.exists():
            logger.error("Missing Phase 2 mouse file: %s", fpath)
            continue

        with open(fpath, "r", encoding="utf-8", errors="replace") as fh:
            for lineno, raw_line in enumerate(fh, start=1):
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    data = json.loads(line)
                except json.JSONDecodeError as exc:
                    logger.warning(
                        "%s line %d: JSON parse error: %s — skipped",
                        fpath.name, lineno, exc
                    )
                    continue

                session_id = data.get("session_id", "")
                if not session_id:
                    logger.warning("%s line %d: missing session_id", fpath.name, lineno)
                    continue

                if session_id in results:
                    continue  # deduplicate

                behaviour = data.get("mousemove_total_behaviour", "")
                ts_raw    = data.get("mousemove_times", "")
                vp_raw    = data.get("mousemove_client_height_width", "")
                url_raw   = data.get("mousemove_visited_urls", "")

                points     = _parse_move_events(behaviour)
                clicks     = _parse_click_count(behaviour)
                timestamps = _parse_timestamps(ts_raw)

                feats = compute_mouse_features(points, timestamps, clicks)
                feats.update(compute_viewport_features(vp_raw))
                feats.update(compute_navigation_features(url_raw))
                feats["session_id"] = session_id

                results[session_id] = feats

        logger.info("Phase 2 [%s]: loaded %d sessions from %s", source_label, lineno, fpath.name)

    logger.info("Phase 2: total unique mouse sessions loaded: %d", len(results))
    return results

