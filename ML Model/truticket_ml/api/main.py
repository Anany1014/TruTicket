"""
main.py
=======
FastAPI Application for TruTicket Bot & Fraud Detection Service.
Implements:
- GET / : Root overview and service metadata
- GET /health : Health check and model readiness state
- POST /score : Session-level behavioral fraud and bot evaluation endpoint
"""

import sys
from pathlib import Path
from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Add src to system path to import existing scoring engine
API_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = API_DIR.parent
SRC_DIR = PROJECT_ROOT / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

from hybrid_scorer import HybridScorer
from api.schemas import SessionFeaturesRequest, ScoreResponse, ClassProbabilities, HealthResponse

logger = logging.getLogger("truticket_api")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

# Global scorer holder
scorer: HybridScorer = None
MODEL_VERSION = "1.0.0-rf-hybrid"

def get_scorer() -> HybridScorer:
    """Lazy-load or return existing HybridScorer singleton."""
    global scorer
    if scorer is None:
        model_path = PROJECT_ROOT / "models" / "random_forest_pipeline.joblib"
        logger.info(f"Loading scoring model from {model_path}...")
        if not model_path.exists():
            raise RuntimeError(f"Trained model artifact not found at {model_path}. Run train_model.py first.")
        scorer = HybridScorer(model_path)
        logger.info("Scoring model loaded successfully.")
    return scorer

@asynccontextmanager
async def lifespan(app: FastAPI):
    get_scorer()
    yield
    logger.info("Shutting down TruTicket Fraud Detection Service.")

app = FastAPI(
    title="TruTicket Bot & Fraud Detection Service",
    description="Machine learning and deterministic behavioral fraud scoring API for live ticketing sessions.",
    version=MODEL_VERSION,
    lifespan=lifespan
)

# CORS middleware for local frontend/backend integrations
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def determine_action_recommendation(risk_band: str) -> str:
    """
    Maps PRD Section 12 risk bands to actionable ticket queue and checkout policies.
    """
    if risk_band == "LOW":
        return "ALLOW: Frictionless checkout path granted."
    elif risk_band == "MEDIUM":
        return "CHALLENGE: Step-up verification required (CAPTCHA or SMS OTP challenge)."
    elif risk_band == "HIGH":
        return "RESTRICT: Place session into delayed virtual queue with reduced inventory hold timeout."
    elif risk_band == "CRITICAL":
        return "FLAG_REVIEW: High bot confidence. Flag for inventory release or admin audit."
    return "MONITOR: Unknown risk band. Log telemetry."

@app.get("/", tags=["Info"])
async def root():
    return {
        "service": "TruTicket Bot & Fraud Detection Engine",
        "version": MODEL_VERSION,
        "docs_url": "/docs",
        "health_check": "/health",
        "description": "Evaluate user session interaction signals to protect high-demand ticket releases."
    }

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health():
    current_scorer = get_scorer()
    if current_scorer is None or current_scorer.pipeline is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model is not ready or failed to initialize."
        )
    return HealthResponse(
        status="healthy",
        model_loaded=True,
        version=MODEL_VERSION,
        classes=list(current_scorer.class_map.values())
    )

@app.post("/score", response_model=ScoreResponse, tags=["Scoring"])
async def score_session(request: SessionFeaturesRequest):
    current_scorer = get_scorer()
    if current_scorer is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Scoring service is not initialized."
        )
    try:
        # Convert validated pydantic request to dictionary
        session_dict = request.model_dump()
        result = current_scorer.score_session(session_dict)
        
        probs = result["probabilities"]
        class_probs = ClassProbabilities(
            human=probs["human"],
            moderate_bot=probs["moderate_bot"],
            advanced_bot=probs["advanced_bot"]
        )
        
        action = determine_action_recommendation(result["risk_band"])
        
        return ScoreResponse(
            session_id=result["session_id"],
            predicted_class=result["predicted_class"],
            class_probabilities=class_probs,
            risk_score=result["risk_score"],
            risk_band=result["risk_band"],
            reason_codes=result["reason_codes"],
            model_version=MODEL_VERSION,
            action_recommendation=action
        )
    except Exception as e:
        logger.error(f"Error scoring session {request.session_id}: {str(e)}", exc_info=True)
        # Avoid leaking internal stack traces in response
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Internal error occurred while calculating session risk score."
        )
