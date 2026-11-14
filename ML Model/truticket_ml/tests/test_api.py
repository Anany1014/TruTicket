"""
test_api.py
===========
Integration and Unit Tests for TruTicket FastAPI Service.
Tests:
1. GET / - Root metadata endpoint
2. GET /health - Service health and model status
3. POST /score - Verified human test session (low score, LOW band)
4. POST /score - Verified advanced bot test session (high score, CRITICAL band)
5. POST /score - Verified moderate bot test session (high score, HIGH/CRITICAL band)
6. POST /score - Edge case: missing mouse movement data (must flag without arbitrary hard-block)
7. POST /score - Edge case: completely empty/NaN feature dictionary
8. POST /score - Invalid payload validation (e.g. invalid types or missing session_id)
9. Score boundary assertions [0.0, 100.0]
"""

import sys
from pathlib import Path
import unittest
import pandas as pd
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parent.parent
API_DIR = PROJECT_ROOT / "api"
SRC_DIR = PROJECT_ROOT / "src"

for p in [str(PROJECT_ROOT), str(API_DIR), str(SRC_DIR)]:
    if p not in sys.path:
        sys.path.insert(0, p)

from api.main import app

class TestTruTicketAPI(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)
        # Load sample real test sessions for realistic evaluations
        cls.test_df = pd.read_csv(PROJECT_ROOT / "data" / "features" / "phase1_test.csv")

    def test_root_endpoint(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("service", data)
        self.assertIn("version", data)

    def test_health_endpoint(self):
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "healthy")
        self.assertTrue(data["model_loaded"])
        self.assertIn("human", data["classes"])

    def test_score_human_session(self):
        human_row = self.test_df[self.test_df["label"] == "human"].iloc[0].to_dict()
        payload = {k: v for k, v in human_row.items() if not pd.isna(v)}
        
        response = self.client.post("/score", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        self.assertEqual(data["session_id"], human_row["session_id"])
        self.assertEqual(data["predicted_class"], "human")
        self.assertLessEqual(data["risk_score"], 30.0)
        self.assertEqual(data["risk_band"], "LOW")
        self.assertIn("ALLOW", data["action_recommendation"])
        self.assertIn("CONFIRMED_ORGANIC_HUMAN_KINEMATICS", data["reason_codes"])

    def test_score_advanced_bot_session(self):
        bot_row = self.test_df[self.test_df["label"] == "advanced_bot"].iloc[0].to_dict()
        payload = {k: v for k, v in bot_row.items() if not pd.isna(v)}
        
        response = self.client.post("/score", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        self.assertEqual(data["predicted_class"], "advanced_bot")
        self.assertGreaterEqual(data["risk_score"], 80.0)
        self.assertIn(data["risk_band"], ["HIGH", "CRITICAL"])
        self.assertIn("MECHANICAL_DIRECTION_CHANGES", data["reason_codes"])

    def test_score_moderate_bot_session(self):
        mod_row = self.test_df[self.test_df["label"] == "moderate_bot"].iloc[0].to_dict()
        payload = {k: v for k, v in mod_row.items() if not pd.isna(v)}
        
        response = self.client.post("/score", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        self.assertEqual(data["predicted_class"], "moderate_bot")
        self.assertGreaterEqual(data["risk_score"], 60.0)
        self.assertIn(data["risk_band"], ["HIGH", "CRITICAL"])

    def test_missing_mouse_data_safeguard(self):
        # A session with no mouse data (e.g. mobile touch screen or scraper)
        # Safeguard: must NOT automatically hard-block or produce 100 CRITICAL risk without verification
        payload = {
            "session_id": "session_no_mouse_touch",
            "mouse_has_data": 0,
            "mouse_total_moves": 0,
            "log_total_requests": 15,
            "log_requests_per_second": 0.8
        }
        response = self.client.post("/score", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        
        self.assertIn("MISSING_MOUSE_DATA", data["reason_codes"])
        # Crucial safeguard: risk score remains bounded and does not blindly hard-block
        self.assertLess(data["risk_score"], 85.0)

    def test_empty_payload_with_session_id(self):
        # Gracefully handle session when only session_id is provided
        payload = {"session_id": "sess_minimal_only_id"}
        response = self.client.post("/score", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(0.0 <= data["risk_score"] <= 100.0)
        self.assertIn("session_id", data)

    def test_invalid_request_missing_session_id(self):
        # Missing required field
        payload = {"mouse_total_moves": 500}
        response = self.client.post("/score", json=payload)
        self.assertEqual(response.status_code, 422)  # Unprocessable Entity

    def test_invalid_request_negative_values(self):
        # Negative move count fails pydantic constraint ge=0
        payload = {"session_id": "test_neg", "mouse_total_moves": -50}
        response = self.client.post("/score", json=payload)
        self.assertEqual(response.status_code, 422)

if __name__ == "__main__":
    unittest.main()

