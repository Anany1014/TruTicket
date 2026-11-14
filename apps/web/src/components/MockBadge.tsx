/**
 * A visible tag that says a screen or a block of data is still mock data.
 *
 * Every screen that is not yet live must show one of these, so nobody reads the
 * numbers as real. `MockBadge` is the plain tag; `LiveBadge` marks the opposite.
 */

export function MockBadge({ label = "Mock data" }: { label?: string }) {
  return (
    <span
      className="mock-badge mock"
      title="This is placeholder data. The backend endpoint does not exist yet."
    >
      <span className="dotmark" aria-hidden="true" />
      {label}
    </span>
  );
}

export function LiveBadge({ label = "Live" }: { label?: string }) {
  return (
    <span className="mock-badge live" title="Read from the DEV backend in real time.">
      <span className="dotmark" aria-hidden="true" />
      {label}
    </span>
  );
}

/** A short line that says which endpoint the data comes from. */
export function DataSourceNote({ children }: { children: React.ReactNode }) {
  return <span className="small muted">Source: {children}</span>;
}

/** Placeholder rows while a live call is in flight. */
export function LoadingRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="stack" aria-busy="true" aria-live="polite">
      <span className="small muted">Loading from the DEV backend…</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="skeleton-row" style={{ width: `${100 - i * 12}%` }} />
      ))}
    </div>
  );
}

/** The screen for a failed live call. The reason is shown next to the mock badge. */
export function DataErrorNote({ message, code }: { message: string; code?: string }) {
  return (
    <div className="notice warn">
      <b>Could not load live data.</b> {message}
      {code ? <span className="small muted"> ({code})</span> : null}
    </div>
  );
}
