"use client";

import { useEffect, useState } from "react";
import { Badge, Card, Kpi, PageHeader, ProgressBar } from "@/components/ui";
import { RISK_EVENTS } from "@/lib/admin-data";
import {
  checkMlHealth,
  simulateScenario,
  scoreSession,
  type MlHealthResponse,
  type MlScoreResult,
} from "@/lib/ml-client";

const BAND = { LOW: "success", MEDIUM: "warning", HIGH: "danger", CRITICAL: "danger" } as const;

type RiskItem = {
  ref: string;
  type: string;
  band: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  score: number;
  event: string;
  status: string;
  probabilities?: { human: number; moderate_bot: number; advanced_bot: number };
  reasons?: string[];
  actionRecommendation?: string;
};

export default function RiskQueue() {
  const [events, setEvents] = useState<RiskItem[]>(RISK_EVENTS as RiskItem[]);
  const [mlHealth, setMlHealth] = useState<MlHealthResponse | null>(null);
  const [mlError, setMlError] = useState<string | null>(null);
  const [evaluating, setEvaluating] = useState<string | null>(null);
  const [lastEvaluated, setLastEvaluated] = useState<MlScoreResult | null>(null);

  // Poll / check ML model status on load
  useEffect(() => {
    async function fetchHealth() {
      try {
        const h = await checkMlHealth();
        setMlHealth(h);
        setMlError(null);
      } catch (err: any) {
        setMlError(err.message || "Could not reach ML service");
        setMlHealth(null);
      }
    }
    fetchHealth();
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

  const open = events.filter((r) => r.status !== "Closed").length;
  const high = events.filter((r) => r.band === "HIGH" || r.band === "CRITICAL").length;

  const handleSimulate = async (scenario: "clean_human" | "moderate_scraper_bot" | "advanced_stealth_bot") => {
    setEvaluating(scenario);
    try {
      const res = await simulateScenario(scenario);
      setLastEvaluated(res);

      // Create queue entry from live ML inference
      const newItem: RiskItem = {
        ref: `RISK-${Math.floor(1000 + Math.random() * 9000)}`,
        type:
          scenario === "clean_human"
            ? "Organic attendee checkout"
            : scenario === "moderate_scraper_bot"
            ? "High-frequency scraper bot"
            : "Evasive stealth scalper bot",
        band: res.risk_band,
        score: Math.round(res.risk_score),
        event: "Live ML Model Evaluation",
        status: res.risk_band === "LOW" ? "Closed" : "Open",
        probabilities: res.class_probabilities,
        reasons: res.reason_codes,
        actionRecommendation: res.action_recommendation,
      };

      setEvents((prev) => [newItem, ...prev]);
    } catch (e: any) {
      alert(`ML Evaluation failed: ${e.message}`);
    } finally {
      setEvaluating(null);
    }
  };

  const handleClose = (ref: string) => {
    setEvents((prev) =>
      prev.map((e) => (e.ref === ref ? { ...e, status: "Closed" } : e))
    );
  };

  return (
    <>
      <PageHeader
        title="Risk events queue"
        subtitle="Automated behavioral risk scoring powered by TruTicket Random Forest & Kinematic Rules Engine."
        actions={
          mlHealth?.model_loaded ? (
            <Badge tone="success">ML Engine Online · v{mlHealth.version}</Badge>
          ) : mlError ? (
            <Badge tone="danger">ML Service Offline</Badge>
          ) : (
            <Badge tone="warning">Connecting to ML...</Badge>
          )
        }
      />

      <div className="grid-kpi">
        <Kpi label="Open events" value={String(open)} tone="info" />
        <Kpi label="High / Critical" value={String(high)} tone="danger" />
        <Kpi
          label="ML Model Status"
          value={mlHealth?.model_loaded ? "Online" : "Degraded"}
          tone={mlHealth?.model_loaded ? "success" : "danger"}
          hint={mlHealth?.model_loaded ? "3-Class RF + Rules" : mlError || "Offline"}
        />
        <Kpi label="Median time to triage" value="11 min" />
      </div>

      {/* Interactive ML Simulator Card */}
      <Card
        title="Live ML Model Evaluator & Bot Simulator"
        action={
          <span className="small muted">
            FastAPI :8000 · POST /score
          </span>
        }
      >
        <p className="small muted" style={{ marginBottom: "1rem" }}>
          Test the live trained Random Forest pipeline against simulated interaction signals (mouse dynamics, inter-request velocity, and request telemetry).
        </p>

        <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1.25rem" }}>
          <button
            className="btn btn-outline"
            disabled={evaluating !== null}
            onClick={() => handleSimulate("clean_human")}
          >
            {evaluating === "clean_human" ? "Scoring..." : "🧪 Test Human Session"}
          </button>
          <button
            className="btn btn-outline"
            disabled={evaluating !== null}
            onClick={() => handleSimulate("moderate_scraper_bot")}
          >
            {evaluating === "moderate_scraper_bot" ? "Scoring..." : "🤖 Test Scraper Bot"}
          </button>
          <button
            className="btn btn-outline"
            disabled={evaluating !== null}
            onClick={() => handleSimulate("advanced_stealth_bot")}
          >
            {evaluating === "advanced_stealth_bot" ? "Scoring..." : "🚨 Test Stealth Bot"}
          </button>
        </div>

        {lastEvaluated && (
          <div
            style={{
              padding: "1rem",
              borderRadius: "8px",
              background: "rgba(255, 255, 255, 0.04)",
              border: "1px solid rgba(255, 255, 255, 0.1)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span className="strong">Latest Live Inference Result ({lastEvaluated.session_id})</span>
              <Badge tone={BAND[lastEvaluated.risk_band] || "neutral"}>
                {lastEvaluated.risk_band} ({Math.round(lastEvaluated.risk_score)}/100)
              </Badge>
            </div>

            <ProgressBar
              value={lastEvaluated.risk_score}
              max={100}
              color={
                lastEvaluated.risk_band === "LOW"
                  ? "var(--success, #10b981)"
                  : lastEvaluated.risk_band === "MEDIUM"
                  ? "var(--warning, #f59e0b)"
                  : "var(--danger, #ef4444)"
              }
            />

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.5rem", marginTop: "0.75rem" }} className="small">
              <div>
                <span className="muted">Predicted: </span>
                <span className="strong">{lastEvaluated.predicted_class}</span>
              </div>
              <div>
                <span className="muted">P(human): </span>
                <span>{(lastEvaluated.class_probabilities.human * 100).toFixed(1)}%</span>
              </div>
              <div>
                <span className="muted">P(moderate): </span>
                <span>{(lastEvaluated.class_probabilities.moderate_bot * 100).toFixed(1)}%</span>
              </div>
              <div>
                <span className="muted">P(advanced): </span>
                <span>{(lastEvaluated.class_probabilities.advanced_bot * 100).toFixed(1)}%</span>
              </div>
            </div>

            <div className="small" style={{ marginTop: "0.5rem" }}>
              <span className="muted">Action Policy: </span>
              <span>{lastEvaluated.action_recommendation}</span>
            </div>

            {lastEvaluated.reason_codes && lastEvaluated.reason_codes.length > 0 && (
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                <span className="small muted">Triggered Reasons:</span>
                {lastEvaluated.reason_codes.map((rc) => (
                  <Badge key={rc} tone="warning">
                    {rc}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="Queue">
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Type</th>
                <th>Band</th>
                <th className="right">Score</th>
                <th>Event / Context</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {events.map((r) => (
                <tr key={r.ref}>
                  <td className="strong">{r.ref}</td>
                  <td>{r.type}</td>
                  <td>
                    <Badge tone={BAND[r.band as keyof typeof BAND] || "neutral"}>{r.band}</Badge>
                  </td>
                  <td className="right num">{r.score}</td>
                  <td className="small">{r.event}</td>
                  <td className="small">{r.status}</td>
                  <td>
                    {r.status !== "Closed" ? (
                      <button
                        className="btn btn-sm btn-outline"
                        onClick={() => handleClose(r.ref)}
                      >
                        Dismiss
                      </button>
                    ) : (
                      <span className="small muted">Resolved</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
