"""
services/ml/main.py
===================
TruTicket Production ML Risk Service
FastAPI service for bot & behavioral fraud risk scoring across TruTicket.
Implements:
- Hybrid Machine Learning (Calibrated 3-class Random Forest Pipeline)
- Deterministic Kinematic Rules Engine (PRD Section 12)
- Endpoints:
  - GET  / : Service overview & metadata
  - GET  /health : Health check & model readiness status
  - POST /score : Comprehensive behavioral fraud scoring (kinematic + web log telemetry)
  - POST /predict : Unified prediction endpoint (supports both direct session features & nested payloads)
  - GET  /sample-sessions : Curated sample sessions (human, moderate_bot, advanced_bot)
  - POST /simulate : Real-time simulation runner for testing risk responses
"""

import sys
import os
import logging
from pathlib import Path
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Dict, List, Optional, Any, Union

from fastapi import FastAPI, HTTPException, status, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

# Ensure src and root are in python path
CURRENT_DIR = Path(__file__).resolve().parent
SRC_DIR = CURRENT_DIR / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))
if str(CURRENT_DIR) not in sys.path:
    sys.path.insert(0, str(CURRENT_DIR))

# Fallback path if models/src are in ML Model directory
REPO_ROOT = CURRENT_DIR.parent.parent
FALLBACK_ML_DIR = REPO_ROOT / "ML Model" / "truticket_ml"
if str(FALLBACK_ML_DIR / "src") not in sys.path:
    sys.path.insert(0, str(FALLBACK_ML_DIR / "src"))

from hybrid_scorer import HybridScorer

logger = logging.getLogger("truticket_ml")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

MODEL_VERSION = "1.0.0-rf-hybrid"
scorer: Optional[HybridScorer] = None

def get_model_path() -> Path:
    env_path = os.getenv("ML_MODEL_PATH")
    if env_path and Path(env_path).exists():
        return Path(env_path)
    primary = CURRENT_DIR / "models" / "random_forest_pipeline.joblib"
    if primary.exists():
        return primary
    fallback = FALLBACK_ML_DIR / "models" / "random_forest_pipeline.joblib"
    if fallback.exists():
        return fallback
    raise FileNotFoundError(f"Model artifact not found. Checked: {primary} and {fallback}")

def get_scorer() -> HybridScorer:
    """Lazy-load or return singleton HybridScorer."""
    global scorer
    if scorer is None:
        model_path = get_model_path()
        logger.info(f"Loading scoring model from: {model_path}")
        scorer = HybridScorer(model_path)
        logger.info("TruTicket HybridScorer initialized successfully.")
    return scorer

@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        get_scorer()
    except Exception as e:
        logger.warning(f"Could not load ML model at startup: {e}")
    yield
    logger.info("Shutting down TruTicket ML Risk Service.")

app = FastAPI(
    title="TruTicket ML Risk Service",
    description="Machine learning and deterministic behavioral fraud scoring API for live ticketing sessions.",
    version=MODEL_VERSION,
    lifespan=lifespan
)

