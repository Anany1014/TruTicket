"""
rules_engine.py
===============
Deterministic behavioral rule evaluator for TruTicket Bot & Fraud Detection.

Strictly follows:
- Thresholds derived and validated on Phase 1 training data ONLY.
- Rules do not blindly hard-block sessions without strong multi-signal evidence.
- Safely handles None / NaN / missing values from API payloads.
- Explanations are mapped to standard PRD reason_codes.
"""

from typing import Dict, List, Tuple, Any
import numpy as np

RULE_DEFINITIONS = [
    {
        "code": "MECHANICAL_DIRECTION_CHANGES",
        "description": "Mouse direction change rate is abnormally low (< 0.06), indicating mechanical straight-line waypoint interpolation typical of advanced bot scripts.",
        "weight": 25.0
    },
    {
        "code": "UNNATURAL_SPEED_UNIFORMITY",
        "description": "Mouse speed standard deviation is abnormally low (< 450 px/s), indicating synthetic uniform movement lacking human motor deceleration.",
        "weight": 25.0
    },
    {
        "code": "HIGH_PATH_STRAIGHTNESS",
        "description": "Mouse straightness index exceeds natural human range (> 0.025), indicating direct target pathing or synthetic motion.",
        "weight": 20.0
    },
    {
        "code": "MICRO_STEP_JITTER",
        "description": "Average mouse movement distance is unnaturally small (< 3.0 px), characteristic of automated cursor jitter/polling scripts.",
        "weight": 25.0
    },
    {
        "code": "ABNORMAL_DIRECTION_JITTER",
        "description": "Mouse direction change rate is unnaturally erratic (> 0.25), characteristic of robotic jitter scripts.",
        "weight": 20.0
    },
    {
        "code": "HIGH_REQUEST_VELOCITY",
        "description": "HTTP request rate exceeds normal navigation cadence (> 1.8 requests/sec).",
        "weight": 15.0
    },
    {
        "code": "MISSING_MOUSE_DATA",
        "description": "Session contains zero recorded mouse movement events, characteristic of headless browsers or API scrape scripts.",
        "weight": 35.0
    }
]

def _safe_float(val: Any) -> float:
    """Helper to convert value safely to float; returns np.nan if None, invalid, or NaN."""
    if val is None:
        return np.nan
    try:
        f = float(val)
        return f if not np.isnan(f) else np.nan
    except (ValueError, TypeError):
        return np.nan

def evaluate_rules(session_features: Dict) -> Tuple[float, List[str], List[Dict]]:
    """
    Evaluate deterministic behavioural rules against a dictionary of session features.
    
    Returns:
    --------
    rule_score_delta : float
        Cumulative additive score delta from triggered rules (capped at 50.0).
    reason_codes : List[str]
        List of unique triggered reason code strings.
    triggered_details : List[Dict]
        Detailed info about triggered rules.
    """
    triggered_codes = []
    triggered_details = []
    score_delta = 0.0

    total_moves = _safe_float(session_features.get("mouse_total_moves"))
    if np.isnan(total_moves):
        total_moves = 0.0

    # Rule 1: Mechanical direction changes
    rate = _safe_float(session_features.get("mouse_dir_change_rate"))
    if not np.isnan(rate) and rate < 0.06 and total_moves > 100:
        triggered_codes.append("MECHANICAL_DIRECTION_CHANGES")
        score_delta += 25.0
        triggered_details.append({
            "code": "MECHANICAL_DIRECTION_CHANGES",
            "metric": "mouse_dir_change_rate",
            "value": float(rate),
            "threshold": "< 0.06"
        })

    # Rule 2: Unnatural speed uniformity (only when timestamps are reliable)
    speed_std = _safe_float(session_features.get("mouse_speed_std_px_s"))
    speed_reliable = _safe_float(session_features.get("mouse_speed_reliable"))
    if speed_reliable == 1.0 and not np.isnan(speed_std) and speed_std < 450.0:
        triggered_codes.append("UNNATURAL_SPEED_UNIFORMITY")
        score_delta += 25.0
        triggered_details.append({
            "code": "UNNATURAL_SPEED_UNIFORMITY",
            "metric": "mouse_speed_std_px_s",
            "value": float(speed_std),
            "threshold": "< 450.0 px/s"
        })

    # Rule 3: High path straightness
    straightness = _safe_float(session_features.get("mouse_straightness"))
    if not np.isnan(straightness) and straightness > 0.025:
        triggered_codes.append("HIGH_PATH_STRAIGHTNESS")
        score_delta += 20.0
        triggered_details.append({
            "code": "HIGH_PATH_STRAIGHTNESS",
            "metric": "mouse_straightness",
            "value": float(straightness),
            "threshold": "> 0.025"
        })

    # Rule 4: Micro-step jitter
    dist_mean = _safe_float(session_features.get("mouse_dist_mean"))
    if not np.isnan(dist_mean) and dist_mean < 3.0:
        triggered_codes.append("MICRO_STEP_JITTER")
        score_delta += 25.0
        triggered_details.append({
            "code": "MICRO_STEP_JITTER",
            "metric": "mouse_dist_mean",
            "value": float(dist_mean),
            "threshold": "< 3.0 px"
        })

    # Rule 5: Abnormal direction jitter
    if not np.isnan(rate) and rate > 0.25:
        triggered_codes.append("ABNORMAL_DIRECTION_JITTER")
        score_delta += 20.0
        triggered_details.append({
            "code": "ABNORMAL_DIRECTION_JITTER",
            "metric": "mouse_dir_change_rate",
            "value": float(rate),
            "threshold": "> 0.25"
        })

    # Rule 6: High request velocity
    rps = _safe_float(session_features.get("log_requests_per_second"))
    if not np.isnan(rps) and rps > 1.8:
        triggered_codes.append("HIGH_REQUEST_VELOCITY")
        score_delta += 15.0
        triggered_details.append({
            "code": "HIGH_REQUEST_VELOCITY",
            "metric": "log_requests_per_second",
            "value": float(rps),
            "threshold": "> 1.8 req/s"
        })

    # Rule 7: Missing mouse movement
    has_mouse = _safe_float(session_features.get("mouse_has_data"))
    if (not np.isnan(has_mouse) and has_mouse == 0.0) or total_moves == 0.0:
        triggered_codes.append("MISSING_MOUSE_DATA")
        score_delta += 35.0
        triggered_details.append({
            "code": "MISSING_MOUSE_DATA",
            "metric": "mouse_total_moves",
            "value": 0,
            "threshold": "== 0"
        })

    # Cap maximum rule delta to 50.0 to prevent a single rule from overwhelming the probabilistic model
    capped_delta = min(score_delta, 50.0)
    return capped_delta, triggered_codes, triggered_details
