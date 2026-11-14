"use client";

import Link from "next/link";

/** Real artwork for the demo events; the backend has no image field yet. */
const POSTERS = ["/events/diljit-ahmedabad.jpg", "/events/home-festival-goa.jpg", "/events/doomsday.jpg"];
import { ProgressBar } from "@/components/ui";
import { MockBadge, LiveBadge, DataErrorNote, LoadingRows } from "@/components/MockBadge";
import { usePublishedEvents, totalsFrom } from "@/lib/use-published-events";
import { inr, num, pct } from "@/lib/format";

/** Formats an ISO timestamp for display. */
function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * The published events from the `events` Edge Function ("list").
 *
 * This is the only live organiser list the backend has today: it shows PUBLISHED
 * events platform-wide, not the signed-in organiser's own events (drafts included).
 * The account-level numbers on the overview stay on mock because there is no
 * endpoint for them.
 */
export function LiveEventList() {
  const { events, loading, error } = usePublishedEvents();

  return (
    <section className="card">
      <div className="card-head">
        <h2 className="card-title">Published events on TruTicket</h2>
        {events ? <LiveBadge label="Live" /> : <MockBadge label="Loading" />}
      </div>

      {loading ? <LoadingRows rows={3} /> : null}

      {error ? (
        <>
          <DataErrorNote message={error.message} code={error.code} />
          <MockBadge />
        </>
      ) : null}

      {events && events.length === 0 ? (
        <p className="small muted">No published events on the DEV backend yet.</p>
      ) : null}

      {events && events.length > 0 ? (
        <>
          <div className="grid-3">
            {events.map((e, i) => {
              const cap = e.ticketTypes.reduce((s, t) => s + t.quantity, 0);
              const sold = e.ticketTypes.reduce((s, t) => s + (t.quantity - t.seatsLeft), 0);
              const revenue = e.ticketTypes.reduce(
                (s, t) => s + (t.quantity - t.seatsLeft) * (t.faceValueMinor / 100),
                0,
              );
              return (
                <Link key={e.id} href={`/organiser/events/${e.id}`} className="event-tile">
                  <img
                    className="event-art event-art-img"
                    src={POSTERS[i % POSTERS.length]}
                    alt={`${e.title} banner`}
                    loading="lazy"
                    decoding="async"
                  />
                  <div className="event-tile-body">
                    <b>{e.title}</b>
                    <span className="muted small">{e.venue}</span>
                    <span className="muted small">{whenLabel(e.startAt)}</span>
                    <ProgressBar value={sold} max={cap} />
                    <span className="small muted">
                      {num(sold)} / {num(cap)} seats taken · {inr(revenue)}
                    </span>
                    <span className="small muted">
                      {pct(cap > 0 ? (sold / cap) * 100 : 0)} taken · {e.ticketTypes.length} ticket types
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
          <div className="small muted">
            These are the published events on the DEV backend. The list is platform-wide: the backend has no endpoint
            yet for the signed-in organiser&rsquo;s own events, including drafts.
          </div>
        </>
      ) : null}
    </section>
  );
}

/**
 * Live totals for the published events: how many events, how many seats are
 * taken and left, and what those seats are worth at face value.
 */
export function LiveEventTotals() {
  const { events, loading, error } = usePublishedEvents();

  if (loading) {
    return (
      <div className="grid-kpi">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="kpi">
            <div className="skeleton-row" style={{ width: "60%" }} />
            <div className="skeleton-row" style={{ width: "40%", marginTop: 8 }} />
          </div>
        ))}
      </div>
    );
  }

  if (error || !events) {
    return (
      <div className="notice warn">
        The live totals could not be loaded ({error?.code ?? "UNKNOWN"}). The numbers below are mock.
      </div>
    );
  }

  const t = totalsFrom(events);
  if (t.events === 0) {
    return <div className="notice warn">No published events on the DEV backend yet, so there are no live totals.</div>;
  }

  return (
    <div className="grid-kpi">
      <div className="kpi">
        <div className="kpi-label">Published events (live)</div>
        <div className="kpi-value">{num(t.events)}</div>
        <div className="kpi-hint t-info">from the DEV backend</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Seats taken (live)</div>
        <div className="kpi-value">{num(t.sold)}</div>
        <div className="kpi-hint t-info">of {num(t.capacity)}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Seats left (live)</div>
        <div className="kpi-value">{num(t.seatsLeft)}</div>
        <div className="kpi-hint t-info">{pct(t.capacity > 0 ? (t.seatsLeft / t.capacity) * 100 : 0, 1)} of capacity</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Face value of seats taken (live)</div>
        <div className="kpi-value">{inr(t.revenue)}</div>
        <div className="kpi-hint t-info">seats taken × face value</div>
      </div>
    </div>
  );
}