# CORS configuration for Web (Next.js), Mobile (Expo), and local dev tools
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------------------------------
# Pydantic Schemas
# ---------------------------------------------------------------------------
class SessionFeaturesRequest(BaseModel):
    session_id: str = Field(default_factory=lambda: f"sess_{int(datetime.utcnow().timestamp()*1000)}", description="Session identifier")
    user_id: Optional[str] = Field(None, description="Optional user UUID")
    event_id: Optional[str] = Field(None, description="Optional event UUID")
    action: Optional[str] = Field("checkout", description="Action context: queue_join | checkout | resale_list")
    
    # Mouse movement features
    mouse_total_moves: Optional[float] = Field(None, ge=0)
    mouse_total_clicks: Optional[float] = Field(None, ge=0)
    mouse_total_events: Optional[float] = Field(None, ge=0)
    mouse_click_to_move: Optional[float] = Field(None, ge=0)
    mouse_total_path_px: Optional[float] = Field(None, ge=0)
    mouse_straight_line_px: Optional[float] = Field(None, ge=0)
    mouse_straightness: Optional[float] = Field(None, ge=0.0, le=1.0)
    mouse_dist_mean: Optional[float] = Field(None, ge=0)
    mouse_dist_std: Optional[float] = Field(None, ge=0)
    mouse_dist_min: Optional[float] = Field(None, ge=0)
    mouse_dist_max: Optional[float] = Field(None, ge=0)
    mouse_direction_changes: Optional[float] = Field(None, ge=0)
    mouse_dir_change_rate: Optional[float] = Field(None, ge=0)
    mouse_speed_mean_px_s: Optional[float] = Field(None, ge=0)
    mouse_speed_std_px_s: Optional[float] = Field(None, ge=0)
    mouse_speed_max_px_s: Optional[float] = Field(None, ge=0)
    mouse_speed_reliable: Optional[int] = Field(1, ge=0, le=1)
    mouse_has_data: Optional[int] = Field(1, ge=0, le=1)

    # Web log & telemetry features
    log_total_requests: Optional[float] = Field(None, ge=0)
    log_get_requests: Optional[float] = Field(None, ge=0)
    log_post_requests: Optional[float] = Field(None, ge=0)
    log_unique_urls: Optional[float] = Field(None, ge=0)
    log_static_requests: Optional[float] = Field(None, ge=0)
    log_content_requests: Optional[float] = Field(None, ge=0)
    log_home_requests: Optional[float] = Field(None, ge=0)
    log_mouse_post_count: Optional[float] = Field(None, ge=0)
    log_fingerprint_js_hits: Optional[float] = Field(None, ge=0)
    log_other_requests: Optional[float] = Field(None, ge=0)
    log_internal_requests: Optional[float] = Field(None, ge=0)
    log_session_duration_s: Optional[float] = Field(None, ge=0)
    log_requests_per_second: Optional[float] = Field(None, ge=0)
    log_gap_mean_s: Optional[float] = Field(None, ge=0)
    log_gap_std_s: Optional[float] = Field(None, ge=0)
    log_gap_min_s: Optional[float] = Field(None, ge=0)
    log_gap_max_s: Optional[float] = Field(None, ge=0)
    log_gap_median_s: Optional[float] = Field(None, ge=0)
    log_unique_content_pages: Optional[float] = Field(None, ge=0)
    log_content_revisit_ratio: Optional[float] = Field(None, ge=0, le=1.0)
    log_max_url_repetitions: Optional[float] = Field(None, ge=0)
    log_static_dyn_ratio: Optional[float] = Field(None, ge=0)
    log_http10_ratio: Optional[float] = Field(None, ge=0, le=1.0)
    log_has_fingerprint_js: Optional[float] = Field(None, ge=0, le=1)
    log_is_empty_ua: Optional[float] = Field(None, ge=0, le=1)
    log_referer_is_https_obs: Optional[float] = Field(None, ge=0, le=1)
    log_has_data: Optional[int] = Field(1, ge=0, le=1)

    # Optional account-level fallback features
    account_age_days: Optional[int] = Field(None, ge=0)
    purchase_attempts: Optional[int] = Field(None, ge=0)
    account_reuse_count: Optional[int] = Field(None, ge=0)
    session_reuse_count: Optional[int] = Field(None, ge=0)
    device_integrity_score: Optional[float] = Field(None, ge=0.0, le=1.0)
    rapid_holds_count: Optional[int] = Field(None, ge=0)
    rapid_cancellations_count: Optional[int] = Field(None, ge=0)
    events_attempted: Optional[int] = Field(None, ge=0)
    time_between_actions_ms: Optional[float] = Field(None, ge=0)
    ip_burst_count: Optional[int] = Field(None, ge=0)

    model_config = {"extra": "ignore"}

class ClassProbabilities(BaseModel):
    human: float = Field(..., ge=0.0, le=1.0)
    moderate_bot: float = Field(..., ge=0.0, le=1.0)
    advanced_bot: float = Field(..., ge=0.0, le=1.0)

class ScoreResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    session_id: str
    predicted_class: str
    class_probabilities: ClassProbabilities
    risk_score: float
    risk_band: str
    reason_codes: List[str]
    model_version: str
    action_recommendation: str

class HealthResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    status: str
    model_loaded: bool
    version: str
    classes: List[str]
    timestamp: str

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def determine_action_recommendation(risk_band: str) -> str:
    """Maps PRD Section 12 risk bands to actionable ticket queue and checkout policies."""
    if risk_band == "LOW":
        return "ALLOW: Frictionless checkout path granted."
    elif risk_band == "MEDIUM":
        return "CHALLENGE: Step-up verification required (CAPTCHA or SMS OTP challenge)."
    elif risk_band == "HIGH":
        return "RESTRICT: Place session into delayed virtual queue with reduced inventory hold timeout."
    elif risk_band == "CRITICAL":
        return "FLAG_REVIEW: High bot confidence. Flag for inventory release or admin audit."
    return "MONITOR: Unknown risk band. Log telemetry."

SAMPLE_SESSIONS = {
    "clean_human": {
        "session_id": "sess_human_sample_01",
        "mouse_total_moves": 8332,
        "mouse_total_clicks": 11,
        "mouse_total_events": 8343,
        "mouse_click_to_move": 0.0013,
        "mouse_total_path_px": 45000.0,
        "mouse_straightness": 0.0045,
        "mouse_dist_mean": 5.95,
        "mouse_dist_std": 11.5,
        "mouse_direction_changes": 795,
        "mouse_dir_change_rate": 0.095,
        "mouse_speed_mean_px_s": 542.0,
        "mouse_speed_std_px_s": 1190.0,
        "mouse_speed_reliable": 1,
        "mouse_has_data": 1,
        "log_total_requests": 184,
        "log_get_requests": 170,
        "log_post_requests": 14,
        "log_unique_urls": 42,
        "log_session_duration_s": 253.0,
        "log_requests_per_second": 0.727,
        "log_gap_mean_s": 1.38,
        "log_gap_std_s": 0.89,
        "log_has_data": 1
    },
    "moderate_scraper_bot": {
        "session_id": "sess_mod_bot_sample_02",
        "mouse_total_moves": 450,
        "mouse_total_clicks": 2,
        "mouse_total_events": 452,
        "mouse_click_to_move": 0.0044,
        "mouse_straightness": 0.038,
        "mouse_dist_mean": 18.5,
        "mouse_dist_std": 4.2,
        "mouse_direction_changes": 12,
        "mouse_dir_change_rate": 0.026,
        "mouse_speed_mean_px_s": 1250.0,
        "mouse_speed_std_px_s": 210.0,
        "mouse_speed_reliable": 1,
        "mouse_has_data": 1,
        "log_total_requests": 420,
        "log_get_requests": 418,
        "log_post_requests": 2,
        "log_unique_urls": 95,
        "log_session_duration_s": 35.0,
        "log_requests_per_second": 12.0,
        "log_gap_mean_s": 0.08,
        "log_gap_std_s": 0.02,
        "log_has_data": 1
    },
    "advanced_stealth_bot": {
        "session_id": "sess_adv_bot_sample_03",
        "mouse_total_moves": 2100,
        "mouse_total_clicks": 5,
        "mouse_total_events": 2105,
        "mouse_click_to_move": 0.0023,
        "mouse_straightness": 0.012,
        "mouse_dist_mean": 9.2,
        "mouse_dist_std": 1.8,
        "mouse_direction_changes": 45,
        "mouse_dir_change_rate": 0.021,
        "mouse_speed_mean_px_s": 850.0,
        "mouse_speed_std_px_s": 140.0,
        "mouse_speed_reliable": 1,
        "mouse_has_data": 1,
        "log_total_requests": 195,
        "log_get_requests": 180,
        "log_post_requests": 15,
        "log_unique_urls": 28,
        "log_session_duration_s": 140.0,
        "log_requests_per_second": 1.39,
        "log_gap_mean_s": 0.72,
        "log_gap_std_s": 0.15,
        "log_has_data": 1
    }
}

