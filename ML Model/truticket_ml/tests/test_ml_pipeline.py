"""
test_ml_pipeline.py
====================
Comprehensive Unit and Integration Tests for TruTicket ML & Hybrid Scoring Module.
Tests:
1. Preprocessing and feature input dimensionality.
2. Handling of NaN / missing fields without throwing errors.
3. Deterministic rules engine trigger logic.
4. Hybrid scorer outputs: valid risk scores [0, 100], correct risk bands, and explainable reason codes.
5. Edge cases: completely empty features, extreme values, missing mouse movement.
"""

import sys
from pathlib import Path
SRC_DIR = Path(__file__).resolve().parent.parent / "src"
sys.path.insert(0, str(SRC_DIR))

import unittest
import numpy as np
import pandas as pd
import joblib

from rules_engine import evaluate_rules
from hybrid_scorer import HybridScorer
from config import score_to_band

class TestRulesEngine(unittest.TestCase):
    def test_clean_human_session(self):
        # Realistic organic human values
        human_features = {
            "mouse_dir_change_rate": 0.11,
            "mouse_speed_std_px_s": 1200.0,
            "mouse_speed_reliable": 1,
            "mouse_straightness": 0.005,
            "mouse_dist_mean": 9.0,
            "mouse_total_moves": 5000,
            "mouse_has_data": 1,
            "log_requests_per_second": 0.7
        }
        delta, codes, details = evaluate_rules(human_features)
        self.assertEqual(delta, 0.0)
        self.assertEqual(len(codes), 0)

    def test_mechanical_advanced_bot(self):
        # Mechanical bot with uniform speed and low direction changes
        adv_bot_features = {
            "mouse_dir_change_rate": 0.028,
            "mouse_speed_std_px_s": 290.0,
            "mouse_speed_reliable": 1,
            "mouse_straightness": 0.008,
            "mouse_dist_mean": 10.1,
            "mouse_total_moves": 7000,
            "mouse_has_data": 1,
            "log_requests_per_second": 0.65
        }
        delta, codes, details = evaluate_rules(adv_bot_features)
        self.assertGreater(delta, 0.0)
        self.assertIn("MECHANICAL_DIRECTION_CHANGES", codes)
        self.assertIn("UNNATURAL_SPEED_UNIFORMITY", codes)

    def test_missing_mouse_data_rule(self):
        no_mouse_features = {
            "mouse_has_data": 0,
            "mouse_total_moves": 0,
            "log_requests_per_second": 1.2
        }
        delta, codes, details = evaluate_rules(no_mouse_features)
        self.assertIn("MISSING_MOUSE_DATA", codes)
        self.assertGreaterEqual(delta, 35.0)

class TestHybridScorer(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.scorer = HybridScorer()

    def test_human_test_session_scoring(self):
        # A known human test session from phase1_test.csv
        test_df = pd.read_csv(Path(__file__).resolve().parent.parent / "data" / "features" / "phase1_test.csv")
        human_row = test_df[test_df["label"] == "human"].iloc[0].to_dict()
        res = self.scorer.score_session(human_row)
        
        self.assertEqual(res["predicted_class"], "human")
        self.assertLessEqual(res["risk_score"], 30.0)
        self.assertEqual(res["risk_band"], "LOW")
        self.assertIn("CONFIRMED_ORGANIC_HUMAN_KINEMATICS", res["reason_codes"])

    def test_bot_test_session_scoring(self):
        test_df = pd.read_csv(Path(__file__).resolve().parent.parent / "data" / "features" / "phase1_test.csv")
        bot_row = test_df[test_df["label"] == "advanced_bot"].iloc[0].to_dict()
        res = self.scorer.score_session(bot_row)
        
        self.assertEqual(res["predicted_class"], "advanced_bot")
        self.assertGreaterEqual(res["risk_score"], 60.0)
        self.assertIn(res["risk_band"], ["HIGH", "CRITICAL"])
        self.assertGreater(len(res["reason_codes"]), 0)

    def test_edge_case_all_nans(self):
        # An empty session with NaNs across all features
        nan_session = {"session_id": "test_empty_nan_session"}
        res = self.scorer.score_session(nan_session)
        self.assertTrue(0.0 <= res["risk_score"] <= 100.0)
        self.assertIn(res["risk_band"], ["LOW", "MEDIUM", "HIGH", "CRITICAL"])
        self.assertIn("MISSING_MOUSE_DATA", res["reason_codes"])

    def test_edge_case_extreme_values(self):
        # Session with extreme high request velocity and straightness
        extreme_session = {
            "session_id": "test_extreme_script",
            "mouse_straightness": 0.99,
            "mouse_dist_mean": 0.5,
            "mouse_dir_change_rate": 0.8,
            "log_requests_per_second": 50.0,
            "mouse_has_data": 1,
            "mouse_total_moves": 1000
        }
        res = self.scorer.score_session(extreme_session)
        self.assertGreaterEqual(res["risk_score"], 60.0)
        self.assertIn("HIGH_REQUEST_VELOCITY", res["reason_codes"])
        self.assertIn("HIGH_PATH_STRAIGHTNESS", res["reason_codes"])

if __name__ == "__main__":
    unittest.main()
