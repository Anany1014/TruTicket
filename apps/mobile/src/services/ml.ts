/**
 * TruTicket Mobile ML Risk Client
 * Communicates with the ML Service for mobile bot and fraud prevention.
 */
export interface MobileRiskResult {
  session_id: string;
  risk_score: number;
  risk_band: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  reason_codes: string[];
  recommended_action: string;
}

export async function evaluateMobileSessionRisk(
  sessionId: string,
  features: Record<string, unknown> = {}
): Promise<MobileRiskResult> {
  const mlUrl = process.env.EXPO_PUBLIC_ML_SERVICE_URL || "http://localhost:8000";
  try {
    const res = await fetch(`${mlUrl}/score`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        session_id: sessionId,
        action: "checkout",
        ...features,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      return {
        session_id: data.session_id,
        risk_score: data.risk_score,
        risk_band: data.risk_band,
        reason_codes: data.reason_codes || [],
        recommended_action: data.action_recommendation || "allow",
      };
    }
  } catch {
    // Fail-open for client telemetry, backend edge function enforces final risk check
  }
  return {
    session_id: sessionId,
    risk_score: 0,
    risk_band: "LOW",
    reason_codes: [],
    recommended_action: "allow",
  };
}