# ---------------------------------------------------------------------------
# API Endpoints
# ---------------------------------------------------------------------------
@app.get("/", tags=["Info"])
async def root():
    return {
        "service": "TruTicket Bot & Fraud Detection Engine",
        "version": MODEL_VERSION,
        "status": "online",
        "endpoints": {
            "health": "/health",
            "score": "/score (POST)",
            "predict": "/predict (POST)",
            "sample_sessions": "/sample-sessions (GET)",
            "simulate": "/simulate (POST)",
            "docs": "/docs"
        },
        "description": "Evaluates live session interaction signals using a trained 3-Class Random Forest & Kinematic Rules Engine."
    }

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health():
    try:
        active_scorer = get_scorer()
        model_ok = active_scorer is not None and active_scorer.pipeline is not None
        classes = list(active_scorer.class_map.values()) if model_ok else ["human", "moderate_bot", "advanced_bot"]
    except Exception as e:
        logger.error(f"Health check model load error: {e}")
        model_ok = False
        classes = ["human", "moderate_bot", "advanced_bot"]

    return HealthResponse(
        status="healthy" if model_ok else "degraded",
        model_loaded=model_ok,
        version=MODEL_VERSION,
        classes=classes,
        timestamp=datetime.utcnow().isoformat() + "Z"
    )

@app.post("/score", response_model=ScoreResponse, tags=["Scoring"])
async def score_session(request: SessionFeaturesRequest):
    active_scorer = get_scorer()
    if active_scorer is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Scoring service is not initialized."
        )
    try:
        session_dict = request.model_dump()
        result = active_scorer.score_session(session_dict)
        
        probs = result["probabilities"]
        class_probs = ClassProbabilities(
            human=float(probs.get("human", 0.0)),
            moderate_bot=float(probs.get("moderate_bot", 0.0)),
            advanced_bot=float(probs.get("advanced_bot", 0.0))
        )
        
        action = determine_action_recommendation(result["risk_band"])
        
        return ScoreResponse(
            session_id=result["session_id"],
            predicted_class=result["predicted_class"],
            class_probabilities=class_probs,
            risk_score=float(result["risk_score"]),
            risk_band=result["risk_band"],
            reason_codes=result.get("reason_codes", []),
            model_version=MODEL_VERSION,
            action_recommendation=action
        )
    except Exception as e:
        logger.error(f"Error scoring session {request.session_id}: {e}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal error occurred while calculating session risk score."
        )

@app.post("/predict", tags=["Scoring"])
async def predict_endpoint(payload: Dict[str, Any] = Body(...)):
    """
    Unified prediction endpoint. Handles both nested `{ features: ... }`
    and direct flat session feature payloads.
    """
    active_scorer = get_scorer()
    
    # Extract features dictionary
    features = payload.get("features", payload)
    session_id = payload.get("session_id", features.get("session_id", f"sess_{int(datetime.utcnow().timestamp()*1000)}"))
    
    # If account_age_days is supplied without mouse data, synthesize sensible kinematics or evaluate rules
    if "mouse_total_moves" not in features and "account_age_days" in features:
        # Account-level scoring bridge
        age = features.get("account_age_days", 30)
        attempts = features.get("purchase_attempts", 1)
        integrity = features.get("device_integrity_score", 1.0)
        ip_burst = features.get("ip_burst_count", 0)
        rapid_holds = features.get("rapid_holds_count", 0)

        # Map to kinematic / request synthetic proxies for RF evaluation
        if integrity < 0.5 or ip_burst > 10 or rapid_holds > 3 or attempts > 5:
            # Bot-like session proxy
            features.update(SAMPLE_SESSIONS["moderate_scraper_bot"])
        elif age < 7 and attempts > 3:
            features.update(SAMPLE_SESSIONS["advanced_stealth_bot"])
        else:
            features.update(SAMPLE_SESSIONS["clean_human"])
        features["session_id"] = session_id

    req = SessionFeaturesRequest(**features)
    return await score_session(req)

@app.get("/sample-sessions", tags=["Testing"])
async def get_sample_sessions():
    """Returns curated synthetic test sessions for quick client evaluation."""
    return SAMPLE_SESSIONS

@app.post("/simulate", response_model=ScoreResponse, tags=["Testing"])
async def simulate_scenario(scenario: str = "clean_human"):
    """Run an instant evaluation against one of the pre-configured scenarios."""
    if scenario not in SAMPLE_SESSIONS:
        raise HTTPException(status_code=400, detail=f"Unknown scenario '{scenario}'. Available: {list(SAMPLE_SESSIONS.keys())}")
    req = SessionFeaturesRequest(**SAMPLE_SESSIONS[scenario])
    return await score_session(req)
