"""
feature_engineering.py
=======================
Orchestrates the full feature-engineering pipeline for Phase 1 and Phase 2.

What this module does
---------------------
1. Loads annotations (labels).
2. Loads mouse-movement features.
3. Loads web-log features.
4. Joins all three by session_id.
5. Handles missing data with explicit flags (not imputation).
6. Preserves Phase 1 official train/test splits.
7. Keeps Phase 2 unsplit (split created later to avoid leakage).
8. Saves output CSVs to data/features/.

Join strategy
-------------
Left join on annotations:
  annotations  (ground truth)  ← left table
  mouse features               ← joined by session_id
  log features                 ← joined by session_id

Sessions that have annotations but no mouse or log data get
NaN for those feature groups + a flag column set to 0.

Phase 1 de-duplication
-----------------------
50 human sessions appear in BOTH experiment folders.
We keep ONE row per session_id in the final feature table.
The `experiment` column in annotations is *not* carried forward to the
feature table (the same session cannot be in both train and test for a
different experiment; we keep the advanced-bots split as the primary one
for those humans, since that is experiment 1).

Phase 2 sub-session handling
-----------------------------
Annotation IDs like `base_id_0` and `base_id_1` share one mouse record
(keyed by `base_id`).  We join on base session_id.  Both sub-sessions
share the same mouse features; they will differ only in log features if
the logs capture sub-session behaviour separately.

For Phase 2 we keep ALL sub-sessions as separate rows (they may have
different log-level behaviour) and store `sub_index` for reference.

Output schema
-------------
Columns: session_id, sub_index, label, label_int, binary_label, split,
         phase, [log features], [mouse features], [viewport features*],
         [navigation features*], log_has_data, mouse_has_data

(* Phase 2 only)
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Dict, Tuple

import pandas as pd
import numpy as np

from parse_annotations import (
    load_phase1_annotations,
    load_phase2_annotations,
    check_duplicate_sessions,
)
from parse_mouse import (
    load_phase1_mouse_features,
    load_phase2_mouse_features,
)
from parse_logs import (
    parse_log_file,
    parse_log_directory,
    parse_log_files,
    build_session_index,
    extract_log_features,
    _empty_log_features,
)

logger = logging.getLogger(__name__)


# ── Main pipeline entry points ────────────────────────────────────────────────

def build_phase1_features(
    annot_root:  Path,
    mouse_root:  Path,
    log_bots_adv: Path,
    log_bots_mod: Path,
    log_humans:  Path,
) -> Tuple[pd.DataFrame, pd.DataFrame]:
    """
    Build Phase 1 feature dataset.

    Returns
    -------
    df_train : feature DataFrame, official training rows
    df_test  : feature DataFrame, official test rows
    """
    logger.info("=" * 60)
    logger.info("PHASE 1 — Feature Engineering")
    logger.info("=" * 60)

    # ── 1. Annotations ───────────────────────────────────────────────────────
    ann = load_phase1_annotations(annot_root)
    _check_and_log_duplicates(ann, "Phase 1")

    # Deduplicate: keep one row per session_id.
    # Priority order: humans_and_advanced_bots (experiment 1) > humans_and_moderate_bots
    # Within each experiment the split is already set; we keep the first occurrence
    # which, after sorting, comes from humans_and_advanced_bots (alphabetically first).
    ann_dedup = (
        ann
        .sort_values("experiment")                        # adv < mod alphabetically
        .drop_duplicates(subset=["session_id"], keep="first")
        .reset_index(drop=True)
    )
    logger.info(
        "Phase 1 annotations: %d total → %d after deduplication",
        len(ann), len(ann_dedup),
    )

    # ── 2. Mouse features ────────────────────────────────────────────────────
    logger.info("Loading Phase 1 mouse movement features …")
    mouse_feats = load_phase1_mouse_features(mouse_root)   # dict: sid → feature_dict
    mouse_df    = _dict_to_df(mouse_feats)

    # ── 3. Log features ──────────────────────────────────────────────────────
    logger.info("Parsing Phase 1 web logs …")
    all_rows = []
    for p in [log_bots_adv, log_bots_mod]:
        if p.exists():
            all_rows.extend(parse_log_file(p))
        else:
            logger.warning("Missing bot log: %s", p)

    if log_humans.exists() and log_humans.is_dir():
        all_rows.extend(parse_log_directory(log_humans))
    elif log_humans.exists():
        all_rows.extend(parse_log_file(log_humans))
    else:
        logger.warning("Missing human log path: %s", log_humans)

    log_idx   = build_session_index(all_rows)
    log_df    = _build_log_df(log_idx)

    # ── 4. Join ──────────────────────────────────────────────────────────────
    df = _join_all(ann_dedup, mouse_df, log_df)
    df["phase"] = 1

    # ── 5. Split on official annotation split ────────────────────────────────
    df_train = df[df["split"] == "train"].copy().reset_index(drop=True)
    df_test  = df[df["split"] == "test"].copy().reset_index(drop=True)

    logger.info(
        "Phase 1 final: train=%d rows, test=%d rows", len(df_train), len(df_test)
    )
    _log_label_distribution(df_train, "Phase 1 TRAIN")
    _log_label_distribution(df_test,  "Phase 1 TEST")

    return df_train, df_test


def build_phase2_features(
    annot_root:    Path,
    mouse_human:   Path,
    mouse_adv:     Path,
    mouse_mod:     Path,
    log_bots:      Path,
    log_humans:    Path,
) -> pd.DataFrame:
    """
    Build Phase 2 feature dataset (unsplit — no train/test yet).

    Returns
    -------
    df : feature DataFrame with all Phase 2 annotated sessions
    """
    logger.info("=" * 60)
    logger.info("PHASE 2 — Feature Engineering")
    logger.info("=" * 60)

    # ── 1. Annotations ───────────────────────────────────────────────────────
    ann = load_phase2_annotations(annot_root)
    _check_and_log_duplicates(ann, "Phase 2")

    # Phase 2: keep all sub-session rows (each has a different sub_index)
    # but sort stably so that _0 comes before _1 for the same base session.
    ann_sorted = ann.sort_values(["session_id", "sub_index"]).reset_index(drop=True)
    logger.info("Phase 2 annotations: %d sub-session rows", len(ann_sorted))

    # ── 2. Mouse features ────────────────────────────────────────────────────
    logger.info("Loading Phase 2 mouse movement features …")
    mouse_feats = load_phase2_mouse_features(mouse_human, mouse_adv, mouse_mod)
    mouse_df    = _dict_to_df(mouse_feats)

    # ── 3. Log features ──────────────────────────────────────────────────────
    logger.info("Parsing Phase 2 web logs …")
    all_rows = []
    if log_bots.exists():
        all_rows.extend(parse_log_file(log_bots))
    else:
        logger.warning("Missing Phase 2 bot log: %s", log_bots)

    if log_humans.exists() and log_humans.is_dir():
        all_rows.extend(parse_log_directory(log_humans))
    else:
        logger.warning("Missing Phase 2 human log directory: %s", log_humans)

    log_idx = build_session_index(all_rows)
    log_df  = _build_log_df(log_idx)

    # ── 4. Join ──────────────────────────────────────────────────────────────
    df = _join_all(ann_sorted, mouse_df, log_df)
    df["phase"] = 2

    logger.info("Phase 2 final: %d rows (unsplit)", len(df))
    _log_label_distribution(df, "Phase 2 ALL")

    return df


# ── Internal helpers ──────────────────────────────────────────────────────────

def _dict_to_df(feature_dict: Dict[str, Dict]) -> pd.DataFrame:
    """Convert { session_id → feature_dict } to a DataFrame."""
    if not feature_dict:
        return pd.DataFrame()
    rows = list(feature_dict.values())
    return pd.DataFrame(rows)


def _build_log_df(log_idx: Dict) -> pd.DataFrame:
    """Extract log features for every session in the index."""
    records = []
    for sid, rows in log_idx.items():
        feats = extract_log_features(rows)
        feats["session_id"]    = sid
        feats["log_has_data"]  = 1
        records.append(feats)

    if not records:
        return pd.DataFrame()
    return pd.DataFrame(records)


def _join_all(
    ann:      pd.DataFrame,
    mouse_df: pd.DataFrame,
    log_df:   pd.DataFrame,
) -> pd.DataFrame:
    """
    Left-join annotations ← mouse features ← log features.
    Adds boolean presence flags: mouse_has_data, log_has_data.
    """
    # Annotation columns we keep in the output
    meta_cols = [
        "session_id", "sub_index", "label", "label_int",
        "binary_label", "split",
    ]
    df = ann[meta_cols].copy()

    # ── Join mouse features ──────────────────────────────────────────────────
    if not mouse_df.empty and "session_id" in mouse_df.columns:
        # Rename mouse_has_data before merge to avoid collision
        mdf = mouse_df.rename(columns={"mouse_has_data": "_mouse_has_data_src"})
        df  = df.merge(mdf, on="session_id", how="left")
        df["mouse_has_data"] = df["_mouse_has_data_src"].fillna(0).astype(int)
        df.drop(columns=["_mouse_has_data_src"], inplace=True)
    else:
        df["mouse_has_data"] = 0

    # ── Join log features ────────────────────────────────────────────────────
    if not log_df.empty and "session_id" in log_df.columns:
        ldf = log_df.rename(columns={"log_has_data": "_log_has_data_src"})
        df  = df.merge(ldf, on="session_id", how="left")
        df["log_has_data"] = df["_log_has_data_src"].fillna(0).astype(int)
        df.drop(columns=["_log_has_data_src"], inplace=True)
    else:
        df["log_has_data"] = 0

    # ── Fill NaN for sessions with no log data ───────────────────────────────
    # Log features are 0 (not NaN) when absent, to distinguish "0 requests"
    # from "unknown" in the ML model.
    empty_log = _empty_log_features()
    for col, default in empty_log.items():
        if col not in df.columns:
            df[col] = 0.0
        else:
            df[col] = df[col].fillna(0.0)

    return df


def _check_and_log_duplicates(ann: pd.DataFrame, tag: str) -> None:
    conflicts = check_duplicate_sessions(ann)
    if conflicts.empty:
        logger.info("%s: No label conflicts found ✓", tag)
    else:
        logger.warning(
            "%s: %d session(s) have conflicting labels:\n%s",
            tag, len(conflicts), conflicts.to_string(),
        )


def _log_label_distribution(df: pd.DataFrame, tag: str) -> None:
    if df.empty:
        logger.warning("%s: empty DataFrame", tag)
        return
    dist = df["label"].value_counts().to_dict()
    logger.info("%s label distribution: %s", tag, dist)

