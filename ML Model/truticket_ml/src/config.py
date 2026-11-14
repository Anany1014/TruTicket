"""
TruTicket ML — Configuration
Centralised paths and constants. Import this everywhere else.
"""
from pathlib import Path

# ── Root paths ─────────────────────────────────────────────────────────────
PROJECT_ROOT   = Path(__file__).resolve().parent.parent
DATASET_ROOT   = PROJECT_ROOT.parent / "web_detection_bot"

# ── Phase 1 paths ───────────────────────────────────────────────────────────
P1_ROOT        = DATASET_ROOT / "phase1"
P1_ANNOT       = P1_ROOT / "annotations"
P1_MOUSE       = P1_ROOT / "data" / "mouse_movements"
P1_LOGS        = P1_ROOT / "data" / "web_logs"

P1_ADV_TRAIN   = P1_ANNOT / "humans_and_advanced_bots"  / "train"
P1_ADV_TEST    = P1_ANNOT / "humans_and_advanced_bots"  / "test"
P1_MOD_TRAIN   = P1_ANNOT / "humans_and_moderate_bots"  / "train"
P1_MOD_TEST    = P1_ANNOT / "humans_and_moderate_bots"  / "test"

P1_MOUSE_ADV   = P1_MOUSE / "humans_and_advanced_bots"
P1_MOUSE_MOD   = P1_MOUSE / "humans_and_moderate_bots"

P1_LOG_ADV_BOT = P1_LOGS / "bots" / "access_advanced_bots.log"
P1_LOG_MOD_BOT = P1_LOGS / "bots" / "access_moderate_bots.log"
P1_LOG_HUMAN   = P1_LOGS / "humans"   # directory — 5 files inside

# ── Phase 2 paths ───────────────────────────────────────────────────────────
P2_ROOT        = DATASET_ROOT / "phase2"
P2_ANNOT       = P2_ROOT / "annotations"
P2_MOUSE       = P2_ROOT / "data" / "mouse_movements"
P2_LOGS        = P2_ROOT / "data" / "web_logs"

P2_ANNOTATION  = P2_ANNOT / "humans_and_moderate_and_advanced_bots" / "humans_and_moderate_and_advanced_bots"

P2_MOUSE_HUM   = P2_MOUSE / "humans" / "mouse_movements_humans.json"
P2_MOUSE_ADV   = P2_MOUSE / "bots"   / "mouse_movements_advanced_bots.json"
P2_MOUSE_MOD   = P2_MOUSE / "bots"   / "mouse_movements_moderate_bots.json"

P2_LOG_BOT     = P2_LOGS / "bots" / "access_moderate_and_advanced_bots.log"
P2_LOG_HUMAN   = P2_LOGS / "humans"   # directory — 50 files inside

# ── Output paths ─────────────────────────────────────────────────────────────
DATA_DIR        = PROJECT_ROOT / "data"
PROCESSED_DIR   = DATA_DIR / "processed"
FEATURES_DIR    = DATA_DIR / "features"
MODELS_DIR      = PROJECT_ROOT / "models"

# Ensure output directories exist
for d in [PROCESSED_DIR, FEATURES_DIR, MODELS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ── Label mapping ─────────────────────────────────────────────────────────────
LABEL_MAP = {
    "human":        0,
    "moderate_bot": 1,
    "advanced_bot": 2,
}
LABEL_NAMES = {v: k for k, v in LABEL_MAP.items()}

# Binary mapping (human=0, any bot=1)
BINARY_LABEL_MAP = {
    "human":        0,
    "moderate_bot": 1,
    "advanced_bot": 1,
}

# ── Risk score bands ──────────────────────────────────────────────────────────
RISK_BANDS = [
    (0,  30,  "LOW"),
    (31, 59,  "MEDIUM"),
    (60, 79,  "HIGH"),
    (80, 100, "CRITICAL"),
]

def score_to_band(score: float) -> str:
    """Convert a 0-100 risk score to a named risk band."""
    for lo, hi, band in RISK_BANDS:
        if lo <= score <= hi:
            return band
    return "HIGH"

