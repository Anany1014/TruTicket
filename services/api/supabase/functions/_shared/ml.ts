// TruTicket ML Risk Service Client (docs/ML_BRIEF.md & docs/API_CONTRACTS.md)
// Interfaces Supabase Edge Functions with the FastAPI ML Risk Service.

export interface SessionFeatures {
  session_id: string;
  user_id?: string;
  event_id?: string;
  action?: "queue_join" | "checkout" | "resale_list";
  
  // Behavioral mouse telemetry
  mouse_total_moves?: number;
  mouse_total_clicks?: number;
  mouse_total_events?: number;
  mouse_click_to_move?: number;
  mouse_total_path_px?: number;
  mouse_straightness?: number;
  mouse_dist_mean?: number;
  mouse_dist_std?: number;
  mouse_direction_changes?: number;
  mouse_dir_change_rate?: number;
  mouse_speed_mean_px_s?: number;
  mouse_speed_std_px_s?: number;
  mouse_speed_reliable?: number;
  mouse_has_data?: number;

  // Web request telemetry
  log_total_requests?: number;
  log_get_requests?: number;
  log_post_requests?: number;
  log_unique_urls?: number;
  log_session_duration_s?: number;
  log_requests_per_second?: number;
  log_gap_mean_s?: number;
  log_gap_std_s?: number;
  log_has_data?: number;

  // Account / session fallback features
  account_age_days?: number;
  purchase_attempts?: number;
  account_reuse_count?: number;
  session_reuse_count?: number;
  device_integrity_score?: number;
  rapid_holds_count?: number;
  rapid_cancellations_count?: number;
  events_attempted?: number;
  time_between_actions_ms?: number;
  ip_burst_count?: number;
}

export interface RiskScoreResult {
  session_id: string;
  predicted_class: "human" | "moderate_bot" | "advanced_bot" | "unknown";
  risk_score: number; // 0 to 100
  risk_band: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reason_codes: string[];
  model_version: string;
  action_recommendation: string;
}

/** Fallback rules scorer when ML service is unreachable (fail-closed, safety first) */
export function evaluateRuleFallback(features: SessionFeatures): RiskScoreResult {
  let score = 0;
  const reasons: string[] = [];

  if ((features.account_age_days ?? 30) < 7) {
    score += 25;
    reasons.push("NEW_ACCOUNT");
  }
  if ((features.purchase_attempts ?? 1) > 5) {
    score += 20;
    reasons.push("RAPID_CHECKOUT_CADENCE");
  }
  if ((features.ip_burst_count ?? 0) > 10) {
    score += 20;
    reasons.push("IP_BURST_RATE_EXCEEDED");
  }
  if ((features.rapid_holds_count ?? 0) > 3) {
    score += 15;
    reasons.push("RAPID_HOLDS");
  }
  if ((features.device_integrity_score ?? 1.0) < 0.5) {
    score += 15;
    reasons.push("LOW_DEVICE_INTEGRITY");
  }
  if ((features.session_reuse_count ?? 0) > 3) {
    score += 10;
    reasons.push("SESSION_REUSE");
  }

  score = Math.min(score, 100);

  let band: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  let action = "ALLOW: Frictionless checkout path granted.";

  if (score >= 80) {
    band = "CRITICAL";
    action = "FLAG_REVIEW: High bot confidence. Flag for inventory release or admin audit.";
  } else if (score >= 60) {
    band = "HIGH";
    action = "RESTRICT: Place session into delayed virtual queue with reduced inventory hold timeout.";
  } else if (score >= 30) {
    band = "MEDIUM";
    action = "CHALLENGE: Step-up verification required (CAPTCHA or SMS OTP challenge).";
  }

  return {
    session_id: features.session_id,
    predicted_class: band === "CRITICAL" || band === "HIGH" ? "moderate_bot" : "human",
    risk_score: score,
    risk_band: band,
    reason_codes: reasons.slice(0, 3),
    model_version: "v0-rules-fallback",
    action_recommendation: action,
  };
}

/**
 * Score a user session against the ML service.
 * Defaults to ML_SERVICE_URL env var or http://localhost:8000.
 * Falls back to fail-safe rule engine if ML service times out.
 */
export async function scoreSessionWithMl(
  features: SessionFeatures,
  mlServiceUrl: string = Deno.env.get("ML_SERVICE_URL") || "http://localhost:8000"
): Promise<RiskScoreResult> {
  const timeoutMs = 2500;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${mlServiceUrl.replace(/\/+$/, "")}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(features),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (res.ok) {
      const data = await res.json();
      return {
        session_id: data.session_id ?? features.session_id,
        predicted_class: data.predicted_class ?? "unknown",
        risk_score: Number(data.risk_score ?? 0),
        risk_band: data.risk_band ?? "LOW",
        reason_codes: Array.isArray(data.reason_codes) ? data.reason_codes : [],
        model_version: data.model_version ?? "1.0.0-rf-hybrid",
        action_recommendation: data.action_recommendation ?? "ALLOW",
      };
    }
  } catch (err) {
    console.warn(`ML service call failed or timed out (${err}). Using rules engine fallback.`);
  } finally {
    clearTimeout(timer);
  }

  return evaluateRuleFallback(features);
}
