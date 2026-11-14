"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

/* ── A believable QR, built from a seeded pattern ─────────────────────────────
   Real QR decoding is not the point; it has to *read* as a QR at a glance, so we
   draw three finder squares and a deterministic module field. Deterministic =
   the same picture on the server and the client, so no hydration mismatch. */
function qrDataUri(seed: number, size = 25) {
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };

  const cells: string[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inFinder =
        (x < 8 && y < 8) || (x >= size - 8 && y < 8) || (x < 8 && y >= size - 8);
      if (inFinder) continue;
      if (rnd() > 0.47) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
  }
  const finder = (fx: number, fy: number) =>
    `<rect x="${fx}" y="${fy}" width="7" height="7" fill="none" stroke="#0a0f00" stroke-width="1"/>` +
    `<rect x="${fx + 2}" y="${fy + 2}" width="3" height="3"/>`;

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
    `<rect width="${size}" height="${size}" fill="#eaffb4"/>` +
    `<g fill="#0a0f00">${cells.join("")}${finder(0, 0)}${finder(size - 7, 0)}${finder(0, size - 7)}</g>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Debris that converges into the card. x / y are offsets from the card centre. */
const SHARDS = [
  { x: -290, y: -168, r: 16, k: "card", d: 0.0 },
  { x: -196, y: -206, r: -20, k: "label", t: "SAT · 14 NOV", d: 0.04 },
  { x: -336, y: -74, r: 7, k: "card", d: 0.12 },
  { x: -240, y: -40, r: -28, k: "label", t: "DATE", d: 0.02 },
  { x: -312, y: 68, r: 22, k: "bracket", d: 0.16 },
  { x: -184, y: 108, r: -14, k: "card", d: 0.06 },
  { x: -140, y: 22, r: 34, k: "label", t: "₹1,500", d: 0.13 },
  { x: -234, y: 168, r: 12, k: "qr", d: 0.2 },
  { x: -68, y: -186, r: -9, k: "label", t: "A · EAST", d: 0.05 },
  { x: 74, y: -168, r: 24, k: "qr", d: 0.17 },
  { x: -18, y: -118, r: -33, k: "label", t: "GA FLOOR", d: 0.03 },
  { x: 186, y: -186, r: -18, k: "card", d: 0.07 },
  { x: 292, y: -128, r: 15, k: "bracket", d: 0.15 },
  { x: 242, y: -50, r: 28, k: "label", t: "TT-#4821", d: 0.02 },
  { x: 336, y: 22, r: -13, k: "card", d: 0.18 },
  { x: 214, y: 84, r: 20, k: "qr", d: 0.08 },
  { x: 302, y: 158, r: -25, k: "card", d: 0.19 },
  { x: 68, y: 180, r: -17, k: "qr", d: 0.11 },
  { x: -34, y: 140, r: 30, k: "label", t: "GEN · ADULT", d: 0.06 },
  { x: 372, y: -78, r: 8, k: "bracket", d: 0.21 },
] as const;

const STEPS = ["Shattered", "Identity", "QR signed", "Gate scan", "Verified"];
const BINDING = [
  "Shards inbound · nothing signed yet",
  "Binding Ticket DNA · holder identity matched",
  "Signing QR payload · ed25519 key",
  "Gate A handshake · challenge accepted",
  "Ticket DNA locked · ₹1,500 face value on-chain",
];

const stageOf = (v: number) => (v < 0.2 ? 0 : v < 0.45 ? 1 : v < 0.7 ? 2 : v < 0.9 ? 3 : 4);

/**
 * The assembly hero.
 *
 * The pass builds itself the moment the page opens, then stays interactive:
 * point at it and the pieces fly back apart; move away and it puts itself
 * together again.
 *
 * One number drives the whole thing — `--p`, 0 (scattered) → 1 (verified) — set
 * on the section. Each shard derives its own delayed slice of it, so the cascade
 * is staggered without any JS per element, and React only re-renders when the
 * whole percent or the stage changes.
 */
export function AssembleHero() {
  const ref = useRef<HTMLDivElement | null>(null);
  const value = useRef(0);
  const tween = useRef({ raf: 0, from: 0, to: 0, start: 0, dur: 0 });

  const [pct, setPct] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(10);

  const paint = useCallback((v: number) => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--p", v.toFixed(4));

    const whole = Math.round(v * 100);
    setPct((prev) => (prev === whole ? prev : whole));
    const sec = Math.max(1, Math.round(10 - v * 8));
    setSecondsLeft((prev) => (prev === sec ? prev : sec));
  }, []);

  const animateTo = useCallback(
    (to: number, dur: number) => {
      const t = tween.current;
      cancelAnimationFrame(t.raf);

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        value.current = to;
        paint(to);
        return;
      }

      t.from = value.current;
      t.to = to;
      t.start = performance.now();
      t.dur = Math.max(dur, 1);

      const step = (now: number) => {
        const k = Math.min((now - t.start) / t.dur, 1);
        // easeInOutQuad — snaps less at either end than a linear ramp
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const v = t.from + (t.to - t.from) * e;
        value.current = v;
        paint(v);
        if (k < 1) t.raf = requestAnimationFrame(step);
      };
      t.raf = requestAnimationFrame(step);
    },
    [paint],
  );

  // Assemble on open, a beat after first paint so the pieces are seen first.
  useEffect(() => {
    value.current = 0;
    paint(0);
    const id = window.setTimeout(() => animateTo(1, 1700), 240);
    const t = tween.current;
    return () => {
      window.clearTimeout(id);
      cancelAnimationFrame(t.raf);
    };
  }, [animateTo, paint]);

  const stage = stageOf(pct / 100);

  return (
    <section className="asm" ref={ref} aria-label="How a TruTicket pass assembles">
      <div className="asm-sticky">
        <div className="asm-grid-bg" aria-hidden="true" />

        <div className="lp-shell asm-shell">
          <div className="asm-layout">
            {/* ── Left: the pitch ─────────────────────────────────────── */}
            <div className="asm-copy">
              <Link href="/status" className="asm-pill">
                <span className="asm-pill-new">NEW</span>
                FairQueue seed audit is now public <span aria-hidden="true">→</span>
              </Link>

              <h1 className="asm-h1">
                Tickets belong to
                <br />
                <em>fans,</em>
                <br />
                not scalpers.
              </h1>

              <p className="asm-lede">
                Every ticket used to break somewhere — bots, fakes, screenshots, scalpers. Watch
                TruTicket rebuild one: verified identity, a contract-capped price, and a QR that
                rotates every 10 seconds. Then point at it to take it apart again.
              </p>

              <div className="asm-actions">
                <Link href="/organiser" className="btn btn-primary asm-btn">
                  Join the FairQueue <span aria-hidden="true">→</span>
                </Link>
                <Link href="/organiser/gate" className="btn asm-btn asm-btn-ghost">
                  <span className="asm-dot" /> Watch the Gate Live
                </Link>
              </div>

              {/* Live read-out of the assembly */}
              <div className="asm-panel">
                <div className="asm-panel-head">
                  <span>
                    <i className="asm-live-dot" /> Ticket assembly
                  </span>
                  <b>{String(pct).padStart(3, "0")}%</b>
                </div>

                <div className="asm-panel-bar">
                  <i style={{ transform: `scaleX(${Math.max(pct, 2) / 100})` }} />
                </div>

                <div className="asm-panel-steps">
                  {STEPS.map((label, i) => (
                    <span key={label} className={i <= stage ? "on" : undefined}>
                      {label}
                    </span>
                  ))}
                </div>

                <div className="asm-panel-note">
                  <span aria-hidden="true">›</span> {BINDING[stage]}
                </div>
              </div>

              <p className="asm-hint2">
                Hover the pass to shatter it — it rebuilds itself
              </p>
            </div>

            {/* ── Right: the card ─────────────────────────────────────── */}
            <div
              className="asm-right"
              onPointerEnter={() => animateTo(0, 640)}
              onPointerLeave={() => animateTo(1, 1150)}
            >
              <div className="asm-field" aria-hidden="true">
                {SHARDS.map((s, i) => (
                  <div
                    key={i}
                    className={`shard shard-${s.k}`}
                    style={{ "--x": s.x, "--y": s.y, "--r": s.r, "--d": s.d } as React.CSSProperties}
                  >
                    {s.k === "label" ? <span>{"t" in s ? s.t : ""}</span> : null}
                    {s.k === "qr" ? <i /> : null}
                  </div>
                ))}
              </div>

              <div className="asm-stage">
                <div className="asm-card">
                  <div className="asm-head">
                    <span className="asm-mark">TT</span>
                    <span className="asm-brand">TRUTICKET · DYNAMIC PASS</span>
                    <span className="asm-badge">
                      <span className="asm-badge-assembling">◆ ASSEMBLING</span>
                      <span className="asm-badge-live">● LIVE</span>
                    </span>
                  </div>

                  <h2 className="asm-title">NEON PULSE FEST &rsquo;26</h2>
                  <p className="asm-sub">Anyana b2b Tale Of Us · Open-Air Arena, Bengaluru</p>

                  <div className="asm-meta">
                    <div>
                      <span>Date</span>
                      <b>Sat · 14 Nov</b>
                    </div>
                    <div>
                      <span>Gate</span>
                      <b>A · East</b>
                    </div>
                    <div>
                      <span>Section</span>
                      <b>GA Floor</b>
                    </div>
                    <div>
                      <span>Face value</span>
                      <b>₹1,500</b>
                    </div>
                    <div>
                      <span>Tier</span>
                      <b>Gen · Adult</b>
                    </div>
                    <div>
                      <span>Token</span>
                      <b>TT-#4821</b>
                    </div>
                  </div>

                  <div className="asm-stub-line">
                    <i />
                    <i />
                  </div>

                  <div className="asm-qr-wrap">
                    <div className="asm-qr" style={{ backgroundImage: qrDataUri(4821) }} />
                    <div className="asm-scan">
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>
                    <div className="asm-verified">✓ VERIFIED · 0.8s</div>
                  </div>

                  <div className="asm-timer">
                    <span>Rotating QR · refresh in</span>
                    <b>0:0{secondsLeft}.0</b>
                  </div>
                  <div className="asm-progress">
                    <i />
                  </div>

                  <div className="asm-foot">
                    <span className="asm-status">
                      <span className="asm-status-await">● AWAITING ASSEMBLY</span>
                      <span className="asm-status-live">● ACTIVE · VERIFIED</span>
                    </span>
                    <span className="asm-nonce">NONCE e56b…7b38 · ed25519</span>
                  </div>
                </div>

                {/* Verdicts that drop in once it verifies */}
                <div className="asm-verdict v-valid">
                  <b>VALID ENTRY</b>
                  <span>Gate A · scanned in 0.8s</span>
                </div>
                <div className="asm-verdict v-bot">
                  <b>BOT BLOCKED</b>
                  <span>Risk 94/100 · session held</span>
                </div>
                <div className="asm-verdict v-cap">
                  <b>RESALE CAP ₹1,650</b>
                  <span>110% of face · contract enforced</span>
                </div>
              </div>

              <div className="asm-corner">
                <span>NONCE a364…de50 · ed25519</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
