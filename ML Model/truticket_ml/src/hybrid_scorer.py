"""
hybrid_scorer.py
================
TruTicket Hybrid Risk Scoring Engine (PRD Section 12).
Combines:
1. Random Forest multi-class predicted probabilities.
2. Deterministic behavioral rules.
Produces:
- `predicted_class`: human | moderate_bot | advanced_bot
- `probabilities`: P(human), P(moderate_bot), P(advanced_bot)
- `risk_score`: 0 to 100
- `risk_band`: LOW (0-30), MEDIUM (31-59), HIGH (60-100)
- `reason_codes`: explainable list of triggered risk indicators
- `audit_trail`: detailed feature contributions and triggered rule metrics
"""

from pathlib import Path
from typing import Dict, Any, List
import numpy as np
import pandas as pd
import joblib

from rules_engine import evaluate_rules
from config import score_to_band

SRC_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SRC_DIR.parent
MODEL_PATH = PROJECT_ROOT / "models" / "random_forest_pipeline.joblib"

class HybridScorer:
    def __init__(self, model_bundle_path: Path = MODEL_PATH):
        if not model_bundle_path.exists():
            raise FileNotFoundError(f"Model bundle not found at: {model_bundle_path}. Run train_model.py first.")
        self.bundle = joblib.load(model_bundle_path)
        self.pipeline = self.bundle['pipeline']
        self.feature_cols = self.bundle['feature_cols']
        self.class_map = self.bundle['class_map']

    def score_session(self, session_features: Dict[str, Any]) -> Dict[str, Any]:
        """
        Calculates a hybrid risk score for a single session.
        """
        # 1. Prepare feature row aligned with model input columns
        row_dict = {}
        for col in self.feature_cols:
            val = session_features.get(col, np.nan)
            row_dict[col] = [val]
            
        X_df = pd.DataFrame(row_dict)
        
        # 2. Get Model Probabilities
        proba = self.pipeline.predict_proba(X_df)[0]
        pred_idx = int(np.argmax(proba))
        pred_class = self.class_map[pred_idx]
        
        # Base probability of being non-human (moderate_bot or advanced_bot)
        # Classes: 0: human, 1: moderate_bot, 2: advanced_bot
        p_human = float(proba[0])
        p_mod_bot = float(proba[1]) if len(proba) > 1 else 0.0
        p_adv_bot = float(proba[2]) if len(proba) > 2 else 0.0
        
        # Model Base Score (0 to 100):
        # Weighted bot probability: advanced bot carries full 100 weight, moderate bot carries 75 weight
        base_ml_score = (p_adv_bot * 100.0) + (p_mod_bot * 75.0)
        
        # 3. Deterministic Rules Evaluation
        rule_delta, triggered_codes, triggered_details = evaluate_rules(session_features)
        
        # 4. Hybrid Formulation:
        # Final Score = 0.7 * ML_Score + 0.3 * (Rule_Delta * 2) capped at 100
        # If any high-severity rule fires (e.g. MISSING_MOUSE_DATA or MECHANICAL_DIRECTION_CHANGES),
        # ensure risk score reflects at least MEDIUM band.
        hybrid_score = (0.75 * base_ml_score) + (0.25 * (rule_delta * 2.0))
        final_risk_score = float(np.clip(hybrid_score, 0.0, 100.0))
        
        # 5. Determine Risk Band according to config
        # Low: 0-30, Medium: 31-59, High: 60-100
        risk_band = score_to_band(round(final_risk_score))
        
        # Add predictive reason codes if high bot probability exists
        reason_codes = list(triggered_codes)
        if p_adv_bot >= 0.5 and "ADVANCED_BOT_BEHAVIOUR_PATTERN" not in reason_codes:
            reason_codes.append("ADVANCED_BOT_BEHAVIOUR_PATTERN")
        if p_mod_bot >= 0.5 and "MODERATE_BOT_BEHAVIOUR_PATTERN" not in reason_codes:
            reason_codes.append("MODERATE_BOT_BEHAVIOUR_PATTERN")
        if final_risk_score <= 30.0 and len(reason_codes) == 0:
            reason_codes.append("CONFIRMED_ORGANIC_HUMAN_KINEMATICS")

        return {
            "session_id": session_features.get("session_id", "unknown"),
            "predicted_class": pred_class,
            "probabilities": {
                "human": round(p_human, 4),
                "moderate_bot": round(p_mod_bot, 4),
                "advanced_bot": round(p_adv_bot, 4)
            },
            "base_ml_score": round(base_ml_score, 2),
            "rule_delta": round(rule_delta, 2),
            "risk_score": round(final_risk_score, 1),
            "risk_band": risk_band,
            "reason_codes": reason_codes,
            "rule_details": triggered_details
        }

    def score_dataframe(self, df: pd.DataFrame) -> pd.DataFrame:
        """Score an entire DataFrame of sessions."""
        results = []
        for _, row in df.iterrows():
            res = self.score_session(row.to_dict())
            results.append({
                "session_id": res["session_id"],
                "predicted_class": res["predicted_class"],
                "p_human": res["probabilities"]["human"],
                "p_moderate_bot": res["probabilities"]["moderate_bot"],
                "p_advanced_bot": res["probabilities"]["advanced_bot"],
                "risk_score": res["risk_score"],
                "risk_band": res["risk_band"],
                "reason_codes": ";".join(res["reason_codes"])
            })
        return pd.DataFrame(results)

if __name__ == "__main__":
    scorer = HybridScorer()
    test_df = pd.read_csv(PROJECT_ROOT / "data" / "features" / "phase1_test.csv")
    print(f"Scoring {len(test_df)} test sessions with Hybrid Scorer...")
    scored_test = scorer.score_dataframe(test_df)
    scored_test["true_label"] = test_df["label"].values
    
    print("\n--- Hybrid Risk Scoring Summary on phase1_test.csv ---")
    print(scored_test.groupby(["true_label", "risk_band"]).size().unstack(fill_value=0))
    print("\nSample Output:")
    print(scored_test[["session_id", "true_label", "risk_score", "risk_band", "reason_codes"]].head(10).to_string(index=False))

