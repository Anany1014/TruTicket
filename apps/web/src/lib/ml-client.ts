/**
 * TruTicket Machine Learning & Behavioral Fraud Detection Client
 * Connects the web application to the FastAPI ML Risk Service.
 */

export interface MlHealthResponse {
  status: string;
  model_loaded: boolean;
  version: string;
  classes: string[];
  timestamp: string;
}

export interface ClassProbabilities {
  human: number;
  moderate_bot: number;
  advanced_bot: number;
}

export interface MlScoreResult {
  session_id: string;
  predicted_class: "human" | "moderate_bot" | "advanced_bot";
  class_probabilities: ClassProbabilities;
  risk_score: number;
  risk_band: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reason_codes: string[];
  model_version: string;
  action_recommendation: string;
}

export interface SampleSessions {
  clean_human: Record<string, unknown>;
  moderate_scraper_bot: Record<string, unknown>;
  advanced_stealth_bot: Record<string, unknown>;
}

const DEFAULT_ML_URL = "http://localhost:8000";

export function getMlServiceUrl(): string {
  if (typeof window !== "undefined") {
    // In browser, use relative API route to prevent CORS or network boundary issues
    return "/api/ml";
  }
  return process.env.ML_SERVICE_URL || process.env.NEXT_PUBLIC_ML_SERVICE_URL || DEFAULT_ML_URL;
}

/** Check health and model readiness of the ML service */
export async function checkMlHealth(): Promise<MlHealthResponse> {
  const base = getMlServiceUrl();
  const res = await fetch(`${base}/health`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`ML Service responded with HTTP ${res.status}`);
  }
  return res.json();
}

/** Score a user session using behavioral telemetry */
export async function scoreSession(features: Record<string, unknown>): Promise<MlScoreResult> {
  const base = getMlServiceUrl();
  const res = await fetch(`${base}/score`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(features),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Scoring request failed" }));
    throw new Error(err.detail || `ML Service responded with HTTP ${res.status}`);
  }
  return res.json();
}

/** Fetch predefined sample sessions for interactive testing and demonstration */
export async function getSampleSessions(): Promise<SampleSessions> {
  const base = getMlServiceUrl();
  const res = await fetch(`${base}/sample-sessions`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Failed to fetch sample sessions: HTTP ${res.status}`);
  }
  return res.json();
}

/** Run an instant simulation with a predefined scenario */
export async function simulateScenario(scenario: "clean_human" | "moderate_scraper_bot" | "advanced_stealth_bot"): Promise<MlScoreResult> {
  const base = getMlServiceUrl();
  const res = await fetch(`${base}/simulate?scenario=${scenario}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  if (!res.ok) {
    throw new Error(`Simulation failed: HTTP ${res.status}`);
  }
  return res.json();
}
