import Link from "next/link";
import type { Metadata } from "next";
import { Logo } from "@/components/Logo";
import { AssembleHero } from "@/components/landing/AssembleHero";
import { Rail } from "@/components/landing/Rail";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Reveal, CapMeter } from "@/components/landing/Reveal";
import "./landing.css";

export const metadata: Metadata = {
  title: "TruTicket · Fair access. Genuine tickets. Controlled resale.",
  description:
    "TruTicket mints verifiable tickets, rotates entry codes every ten seconds, and caps resale so fans pay a fair price.",
};

const MARQUEE = [
  "Verified drops",
  "Zero scalper markups",
  "Rotating entry codes",
  "Capped resale",
  "Chain-backed tickets",
  "Indian cities",
];

/**
 * The public landing page.
 *
 * It is not one of the 18 portal screens and reads nothing from the backend: the
 * only live data in the app stays on the organiser and buyer screens. Everything
 * on this page is CSS — the 3D objects are gradients, borders and glows.
 */
export default function LandingPage() {
  return (
    <div className="lp">
      <header className="lp-nav">
        <div className="lp-nav-brand">
          <Logo height={26} />
        </div>
        <nav className="lp-nav-links" aria-label="Landing">
          <a href="#why">Why it exists</a>
          <a href="#how">How it works</a>
          <a href="#resale">Resale cap</a>
        </nav>
        <div className="lp-nav-cta">
          <ThemeToggle label={false} />
          <Link href="/sign-in" className="btn btn-sm">
            Sign in
          </Link>
          <Link href="/organiser" className="btn btn-sm btn-primary">
            Open portal
          </Link>
        </div>
      </header>

      <AssembleHero />

      <div className="marquee" aria-hidden="true">
        <div className="marquee-track">
          {[0, 1].map((k) => (
            <span key={k}>
              {MARQUEE[0]}
              {MARQUEE.slice(1).map((m) => (
                <span key={m}>{m}</span>
              ))}
            </span>
          ))}
        </div>
      </div>

      <Rail />

      {/* ── Bento: why it exists ─────────────────────────────────────────── */}
      <section className="section" id="why">
        <div className="lp-shell">
          <Reveal>
            <div className="bento-head">
              <span className="eyebrow">
                <i />
                Why it exists
              </span>
              <h2>
                A ticket should reach the fan <em>who wants it.</em>
              </h2>
              <p>
                A good drop sells out in seconds and reappears at three times the price. Three ideas
                fix that — and all three are already running in this build.
              </p>
            </div>
          </Reveal>

          <div className="bento">
            <Reveal delay={1} className="bento-card w3 tall">
              <div className="bento-art">
                <div className="glow-pad" />
                <div className="obj-ticket" />
              </div>
              <div className="bento-text">
                <h3>
                  One ticket, <em>one owner</em>
                </h3>
                <p>
                  Every ticket is minted against a record that names its owner. It moves only through
                  paths the platform allows, so a screenshot is never a ticket.
                </p>
              </div>
            </Reveal>

            <Reveal delay={2} className="bento-card w3">
              <div className="bento-art">
                <div className="glow-pad" />
                <div className="obj-scan">
                  <span />
                  <span />
                  <span />
                  <span />
                  <i />
                </div>
              </div>
              <div className="bento-text">
                <h3>
                  Codes that <em>expire</em>
                </h3>
                <p>
                  The entry token rotates every ten seconds and the gate checks it live. A code
                  forwarded on chat is dead by the time it is scanned.
                </p>
              </div>
            </Reveal>

            <Reveal delay={1} className="bento-card w2">
              <div className="bento-art">
                <div className="glow-pad violet" />
                <div className="obj-chain">
                  <span />
                  <span />
                  <span />
                </div>
              </div>
              <div className="bento-text">
                <h3>
                  Chain-<em>backed</em>
                </h3>
                <p>Ownership is written where nobody can quietly rewrite it.</p>
              </div>
            </Reveal>

            <Reveal delay={2} className="bento-card w4">
              <div className="bento-art">
                <div className="glow-pad" />
                <div className="obj-cap">
                  <div className="ceiling" />
                  <div className="cap-row">
                    <div className="bar b1" />
                    <div className="bar b2" />
                    <div className="bar b3" />
                  </div>
                </div>
              </div>
              <div className="bento-text">
                <h3>
                  Resale with a <em>ceiling</em>
                </h3>
                <p>
                  A ticket can be re-listed, but never above the organiser&rsquo;s cap. The seller
                  keeps their money, the buyer keeps their budget, the scalper keeps nothing.
                </p>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── Steps ────────────────────────────────────────────────────────── */}
      <section className="section" id="how" style={{ paddingTop: 0 }}>
        <div className="lp-shell">
          <Reveal>
            <div className="bento-head" style={{ marginBottom: 0 }}>
              <span className="eyebrow">
                <i />
                The flow
              </span>
              <h2>
                From drop to gate <em>in three steps.</em>
              </h2>
            </div>
          </Reveal>

          <div className="lp-steps">
            <Reveal delay={1} className="lp-step">
              <div className="n">01</div>
              <h3>Pick your seats</h3>
              <p>
                A seat is held for ten minutes while you pay. Nothing is taken from someone else until
                the payment lands.
              </p>
            </Reveal>
            <Reveal delay={2} className="lp-step">
              <div className="n">02</div>
              <h3>Walk in with a live code</h3>
              <p>
                The app shows a rotating token. The gate scans it once, marks it used, and a re-scan is
                refused.
              </p>
            </Reveal>
            <Reveal delay={3} className="lp-step">
              <div className="n">03</div>
              <h3>Can&rsquo;t make it? Re-list it</h3>
              <p>
                Sell it back through resale at or under the cap. The buyer gets a genuine ticket and the
                price stays sane.
              </p>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── The cap ──────────────────────────────────────────────────────── */}
      <section className="section" id="resale" style={{ paddingTop: 0 }}>
        <div className="lp-shell">
          <Reveal>
            <div className="bento-head" style={{ marginBottom: 0 }}>
              <span className="eyebrow">
                <i />
                The cap
              </span>
              <h2>
                The ceiling is set by the organiser, <em>not the market.</em>
              </h2>
              <p>
                The backend refuses any ask above the cap and replies with the highest price it will
                accept. The number on the right of the bar is a hard limit for that ticket.
              </p>
            </div>
            <CapMeter percent={76} face="₹1,000" cap="₹1,100" />
          </Reveal>
        </div>
      </section>

      {/* ── CTA ──────────────────────────────────────────────────────────── */}
      <section className="section" style={{ paddingTop: 0 }}>
        <div className="lp-shell">
          <Reveal>
            <div className="cta-band">
              <h2>Run your next drop without feeding the resale market.</h2>
              <p>
                The organiser portal is open. Publish an event, watch seats move in real time, and set
                the resale cap yourself.
              </p>
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
                <Link href="/organiser" className="btn btn-primary" style={{ height: 50, padding: "0 28px", fontSize: 15 }}>
                  Open the portal
                </Link>
                <Link href="/status" className="btn" style={{ height: 50, padding: "0 24px", fontSize: 15 }}>
                  Check the connection
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <div className="lp-shell">
        <footer className="lp-foot">
          <Logo height={22} />
          <span>Fair access. Genuine tickets. Controlled resale.</span>
          <nav className="lp-foot-links" aria-label="Footer">
            <Link href="/organiser">Organiser</Link>
            <Link href="/admin">Admin</Link>
            <Link href="/tickets">My tickets</Link>
            <Link href="/status">Status</Link>
          </nav>
        </footer>
      </div>
    </div>
  );
}
