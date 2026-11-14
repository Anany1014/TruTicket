// TruTicket Risk & Bot Scoring Edge Function (docs/API_CONTRACTS.md & docs/ML_BRIEF.md)
// POST { action: "score", session_id: "...", features: { ... } }
// Calls the ML service running on ML_SERVICE_URL or falls back to rule-based scoring.

import { CORS_HEADERS, ApiError, errorResponse, json, readJsonObject } from "../_shared/http.ts";
import { scoreSessionWithMl, type SessionFeatures } from "../_shared/ml.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS_HEADERS });
  if (req.method !== "POST") return errorResponse(new ApiError(405, "METHOD_NOT_ALLOWED", "Use POST."));

  try {
    const body = await readJsonObject(req);
    const action = String(body.action || "score");

    if (action === "health") {
      const mlUrl = Deno.env.get("ML_SERVICE_URL") || "http://localhost:8000";
      let mlHealthy = false;
      let mlData = null;
      try {
        const res = await fetch(`${mlUrl}/health`, { signal: AbortSignal.timeout(2000) });
        if (res.ok) {
          mlHealthy = true;
          mlData = await res.json();
        }
      } catch {
        mlHealthy = false;
      }
      return json({ ok: true, ml_healthy: mlHealthy, ml_service_url: mlUrl, details: mlData });
    }

    if (action !== "score") {
      throw new ApiError(400, "INVALID_ACTION", "Expected action 'score' or 'health'.");
    }

    const sessionId = String(body.session_id || `sess_${Date.now()}`);
    const features: SessionFeatures = {
      session_id: sessionId,
      user_id: typeof body.user_id === "string" ? body.user_id : undefined,
      event_id: typeof body.event_id === "string" ? body.event_id : undefined,
      action: typeof body.action_context === "string" ? body.action_context as any : "checkout",
      ...(typeof body.features === "object" && body.features !== null ? body.features : body),
    };

    const result = await scoreSessionWithMl(features);
    return json({ ok: true, ...result });
  } catch (e) {
    return errorResponse(e);
  }
});
