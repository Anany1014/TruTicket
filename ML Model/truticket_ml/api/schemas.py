"""
schemas.py
==========
Pydantic Request and Response Schemas for TruTicket Scoring API.
Validates session-level engineered features and structures scoring response.
"""

from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field

class SessionFeaturesRequest(BaseModel):
    session_id: str = Field(..., description="Unique 26-character or UUID session identifier", example="sess_97hf7ciplt2k54f5j6109nek")
    
    # Mouse movement features (optional/nullable to accommodate touch/missing sessions)
    mouse_total_moves: Optional[float] = Field(None, description="Total recorded mouse move events", ge=0)
    mouse_total_clicks: Optional[float] = Field(None, description="Total recorded mouse click events", ge=0)
    mouse_total_events: Optional[float] = Field(None, description="Total mouse interaction events (moves + clicks)", ge=0)
    mouse_click_to_move: Optional[float] = Field(None, description="Ratio of clicks to moves", ge=0)
    mouse_total_path_px: Optional[float] = Field(None, description="Total cumulative path length traversed in pixels", ge=0)
    mouse_straight_line_px: Optional[float] = Field(None, description="Euclidean distance from start to end coordinates in pixels", ge=0)
    mouse_straightness: Optional[float] = Field(None, description="Straightness ratio (straight distance / path length)", ge=0.0, le=1.0)
    mouse_dist_mean: Optional[float] = Field(None, description="Mean step distance between consecutive coordinates", ge=0)
    mouse_dist_std: Optional[float] = Field(None, description="Standard deviation of step distances", ge=0)
    mouse_dist_min: Optional[float] = Field(None, description="Minimum step distance", ge=0)
    mouse_dist_max: Optional[float] = Field(None, description="Maximum step distance", ge=0)
    mouse_direction_changes: Optional[float] = Field(None, description="Count of directional heading changes > 30 degrees", ge=0)
    mouse_dir_change_rate: Optional[float] = Field(None, description="Direction changes divided by total move events", ge=0)
    mouse_speed_mean_px_s: Optional[float] = Field(None, description="Mean cursor speed in pixels per second", ge=0)
    mouse_speed_std_px_s: Optional[float] = Field(None, description="Standard deviation of cursor speed", ge=0)
    mouse_speed_max_px_s: Optional[float] = Field(None, description="Maximum observed cursor speed in pixels/sec", ge=0)
    mouse_speed_reliable: Optional[int] = Field(1, description="Flag indicating if timestamps align reliably (1=yes, 0=no)", ge=0, le=1)
    mouse_has_data: Optional[int] = Field(1, description="Flag indicating presence of mouse data (1=present, 0=missing)", ge=0, le=1)

    # Web log features
    log_total_requests: Optional[float] = Field(None, description="Total HTTP requests recorded for this session", ge=0)
    log_get_requests: Optional[float] = Field(None, description="Count of GET requests", ge=0)
    log_post_requests: Optional[float] = Field(None, description="Count of POST requests", ge=0)
    log_unique_urls: Optional[float] = Field(None, description="Number of unique URLs accessed", ge=0)
    log_static_requests: Optional[float] = Field(None, description="Number of requests for static assets (CSS, JS, images)", ge=0)
    log_content_requests: Optional[float] = Field(None, description="Number of content/catalog page requests", ge=0)
    log_home_requests: Optional[float] = Field(None, description="Landing page requests", ge=0)
    log_mouse_post_count: Optional[float] = Field(None, description="POST requests sending mouse tracking packets", ge=0)
    log_fingerprint_js_hits: Optional[float] = Field(None, description="Requests for browser fingerprinting script", ge=0)
    log_other_requests: Optional[float] = Field(None, description="Other requests", ge=0)
    log_internal_requests: Optional[float] = Field(None, description="Internal server dummy requests", ge=0)
    log_session_duration_s: Optional[float] = Field(None, description="Elapsed session duration from first to last request in seconds", ge=0)
    log_requests_per_second: Optional[float] = Field(None, description="Request velocity (requests / duration)", ge=0)
    log_gap_mean_s: Optional[float] = Field(None, description="Mean time gap between consecutive HTTP requests in seconds", ge=0)
    log_gap_std_s: Optional[float] = Field(None, description="Standard deviation of inter-request gaps in seconds", ge=0)
    log_gap_min_s: Optional[float] = Field(None, description="Minimum inter-request gap in seconds", ge=0)
    log_gap_max_s: Optional[float] = Field(None, description="Maximum inter-request gap in seconds", ge=0)
    log_gap_median_s: Optional[float] = Field(None, description="Median inter-request gap in seconds", ge=0)
    log_unique_content_pages: Optional[float] = Field(None, description="Number of unique content pages viewed", ge=0)
    log_content_revisit_ratio: Optional[float] = Field(None, description="Revisited content pages ratio", ge=0, le=1.0)
    log_max_url_repetitions: Optional[float] = Field(None, description="Maximum repetition count of any single URL", ge=0)
    log_static_dyn_ratio: Optional[float] = Field(None, description="Ratio of static to dynamic requests", ge=0)
    log_http10_ratio: Optional[float] = Field(None, description="Proportion of requests using HTTP/1.0", ge=0, le=1.0)
    log_has_fingerprint_js: Optional[float] = Field(None, description="Binary indicator if fingerprint JS was downloaded", ge=0, le=1)
    log_is_empty_ua: Optional[float] = Field(None, description="Binary indicator if User-Agent header was missing or blank", ge=0, le=1)
    log_referer_is_https_obs: Optional[float] = Field(None, description="Observed HTTPS referer indicator", ge=0, le=1)
    log_has_data: Optional[int] = Field(1, description="Flag indicating presence of web log data", ge=0, le=1)

    model_config = {
        "extra": "ignore",
        "json_schema_extra": {
            "example": {
                "session_id": "test_human_session_01",
                "mouse_total_moves": 8332,
                "mouse_total_clicks": 11,
                "mouse_total_events": 8343,
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
                "log_session_duration_s": 253.0,
                "log_requests_per_second": 0.727,
                "log_gap_std_s": 0.89,
                "log_has_data": 1
            }
        }
    }

class ClassProbabilities(BaseModel):
    human: float = Field(..., description="Estimated probability of organic human behavior", ge=0.0, le=1.0)
    moderate_bot: float = Field(..., description="Estimated probability of moderate script/automation bot", ge=0.0, le=1.0)
    advanced_bot: float = Field(..., description="Estimated probability of evasive advanced bot", ge=0.0, le=1.0)

class ScoreResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    session_id: str = Field(..., description="Session identifier")
    predicted_class: str = Field(..., description="Predicted behavioral entity: human | moderate_bot | advanced_bot")
    class_probabilities: ClassProbabilities = Field(..., description="Probability breakdown across entity classes")
    risk_score: float = Field(..., description="Calibrated continuous risk score from 0 (safest human) to 100 (highest risk bot)", ge=0.0, le=100.0)
    risk_band: str = Field(..., description="Categorical risk tier: LOW | MEDIUM | HIGH | CRITICAL")
    reason_codes: List[str] = Field(..., description="Explainable behavioral reason codes justifying the risk assessment")
    model_version: str = Field(..., description="Model and scoring engine version")
    action_recommendation: str = Field(..., description="Recommended platform enforcement action based on PRD Section 12")

class HealthResponse(BaseModel):
    model_config = {"protected_namespaces": ()}
    status: str = Field(..., example="healthy")
    model_loaded: bool = Field(..., example=True)
    version: str = Field(..., example="1.0.0")
    classes: List[str] = Field(..., example=["human", "moderate_bot", "advanced_bot"])
