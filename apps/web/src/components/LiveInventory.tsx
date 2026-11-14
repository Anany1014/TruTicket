"use client";

import Link from "next/link";
import { Badge, Card, Kpi, ProgressBar } from "@/components/ui";
import { MockBadge, LiveBadge, DataErrorNote, LoadingRows } from "@/components/MockBadge";
import { usePublishedEvents, totalsFrom } from "@/lib/use-published-events";
import { inr, num, pct } from "@/lib/format";

/**
 * Live ticket inventory, read from the `events` Edge Function ("list").
 *
 * The backend gives each ticket type its name, face value, quantity, seats left,
 * per-account limit and sale window. It does not give the sold, reserved,
 * listed, cancelled, redeemed or group-unassigned counts, and it is platform-wide
 * rather than one organiser's. The screen says so and keeps the counts it does
 * not have on mock.
 */
export function LiveInventory() {
  const { events, loading, error } = usePublishedEvents();

  if (loading) {
    return (
      <Card title="Live ticket types">
        <LoadingRows rows={4} />
      </Card>
    );
  }

  if (error) {
    return (
      <Card title="Live ticket types">
        <DataErrorNote message={error.message} code={error.code} />
      </Card>
    );
  }

  const list = events ?? [];
  const t = totalsFrom(list);

  if (list.length === 0) {
    return (
      <Card title="Live ticket types">
        <p className="small muted">No published events on the DEV backend yet, so there is no live inventory to show.</p>
      </Card>
    );
  }

  return (
    <>
      <div className="grid-kpi">
        <Kpi label="Published events" value={num(t.events)} />
        <Kpi label="Ticket types" value={num(t.ticketTypes)} />
        <Kpi label="Total capacity" value={num(t.capacity)} />
        <Kpi label="Seats taken" value={num(t.sold)} hint={`${pct(t.capacity > 0 ? (t.sold / t.capacity) * 100 : 0, 1)} of capacity`} tone="info" />
        <Kpi label="Seats left" value={num(t.seatsLeft)} tone="info" />
        <Kpi label="Value of seats taken" value={inr(t.revenue)} hint="seats taken × face value" />
      </div>

      {list.map((e) => (
        <Card
          key={e.id}
          title={`${e.title} · ${e.venue}`}
          action={
            <div className="row">
              <LiveBadge />
              <Link href={`/organiser/events/${e.id}`} className="btn btn-sm btn-outline">
                Open
              </Link>
            </div>
          }
        >
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Ticket type</th>
                  <th className="right">Face value</th>
                  <th className="right">Total qty</th>
                  <th className="right">Seats taken</th>
                  <th className="right">Seats left</th>
                  <th>Fill rate</th>
                  <th className="right">Limit</th>
                  <th>Sale window</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {e.ticketTypes.map((t) => {
                  const taken = Math.max(0, t.quantity - t.seatsLeft);
                  const window =
                    t.saleStart && t.saleEnd
                      ? `${new Date(t.saleStart).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${new Date(
                          t.saleEnd,
                        ).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
                      : "—";
                  return (
                    <tr key={t.id}>
                      <td className="strong">{t.name}</td>
                      <td className="right num">{inr(t.faceValueMinor / 100)}</td>
                      <td className="right num">{num(t.quantity)}</td>
                      <td className="right num">
                        {num(taken)}
                        <div style={{ width: 110, marginLeft: "auto", marginTop: 4 }}>
                          <ProgressBar value={taken} max={t.quantity} />
                        </div>
                      </td>
                      <td className="right num">{num(t.seatsLeft)}</td>
                      <td className="small muted">{pct(t.quantity > 0 ? (taken / t.quantity) * 100 : 0, 1)}</td>
                      <td className="right num">{t.perAccountLimit ?? "—"}</td>
                      <td className="small">{window}</td>
                      <td>
                        <Badge tone={t.seatsLeft > 0 ? "success" : "danger"}>{t.seatsLeft > 0 ? "On sale" : "Sold out"}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ))}

      <div className="notice warn">
        These rows are live: face value, quantity, seats left, per-account limit and sale window come from the
        backend. The counts the backend does not expose — reserved, listed, cancelled, redeemed and group-unassigned —
        are on the mock table below, and the list is platform-wide because there is no endpoint for one
        organiser&rsquo;s own events yet.
      </div>
    </>
  );
}
