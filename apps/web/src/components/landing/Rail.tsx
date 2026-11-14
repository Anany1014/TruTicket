"use client";

import { useEffect, useRef } from "react";

type Card = {
  /** Real artwork, when we have it. */
  art?: string;
  tint?: [string, string];
  title: string;
  meta: string;
  when: string;
};

const CARDS: Card[] = [
  {
    art: "/events/diljit-ahmedabad.jpg",
    title: "Diljit Dosanjh",
    meta: "Aura India Tour · Ahmedabad",
    when: "21 Nov",
  },
  {
    art: "/events/home-festival-goa.jpg",
    title: "HOME · Arijit Singh",
    meta: "Music festival · Vagator, Goa",
    when: "29–30 Dec",
  },
  {
    art: "/events/doomsday.jpg",
    title: "Doomsday",
    meta: "Premiere night · PVR Phoenix",
    when: "18 Dec",
  },
  {
    tint: ["#c9f73c", "#5a7a12"],
    title: "Sunset Music Festival",
    meta: "DY Patil Stadium · Navi Mumbai",
    when: "24–26 Aug",
  },
  {
    tint: ["#a78bfa", "#3b2a6b"],
    title: "Tech Summit",
    meta: "BKC Convention Hall · Mumbai",
    when: "13 Sep",
  },
];

/**
 * The pinned poster rail.
 *
 * The section is three screens tall, the inner panel sticks while it passes, and
 * the cards pan sideways across that distance. Two custom properties drive it —
 * `--pan` (how far the rail has to travel, measured, so there is never dead space
 * at the end) and `--sp` (0 → 1 through the section).
 */
export function Rail() {
  const ref = useRef<HTMLElement | null>(null);
  const railRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    const rail = railRef.current;
    if (!el || !rail) return;

    // Measure once per resize: the rail only needs to move by the amount it
    // actually overflows the viewport.
    const measure = () => {
      const overflow = Math.max(rail.scrollWidth - rail.parentElement!.clientWidth, 0);
      el.style.setProperty("--pan", `${-Math.round(overflow)}px`);
      apply();
    };

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let frame = 0;
    const apply = () => {
      frame = 0;
      if (reduced) {
        el.style.setProperty("--sp", "0");
        return;
      }
      const r = el.getBoundingClientRect();
      const travel = Math.max(el.offsetHeight - window.innerHeight, 1);
      el.style.setProperty("--sp", Math.min(Math.max(-r.top / travel, 0), 1).toFixed(4));
    };

    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onResize = () => {
      measure();
    };

    measure();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <section className="rail-section" id="drops" ref={ref}>
      <div className="rail-sticky">
        <div className="lp-shell rail-inner">
          <div className="rail-head">
            <span className="eyebrow">
              <i />
              On the platform
            </span>
            <h2>
              Real drops. <em>Real venues.</em>
            </h2>
            <p>
              Every ticket on TruTicket is tied to a named venue, a fixed capacity and a real gate. Scroll through
              what is live right now.
            </p>
          </div>

          <div className="rail-viewport">
            <div className="rail" ref={railRef}>
              {CARDS.map((c, i) => (
                <article className="poster" key={c.title} style={{ "--i": i } as React.CSSProperties}>
                  <div className="poster-art">
                    {c.art ? (
                      <img src={c.art} alt={`${c.title} poster`} loading="lazy" decoding="async" width={640} height={900} />
                    ) : (
                      <div
                        className="poster-grad"
                        style={{ background: `radial-gradient(120% 90% at 30% 0%, ${c.tint![0]}, ${c.tint![1]} 62%, #08080a)` }}
                      />
                    )}
                  </div>
                  <div className="poster-body">
                    <b>{c.title}</b>
                    <span>{c.meta}</span>
                    <span className="poster-when">{c.when}</span>
                  </div>
                </article>
              ))}

              <article className="poster poster-cta">
                <div className="poster-cta-inner">
                  <b>Your event here</b>
                  <span>Publish a drop and set the resale cap yourself.</span>
                  <a href="/organiser" className="btn btn-primary btn-sm">
                    Open portal
                  </a>
                </div>
              </article>
            </div>
          </div>

          <div className="rail-foot">
            <span>Scroll</span>
            <div className="rail-track" aria-hidden="true">
              <i />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
