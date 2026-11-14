"""
run_pipeline.py
===============
Main entry point. Runs the full feature-engineering pipeline for
Phase 1 and Phase 2, saves CSVs, and writes the validation report.

Usage:
    cd truticket_ml
    python src/run_pipeline.py

Outputs:
    data/features/phase1_train.csv
    data/features/phase1_test.csv
    data/features/phase2_all.csv
    reports/feature_engineering_report.md
"""

from __future__ import annotations

import logging
import sys
from pathlib import Path

# ── Make src/ importable when run from project root or src/ ─────────────────
SRC_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SRC_DIR))

import pandas as pd

from feature_engineering import build_phase1_features, build_phase2_features
from validate_features    import run_validation

# ── Logging setup ─────────────────────────────────────────────────────────────
logging.basicConfig(
    level    = logging.INFO,
    format   = "%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
    datefmt  = "%H:%M:%S",
    handlers = [
        logging.StreamHandler(sys.stdout),
    ],
)
logger = logging.getLogger("run_pipeline")

# ── Project paths ─────────────────────────────────────────────────────────────
PROJECT_ROOT = SRC_DIR.parent
DATASET_ROOT = PROJECT_ROOT.parent / "web_detection_bot"

# Phase 1
P1 = DATASET_ROOT / "phase1"
P1_ANNOT_ROOT  = P1 / "annotations"
P1_MOUSE_ROOT  = P1 / "data" / "mouse_movements"
P1_LOG_ADV_BOT = P1 / "data" / "web_logs" / "bots"  / "access_advanced_bots.log"
P1_LOG_MOD_BOT = P1 / "data" / "web_logs" / "bots"  / "access_moderate_bots.log"
P1_LOG_HUMAN   = P1 / "data" / "web_logs" / "humans"

# Phase 2
P2 = DATASET_ROOT / "phase2"
P2_ANNOT_ROOT  = P2 / "annotations"
P2_MOUSE_HUM   = P2 / "data" / "mouse_movements" / "humans" / "mouse_movements_humans.json"
P2_MOUSE_ADV   = P2 / "data" / "mouse_movements" / "bots"   / "mouse_movements_advanced_bots.json"
P2_MOUSE_MOD   = P2 / "data" / "mouse_movements" / "bots"   / "mouse_movements_moderate_bots.json"
P2_LOG_BOT     = P2 / "data" / "web_logs" / "bots"   / "access_moderate_and_advanced_bots.log"
P2_LOG_HUMAN   = P2 / "data" / "web_logs" / "humans"

# Output
FEATURES_DIR = PROJECT_ROOT / "data" / "features"
REPORTS_DIR  = PROJECT_ROOT / "reports"

for d in [FEATURES_DIR, REPORTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)


def main() -> None:
    logger.info("TruTicket Feature Engineering Pipeline starting …")
    logger.info("Dataset root: %s", DATASET_ROOT)

    # ── Phase 1 ──────────────────────────────────────────────────────────────
    df_train, df_test = build_phase1_features(
        annot_root   = P1_ANNOT_ROOT,
        mouse_root   = P1_MOUSE_ROOT,
        log_bots_adv = P1_LOG_ADV_BOT,
        log_bots_mod = P1_LOG_MOD_BOT,
        log_humans   = P1_LOG_HUMAN,
    )

    out_train = FEATURES_DIR / "phase1_train.csv"
    out_test  = FEATURES_DIR / "phase1_test.csv"
    df_train.to_csv(out_train, index=False)
    df_test.to_csv(out_test,   index=False)
    logger.info("Saved → %s  (%d rows)", out_train.name, len(df_train))
    logger.info("Saved → %s  (%d rows)", out_test.name,  len(df_test))

    # ── Phase 2 ──────────────────────────────────────────────────────────────
    df_phase2 = build_phase2_features(
        annot_root  = P2_ANNOT_ROOT,
        mouse_human = P2_MOUSE_HUM,
        mouse_adv   = P2_MOUSE_ADV,
        mouse_mod   = P2_MOUSE_MOD,
        log_bots    = P2_LOG_BOT,
        log_humans  = P2_LOG_HUMAN,
    )

    out_p2 = FEATURES_DIR / "phase2_all.csv"
    df_phase2.to_csv(out_p2, index=False)
    logger.info("Saved → %s  (%d rows)", out_p2.name, len(df_phase2))

    # ── Validation ───────────────────────────────────────────────────────────
    report_path = REPORTS_DIR / "feature_engineering_report.md"
    summary = run_validation(
        df_train   = df_train,
        df_test    = df_test,
        df_phase2  = df_phase2,
        report_path = report_path,
    )

    # ── Print final summary to console ───────────────────────────────────────
    logger.info("")
    logger.info("=" * 60)
    logger.info("PIPELINE COMPLETE")
    logger.info("=" * 60)
    logger.info("Phase 1 TRAIN : %d rows | labels: %s",
                len(df_train), df_train["label"].value_counts().to_dict())
    logger.info("Phase 1 TEST  : %d rows | labels: %s",
                len(df_test),  df_test["label"].value_counts().to_dict())
    logger.info("Phase 2 ALL   : %d rows | labels: %s",
                len(df_phase2), df_phase2["label"].value_counts().to_dict())
    logger.info("")
    logger.info("Phase 1 TRAIN mouse coverage : %.1f%%",
                summary.get("phase1_train", {}).get("mouse_data_pct", 0))
    logger.info("Phase 1 TRAIN log coverage   : %.1f%%",
                summary.get("phase1_train", {}).get("log_data_pct", 0))
    logger.info("Phase 1 TEST  mouse coverage : %.1f%%",
                summary.get("phase1_test", {}).get("mouse_data_pct", 0))
    logger.info("Phase 1 TEST  log coverage   : %.1f%%",
                summary.get("phase1_test", {}).get("log_data_pct", 0))
    logger.info("")
    logger.info("Phase 1 leakage sessions     : %d",
                summary.get("phase1_leakage_count", -1))
    logger.info("")
    logger.info("Report saved  : %s", report_path)
    logger.info("CSVs saved    : %s", FEATURES_DIR)

    # Quick peek at feature columns
    logger.info("")
    logger.info("Sample Phase 1 TRAIN columns (%d total):", len(df_train.columns))
    logger.info("  %s", list(df_train.columns))

    # Return exit code
    leakage = summary.get("phase1_leakage_count", 0)
    if leakage > 0:
        logger.error("PIPELINE FAILED: %d leaking session(s) detected!", leakage)
        sys.exit(1)
    else:
        logger.info("All checks passed.")
        sys.exit(0)


if __name__ == "__main__":
    main()

