"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Badge, Card, Kpi } from "@/components/ui";
import { LiveBadge, DataErrorNote, LoadingRows } from "@/components/MockBadge";
import { callAuthed } from "@/lib/session";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/use-session";
import { inr, num } from "@/lib/format";

/** One ticket, as `tickets` "mine" returns it. */
type Ticket = {
  id: string;
  status: string;
  faceValueMinor: number;
  events: { id: string; title: string; venue: string; startAt: string } | null;
  ticket_types: { id: string; name: string } | null;
};

type MineResponse = { ok: true; tickets: Ticket[] };
type QrResponse = { ok: true; token: string; expires_at: string; ttl_seconds: number };

function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * The signed-in user's own tickets, from `tickets` "mine".
 *
 * Two actions, both real calls:
 * - "Show entry code" asks `tickets` "qr" for a rotating token that is valid for a
 *   short window, and counts the window down so nobody screenshots it and walks in later.
 * - "Sell" asks `resale` "list" to put the ticket on the resale market. The server
 *   decides the price cap, so an over-cap amount comes back as the server's own refusal
 *   with the highest allowed price.
 */
export function MyTickets() {
  const { signedIn, ready } = useSession();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);

  const [qrFor, setQrFor] = useState<string | null>(null);
  const [qr, setQr] = useState<QrResponse | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const [sellFor, setSellFor] = useState<string | null>(null);
  const [ask, setAsk] = useState("");
  const [sellBusy, setSellBusy] = useState(false);
  const [sellMessage, setSellMessage] = useState<{ text: string; tone: "ok" | "err" } | null>(null);

  useEffect(() => {
    if (!ready || !signedIn) {
      setTickets(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);

    callAuthed<MineResponse>("tickets", { action: "mine" })
      .then((res) => {
        if (alive) setTickets(res.tickets ?? []);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const err = e instanceof ApiError ? e : new ApiError("UNKNOWN", "Something went wrong.");
        setError({ message: err.message, code: err.code });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [signedIn, ready]);

  // Tick once a second only while a code is on screen.
  useEffect(() => {
    if (!qr) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [qr]);

  const secondsLeft = useMemo(() => {
    if (!qr) return 0;
    return Math.max(0, Math.round((new Date(qr.expires_at).getTime() - now) / 1000));
  }, [qr, now]);

  async function showQr(ticketId: string) {
    setQrFor(ticketId);
    setQr(null);
    setQrError(null);
    setQrBusy(true);
    try {
      const res = await callAuthed<QrResponse>("tickets", { action: "qr", ticket_id: ticketId });
      setQr(res);
      setNow(Date.now());
    } catch (e) {
      setQrError(e instanceof ApiError ? e.message : "Could not make a code.");
    } finally {
      setQrBusy(false);
    }
  }

  async function listForResale(ticketId: string) {
    setSellMessage(null);
    const rupees = Number(ask);
    if (!Number.isFinite(rupees) || rupees <= 0) {
      setSellMessage({ text: "Enter an amount in rupees.", tone: "err" });
      return;
    }
    setSellBusy(true);
    try {
      const res = await callAuthed<{ ok: true; listing_id: string; max_minor: number }>("resale", {
        action: "list",
        ticket_id: ticketId,
        ask_minor: Math.round(rupees * 100),
      });
      setSellMessage({
        text: `Listed. The highest price allowed for this ticket is ${inr(res.max_minor / 100)}.`,
        tone: "ok",
      });
      setSellFor(null);
      setAsk("");
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError("UNKNOWN", "Could not list the ticket.");
      setSellMessage({ text: `${err.message} (${err.code})`, tone: "err" });
    } finally {
      setSellBusy(false);
    }
  }

  if (!ready) return <LoadingRows rows={3} />;

  if (!signedIn) {
    return (
      <div className="notice info">
        <b>Sign in to see your tickets.</b> Tickets belong to an account, so the backend needs to know who is asking.
        <div style={{ marginTop: 10 }}>
          <Link href="/sign-in?next=%2Ftickets" className="btn btn-sm btn-primary">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (loading) return <LoadingRows rows={4} />;
  if (error) return <DataErrorNote message={error.message} code={error.code} />;

  const rows = tickets ?? [];
  const active = rows.filter((t) => t.status === "ACTIVE").length;
  const value = rows.reduce((s, t) => s + t.faceValueMinor / 100, 0);

  return (
    <>
      <div className="grid-kpi">
        <Kpi label="Tickets" value={num(rows.length)} />
        <Kpi label="Active" value={num(active)} tone="success" />
        <Kpi label="Face value held" value={inr(value)} />
      </div>

      <Card title="Your tickets" action={<LiveBadge />}>
        {rows.length === 0 ? (
          <p className="small muted">No tickets yet. Tickets appear here once an order is paid for.</p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Venue</th>
                  <th>Starts</th>
                  <th>Type</th>
                  <th className="right">Face value</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td className="strong">{t.events?.title ?? "—"}</td>
                    <td className="small">{t.events?.venue ?? "—"}</td>
                    <td className="small">{t.events ? whenLabel(t.events.startAt) : "—"}</td>
                    <td className="small">{t.ticket_types?.name ?? "—"}</td>
                    <td className="right num">{inr(t.faceValueMinor / 100)}</td>
                    <td>
                      <Badge tone={t.status === "ACTIVE" ? "success" : "warning"}>{t.status}</Badge>
                    </td>
                    <td>
                      <div className="row">
                        <button className="btn btn-sm" onClick={() => showQr(t.id)} disabled={t.status !== "ACTIVE"}>
                          Entry code
                        </button>
                        <button
                          className="btn btn-sm"
                          onClick={() => {
                            setSellFor(sellFor === t.id ? null : t.id);
                            setSellMessage(null);
                            setAsk("");
                          }}
                          disabled={t.status !== "ACTIVE"}
                        >
                          Sell
                        </button>
                      </div>

                      {sellFor === t.id ? (
                        <div className="inline-panel">
                          <label className="field-label" htmlFor={`ask-${t.id}`}>
                            Your asking price (₹)
                          </label>
                          <div className="row">
                            <input
                              id={`ask-${t.id}`}
                              className="input"
                              style={{ maxWidth: 140 }}
                              inputMode="decimal"
                              value={ask}
                              onChange={(e) => setAsk(e.target.value)}
                              placeholder={String(Math.round(t.faceValueMinor / 100))}
                            />
                            <button className="btn btn-sm btn-primary" onClick={() => listForResale(t.id)} disabled={sellBusy}>
                              {sellBusy ? "Listing…" : "List for resale"}
                            </button>
                          </div>
                          <div className="small muted" style={{ marginTop: 6 }}>
                            The backend sets the cap. The cap is a share of the {inr(t.faceValueMinor / 100)} face value,
                            so an amount that is too high is refused with the highest allowed price.
                          </div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {sellMessage ? (
          <div className={`notice ${sellMessage.tone === "ok" ? "" : "danger"}`} style={{ marginTop: 12 }}>
            {sellMessage.text}
          </div>
        ) : null}
      </Card>

      {qrFor ? (
        <Card
          title="Entry code"
          action={
            <button className="btn btn-sm" onClick={() => { setQrFor(null); setQr(null); setQrError(null); }}>
              Close
            </button>
          }
        >
          {qrBusy ? <LoadingRows rows={2} /> : null}
          {qrError ? <div className="notice danger">{qrError}</div> : null}
          {qr ? (
            <>
              <div className="qr-token">{qr.token}</div>
              <div className="row" style={{ marginTop: 12, alignItems: "center" }}>
                <Badge tone={secondsLeft > 0 ? "success" : "danger"}>
                  {secondsLeft > 0 ? `Valid for ${secondsLeft}s` : "Expired"}
                </Badge>
                <button className="btn btn-sm btn-primary" onClick={() => qrFor && showQr(qrFor)}>
                  New code
                </button>
              </div>
              <div className="small muted" style={{ marginTop: 10 }}>
                The gate scans this token. It rotates, so an old screenshot stops working after the countdown. Ask for a
                new code at the gate if it runs out.
              </div>
            </>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
