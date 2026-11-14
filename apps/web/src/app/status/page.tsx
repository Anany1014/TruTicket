"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ApiError, functionsUrl, isBackendConfigured, supabaseAnonKey } from "@/lib/api";

type Check = {
  name: string;
  state: "running" | "ok" | "fail";
  detail: string;
  hint?: string;
};

/** Masks a key so the page can prove one is loaded without printing it. */
function mask(value: string): string {
  if (!value) return "(not set)";
  if (value.length <= 14) return `${value.slice(0, 4)}…`;
  return `${value.slice(0, 8)}…${value.slice(-6)} (${value.length} chars)`;
}

/**
 * Connection diagnostics.
 *
 * Every lookup on this page answers one question: when a screen says it could not load
 * live data, is the problem the configuration, the network, or the browser? The page
 * prints the exact URL it calls and the exact failure, so nobody has to guess.
 */
export default function StatusPage() {
  const [checks, setChecks] = useState<Check[]>([]);

  const envUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  const anon = supabaseAnonKey();

  let baseUrl = "";
  let urlError: string | null = null;
  try {
    baseUrl = functionsUrl();
  } catch (e) {
    urlError = e instanceof ApiError ? `${e.code}: ${e.message}` : String(e);
  }

  useEffect(() => {
    let alive = true;

    async function run() {
      const results: Check[] = [];
      const push = (c: Check) => {
        if (!alive) return;
        results.push(c);
        setChecks([...results]);
      };

      // 1. Can the browser resolve the URL at all?
      if (urlError) {
        push({ name: "Backend URL", state: "fail", detail: urlError, hint: "This is a configuration problem, not a network one." });
        return;
      }
      push({ name: "Backend URL", state: "ok", detail: baseUrl });

      // 2. A plain reachability probe. `no-cors` tells us the host answers at all
      //    without needing CORS headers; an opaque response still means "reachable".
      try {
        await fetch(`${baseUrl}/events`, { method: "OPTIONS", mode: "cors" });
        push({ name: "Host reachable", state: "ok", detail: "The browser got a reply from supabase.co." });
      } catch {
        push({
          name: "Host reachable",
          state: "fail",
          detail: "The browser could not reach the host at all.",
          hint: "No internet, a firewall, a VPN, or an extension is blocking supabase.co.",
        });
        return;
      }

      // 3. The real call the app makes.
      const started = Date.now();
      try {
        const res = await fetch(`${baseUrl}/events`, {
          method: "POST",
          headers: anon ? { "Content-Type": "application/json", apikey: anon } : { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "list" }),
        });
        const ms = Date.now() - started;
        const json = (await res.json().catch(() => null)) as { events?: unknown[]; error?: { code?: string; message?: string } } | null;

        if (res.ok && json && Array.isArray(json.events)) {
          push({
            name: "events.list",
            state: "ok",
            detail: `${res.status} in ${ms} ms · ${json.events.length} published event(s) returned.`,
          });
        } else {
          push({
            name: "events.list",
            state: "fail",
            detail: `HTTP ${res.status} · ${json?.error?.code ?? "no error code"} · ${json?.error?.message ?? "unexpected reply"}`,
            hint: res.status === 401 ? "The anon key is wrong or missing for this project." : undefined,
          });
        }
      } catch {
        push({
          name: "events.list",
          state: "fail",
          detail: "The request was blocked before a reply came back.",
          hint: "Usually CORS or an extension. Open DevTools → Network, click the events request, and read the error.",
        });
      }

      // 4. Is a key present? Printed masked, never in full.
      push({
        name: "Anon key",
        state: anon ? "ok" : "fail",
        detail: anon ? mask(anon) : "(not set) — the app still works on DEV, because the gateway accepts calls without it",
      });
    }

    run();
    return () => {
      alive = false;
    };
    // The checks depend only on the env, which cannot change while the page is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="standalone">
      <PageHeader
        title="Connection status"
        subtitle="What the browser can and cannot reach. Use this when a screen says it could not load live data."
        actions={
          <Link href="/organiser" className="btn">
            Back to the app
          </Link>
        }
      />

      <Card title="Configuration" action={<Badge tone={isBackendConfigured() && !urlError ? "success" : "danger"}>
        {isBackendConfigured() && !urlError ? "Loaded" : "Problem"}
      </Badge>}>
        <div className="kv">
          <span>NEXT_PUBLIC_SUPABASE_URL</span>
          <span className="mono">{envUrl || "(not set)"}</span>
        </div>
        <div className="kv">
          <span>Base URL in use</span>
          <span className="mono">{baseUrl || "(unavailable)"}</span>
        </div>
        <div className="kv">
          <span>NEXT_PUBLIC_SUPABASE_ANON_KEY</span>
          <span className="mono">{mask(anon)}</span>
        </div>
        <div className="small muted" style={{ marginTop: 10 }}>
          These values are read from <code>apps/web/.env.local</code>. That file is never committed and never shipped in
          the ZIP, so it has to exist on this machine. Next.js only reads it when the dev server starts: after creating
          or editing it, stop the server and run <code>npm run dev</code> again.
        </div>
      </Card>

      <Card title="Live checks">
        {checks.length === 0 ? <p className="small muted">Running…</p> : null}
        <div className="table-wrap">
          {checks.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Check</th>
                  <th>Result</th>
                  <th>Detail</th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c) => (
                  <tr key={c.name}>
                    <td className="strong">{c.name}</td>
                    <td>
                      <Badge tone={c.state === "ok" ? "success" : c.state === "fail" ? "danger" : "warning"}>
                        {c.state === "ok" ? "OK" : c.state === "fail" ? "Failed" : "Running"}
                      </Badge>
                    </td>
                    <td className="small">
                      {c.detail}
                      {c.hint ? <div className="muted" style={{ marginTop: 4 }}>{c.hint}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      </Card>

      <Card title="If a check fails">
        <ol className="small" style={{ margin: 0, paddingLeft: 20, lineHeight: 1.9 }}>
          <li>
            <b>Backend URL failed</b> — <code>apps/web/.env.local</code> is missing or has the wrong project. It must
            contain the DEV URL <code>https://oviqjnzlgbkmggytaqao.supabase.co</code>. Restart <code>npm run dev</code>{" "}
            afterwards.
          </li>
          <li>
            <b>Host not reachable</b> — your machine or browser cannot reach supabase.co. Turn off any VPN, then try
            another browser with extensions disabled.
          </li>
          <li>
            <b>events.list blocked</b> — open DevTools → Network, click the <code>events</code> request and read the
            error text. A CORS message means the request never reached the function.
          </li>
          <li>
            <b>HTTP 401</b> — the anon key does not belong to this project. Copy it again from the DEV project settings.
          </li>
        </ol>
      </Card>
    </div>
  );
}
