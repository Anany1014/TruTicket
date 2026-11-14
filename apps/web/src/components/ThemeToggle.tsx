"use client";

import { useCallback, useEffect, useState } from "react";

type Theme = "dark" | "light";

/**
 * Dark ⇄ light switch for the whole app.
 *
 * The swap is a circular wipe that grows from the button itself: the View
 * Transitions API snapshots the old page, and a clip-path circle on the incoming
 * snapshot is animated from the click point outwards. Browsers without the API
 * (and anyone who asked for reduced motion) get an instant swap instead — the
 * theme still changes, only the flourish is skipped.
 */
export function ThemeToggle({ label = true }: { label?: boolean }) {
  const [theme, setTheme] = useState<Theme>("dark");

  // The inline script in the layout has already set the attribute before paint;
  // this just syncs React's copy so the icon is right.
  useEffect(() => {
    const current = document.documentElement.getAttribute("data-theme");
    setTheme(current === "light" ? "light" : "dark");
  }, []);

  const toggle = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const next: Theme = theme === "dark" ? "light" : "dark";

      const apply = () => {
        document.documentElement.setAttribute("data-theme", next);
        try {
          localStorage.setItem("tt-theme", next);
        } catch {
          /* private mode — the theme just won't persist */
        }
        setTheme(next);
      };

      const doc = document as Document & {
        startViewTransition?: (cb: () => void) => { ready: Promise<void> };
      };
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

      if (!doc.startViewTransition || reduced) {
        apply();
        return;
      }

      const x = e.clientX || window.innerWidth - 48;
      const y = e.clientY || 48;
      const radius = Math.hypot(
        Math.max(x, window.innerWidth - x),
        Math.max(y, window.innerHeight - y),
      );

      const transition = doc.startViewTransition(apply);
      transition.ready
        .then(() => {
          document.documentElement.animate(
            {
              clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
            },
            {
              duration: 620,
              easing: "cubic-bezier(.4,0,.2,1)",
              pseudoElement: "::view-transition-new(root)",
            },
          );
        })
        .catch(() => {
          /* transition was interrupted — the theme still applied */
        });
    },
    [theme],
  );

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggle}
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      title={theme === "dark" ? "Light mode" : "Dark mode"}
    >
      <span aria-hidden="true">{theme === "dark" ? "☀" : "☾"}</span>
      {label ? <span className="theme-toggle-label">{theme === "dark" ? "Light" : "Dark"}</span> : null}
    </button>
  );
}
