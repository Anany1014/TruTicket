"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Fades content in the first time it scrolls into view.
 *
 * One IntersectionObserver per element, unobserved as soon as it fires — the page
 * stops doing work the moment the section has appeared. With reduced motion the
 * element is visible from the start and no observer is created.
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  /** 0–4, maps to the .rv-1 … .rv-4 stagger classes. */
  delay?: 0 | 1 | 2 | 3 | 4;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("in");
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.15 },
    );

    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`rv ${delay ? `rv-${delay}` : ""} ${className}`.trim()}>
      {children}
    </div>
  );
}

/**
 * The resale-cap bar. It fills when it scrolls into view, so the reader sees the
 * point being made rather than reading a number.
 */
export function CapMeter({ percent = 110, face = "₹100", cap = "₹110" }: { percent?: number; face?: string; cap?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="cap-visual" ref={ref}>
      <div className="cap-bar">
        <div className="cap-fill" style={{ ["--cap" as string]: `${percent}%` }} />
        <div className="cap-cap" />
      </div>
      <div className="cap-legend">
        <span>
          Face value <b>{face}</b>
        </span>
        <span>
          Hard cap <b style={{ color: "var(--violet)" }}>{cap}</b> — the backend refuses anything above it
        </span>
      </div>
    </div>
  );
}
