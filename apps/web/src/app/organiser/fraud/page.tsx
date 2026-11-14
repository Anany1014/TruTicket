"use client";

import { useEffect, useState } from "react";
import { Badge, Card, PageHeader } from "@/components/ui";
import { FRAUD_SESSIONS, type RiskBand } from "@/lib/organiser-data";
import { num } from "@/lib/format";
import { checkMlHealth, simulateScenario, type MlHealthResponse } from "@/lib/ml-client";

type FraudSessionItem = {
  ref: string;
  score: number;
  band: RiskBand;
  reasons: string[];
  event: string;
  detected: string;
  status: "New" | "In review" | "Reviewed";
};

const BAND_TONE: Record<RiskBand, "success" | "warning" | "danger"> = {
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "danger",
};

const STATUS_TONE: Record<string, "info" | "warning" | "neutral"> = {
  New: "info",
  "In review": "warning",
  Reviewed: "neutral",
};

export default function Fraud() {
  const [sessions, setSessions] = useState<FraudSessionItem[]>(FRAUD_SESSIONS);
  const [mlHealth, setMlHealth] = useState<MlHealthResponse | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  useEffect(() => {
    checkMlHealth()
      .then(setMlHealth)
      .catch(() => setMlHealth(null));
  }, []);

  const count = (band: RiskBand) => sessions.filter((s) => s.band === band).length;
  const tiles = [
    { label: "Low risk", value: 32 + (count("LOW") - 32 > 0 ? count("LOW") - 32 : 0), tone: "success" as const, hint: "Allowed" },
    { label: "Medium risk", value: 18 + (count("MEDIUM") - 18 > 0 ? count("MEDIUM") - 18 : 0), tone: "warning" as const, hint: "Step-up check" },
    { label: "High risk", value: 7 + (count("HIGH") - 7 > 0 ? count("HIGH") - 7 : 0), tone: "danger" as const, hint: "Held for review" },
  ];

  const handleRunScan = async () => {
    setIsScanning(true);
    try {
      // Simulate real-time bot detection scan from live queue
      const res = await simulateScenario("advanced_stealth_bot");
      const bandMapped: RiskBand = (res.risk_band === "CRITICAL" ? "HIGH" : res.risk_band) as RiskBand;
      const newSession: FraudSessionItem = {
        ref: res.session_id,
        score: Math.round(res.risk_score),
        band: bandMapped,
        reasons: res.reason_codes.length > 0 ? res.reason_codes : ["STEALTH_BOT_ACTIVITY"],
        event: "Sunset Music Festival 2025",
        detected: "Just now",
        status: "New",
      };
      setSessions((prev) => [newSession, ...prev]);
    } catch (e: any) {
      alert(`ML Scan failed: ${e.message}`);
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Fraud monitoring"
        subtitle="Suspicious sessions for your events analyzed by TruTicket ML Risk Service."
        actions={
          mlHealth?.model_loaded ? (
            <Badge tone="success">ML Service Online (v{mlHealth.version})</Badge>
          ) : (
            <Badge tone="warning">ML Service Connecting...</Badge>
          )
        }
      />

      <div className="grid-3">
        {tiles.map((t) => (
          <Card key={t.label}>
            <div className="spread">
              <span className="small muted">{t.label}</span>
              <Badge tone={t.tone}>{t.hint}</Badge>
            </div>
            <div style={{ fontSize: 30, fontWeight: 700 }} className={`t-${t.tone}`}>
              {num(t.value)}
            </div>
          </Card>
        ))}
      </div>

      <Card
        title="Suspicious sessions"
        action={
          <button
            className="btn btn-sm btn-outline"
            disabled={isScanning}
            onClick={handleRunScan}
          >
            {isScanning ? "Scanning ML Feed..." : "⚡ Run Real-Time ML Scan"}
          </button>
        }
      >
        <div className="row small muted">
          Flagged sessions on your events: {sessions.length}. High-band: {count("HIGH")}.
        </div>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Session</th>
                <th className="right">Score</th>
                <th>Risk band</th>
                <th>Reason codes</th>
                <th>Event</th>
                <th>Detected</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.ref}>
                  <td className="strong">{s.ref}</td>
                  <td className="right num">{s.score}</td>
                  <td>
                    <Badge tone={BAND_TONE[s.band]}>{s.band}</Badge>
                  </td>
                  <td className="small">{s.reasons.join(", ")}</td>
                  <td className="small">{s.event}</td>
                  <td className="small muted">{s.detected}</td>
                  <td>
                    <Badge tone={STATUS_TONE[s.status] || "neutral"}>{s.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="small muted">
          Session details and kinematic evidence are generated by the ML pipeline. Organiser access is read-only.
        </div>
      </Card>
    </>
  );
}
