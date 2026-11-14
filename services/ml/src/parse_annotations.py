"""
parse_annotations.py
====================
Reads the official annotation files for Phase 1 and Phase 2.

Phase 1 format  (plain text, one entry per line):
    <session_id> <label>
    e.g.  dr09rk5eagjuu87gedvdqmq3gl human

Phase 2 format  (plain text, sub-session suffix):
    <base_id>_<N> <label>
    e.g.  cmtn6a23es1vk1v038j2pd0cqa_1 advanced_bot

Output:
    pandas DataFrame with columns:
        session_id  : canonical ID used in mouse/log data
        sub_index   : integer (Phase 2 only; 0 for Phase 1)
        label       : original string  ("human" / "moderate_bot" / "advanced_bot")
        label_int   : 0=human  1=moderate_bot  2=advanced_bot
        binary_label: 0=human  1=any_bot
        split       : "train" | "test" | "unknown"
        phase       : 1 | 2
        experiment  : e.g. "humans_and_advanced_bots"
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List

import pandas as pd

logger = logging.getLogger(__name__)

# ── Canonical label map ──────────────────────────────────────────────────────
LABEL_INT = {
    "human":        0,
    "moderate_bot": 1,
    "advanced_bot": 2,
}

# ── Low-level reader ─────────────────────────────────────────────────────────

def _read_annotation_file(path: Path, split: str, phase: int, experiment: str) -> List[dict]:
    """
    Read one annotation file and return a list of record dicts.
    Skips blank lines silently (handles the trailing-newline artefact
    found in phase1/humans_and_advanced_bots/test).
    """
    records = []
    with open(path, "r", encoding="utf-8") as fh:
        for lineno, raw in enumerate(fh, start=1):
            line = raw.strip()
            if not line:          # skip blank / trailing newline
                continue

            parts = line.split()
            if len(parts) != 2:
                logger.warning(
                    "%s line %d: unexpected format %r — skipped",
                    path.name, lineno, line
                )
                continue

            raw_id, label = parts
            label = label.strip()

            if label not in LABEL_INT:
                logger.warning(
                    "%s line %d: unknown label %r — skipped",
                    path.name, lineno, label
                )
                continue

            # Phase 2 IDs look like  <base_id>_<N>
            # Phase 1 IDs are plain 26-char strings (no underscore suffix)
            if phase == 2 and "_" in raw_id:
                # Split off the numeric suffix
                base_id, _, sub_str = raw_id.rpartition("_")
                try:
                    sub_index = int(sub_str)
                except ValueError:
                    base_id  = raw_id   # fallback: treat whole thing as base
                    sub_index = 0
            else:
                base_id   = raw_id
                sub_index = 0

            records.append({
                "session_id":    base_id,
                "sub_index":     sub_index,
                "raw_id":        raw_id,
                "label":         label,
                "label_int":     LABEL_INT[label],
                "binary_label":  0 if label == "human" else 1,
                "split":         split,
                "phase":         phase,
                "experiment":    experiment,
            })

    logger.info(
        "Loaded %d records from %s [%s/%s]",
        len(records), path.name, split, experiment
    )
    return records


# ── Phase 1 ──────────────────────────────────────────────────────────────────

def load_phase1_annotations(annot_root: Path) -> pd.DataFrame:
    """
    Load all four Phase 1 annotation files and return a combined DataFrame.
    Official train/test splits are preserved exactly.

    Strategy for the 50 human sessions that appear in BOTH
    humans_and_advanced_bots AND humans_and_moderate_bots:
        We keep ALL entries.  When building the feature matrix we deduplicate
        by session_id, keeping the first occurrence (they will have the same
        mouse data anyway).  The `experiment` column lets you filter later.
    """
    all_records: List[dict] = []

    experiments = {
        "humans_and_advanced_bots": {
            "train": annot_root / "humans_and_advanced_bots" / "train",
            "test":  annot_root / "humans_and_advanced_bots" / "test",
        },
        "humans_and_moderate_bots": {
            "train": annot_root / "humans_and_moderate_bots" / "train",
            "test":  annot_root / "humans_and_moderate_bots" / "test",
        },
    }

    for exp_name, splits in experiments.items():
        for split_name, fpath in splits.items():
            if not fpath.exists():
                logger.error("Missing annotation file: %s", fpath)
                continue
            all_records.extend(
                _read_annotation_file(fpath, split_name, phase=1, experiment=exp_name)
            )

    df = pd.DataFrame(all_records)
    _log_summary(df, "Phase 1")
    return df


# ── Phase 2 ──────────────────────────────────────────────────────────────────

def load_phase2_annotations(annot_root: Path) -> pd.DataFrame:
    """
    Load Phase 2 annotations.
    We use the richer file: humans_and_moderate_and_advanced_bots
    (it contains all three label types).

    Phase 2 has NO official train/test split — we set split='unknown'.
    DO NOT create the split here; that is done later in feature_engineering.py
    to avoid sub-session leakage.
    """
    ann_file = (
        annot_root
        / "humans_and_moderate_and_advanced_bots"
        / "humans_and_moderate_and_advanced_bots"
    )
    if not ann_file.exists():
        logger.error("Phase 2 annotation file not found: %s", ann_file)
        return pd.DataFrame()

    records = _read_annotation_file(
        ann_file,
        split="unknown",
        phase=2,
        experiment="humans_and_moderate_and_advanced_bots",
    )
    df = pd.DataFrame(records)
    _log_summary(df, "Phase 2")
    return df


# ── Helpers ───────────────────────────────────────────────────────────────────

def _log_summary(df: pd.DataFrame, tag: str) -> None:
    if df.empty:
        logger.warning("%s: annotation DataFrame is empty!", tag)
        return
    logger.info(
        "%s annotations loaded: %d rows | labels: %s",
        tag,
        len(df),
        df["label"].value_counts().to_dict(),
    )


def check_duplicate_sessions(df: pd.DataFrame) -> pd.DataFrame:
    """
    Return a DataFrame of session_ids that appear more than once
    with DIFFERENT labels — a data-quality problem.
    Same session, same label in different experiments = expected overlap.
    """
    # Group by session_id; find any that have >1 distinct label
    conflict = (
        df.groupby("session_id")["label"]
        .nunique()
        .reset_index()
        .rename(columns={"label": "distinct_labels"})
    )
    return conflict[conflict["distinct_labels"] > 1]

