"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Kpi, PageHeader } from "@/components/ui";
import { EventTabs } from "@/components/EventTabs";
import { MockBadge, LiveBadge, DataErrorNote, LoadingRows } from "@/components/MockBadge";
import { callFunction, ApiError } from "@/lib/api";
import type { ApiEvent, EventsGetResponse } from "@/lib/api-types";
import type { EventRecord, Tier } from "@/lib/organiser-data";
import { eventCapacity, eventRefunds, eventRevenue, eventSold } from "@/lib/organiser-data";
import { inr, num, pct } from "@/lib/format";

/** Format an ISO timestamp for display, in the browser's locale. */
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
 * Turns a live API ticket type into the `Tier` shape the tabs expect.
 *
 * The backend gives face value, quantity and seats left. It does not give sold,
 * reserved, listed, cancelled or redeemed counts, so those stay at zero and the
 * tabs show only what the backend actually knows.
 */
function toTier(t: ApiEvent["ticketTypes"][number], index: number): Tier {
  const COLORS = ["#0ACBDB", "#8B7CF6", "#F5A524", "#22C55E", "#38BDF8"];
  const sold = Math.max(0, t.quantity - t.seatsLeft);
  const saleWindow =
    t.saleStart && t.saleEnd
      ? `${new Date(t.saleStart).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} – ${new Date(
          t.saleEnd,
        ).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`
      : "—";
  return {
    name: t.name,
    color: COLORS[index % COLORS.length],
    face: t.faceValueMinor / 100,
    qty: t.quantity,
    sold,
    reserved: 0,
    listed: 0,
    cancelled: 0,
    redeemed: 0,
    groupUnassigned: 0,
    limit: t.perAccountLimit ?? 0,
    window: saleWindow,
    status: t.seatsLeft > 0 ? "On sale" : "Sold out",
  };
}

/**
 * The `events` "get" endpoint wants a UUID. A mock id like "sunset-2025" is not one,
 * so there is no point in calling the backend for it.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Event detail. Reads the event from the `events` Edge Function ("get").
 *
 * The endpoint only returns PUBLISHED events. When it has no event for this id
 * (a draft, or an id the backend does not know) the screen falls back to the
 * mock record and says so with the "Mock data" badge.
 */
export function LiveEventDetail({
  eventId,
  mock,
}: {
  eventId: string;
  mock: EventRecord | undefined;
}) {
  const [event, setEvent] = useState<ApiEvent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  // A mock id is not a UUID, so the backend has nothing for it. Skip the call.
  const isRealId = UUID.test(eventId);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);
    setEvent(null);

    if (!isRealId) {
      setError({
        message: "This id is not a backend event id, so the backend was not called.",
        code: "NOT_A_UUID",
      });
      setLoading(false);
      return;
    }

    callFunction<EventsGetResponse>("events", { action: "get", event_id: eventId })
      .then((res) => {
        if (!alive) return;
        setEvent(res.event ?? null);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const err = e instanceof ApiError ? e : new ApiError("UNKNOWN", "Something went wrong.");
        setError({ message: err.message, code: err.code });
      })
      .finally(() => {
        if (!alive) return;
        setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [eventId, isRealId]);

  // ---- Live path: the backend has this event ----
  if (event) {
    const tiers = event.ticketTypes.map(toTier);
    const cap = tiers.reduce((s, t) => s + t.qty, 0);
    const sold = tiers.reduce((s, t) => s + t.sold, 0);
    const revenue = tiers.reduce((s, t) => s + t.sold * t.face, 0);
    const avgOrder = sold > 0 ? Math.round(revenue / sold) : 0;
    const tint = ["#0ACBDB", "#8B7CF6"];

    return (
      <>
        <PageHeader
          title={event.title}
          subtitle={`${event.venue} · ${whenLabel(event.startAt)}`}
          actions={
            <>
              <LiveBadge label="Live" />
              <Badge tone="success">{event.status}</Badge>
              <Link href="/organiser/inventory" className="btn btn-outline">
                Edit event
              </Link>
            </>
          }
        />

        <div className="hero" style={{ background: `linear-gradient(120deg, ${tint[0]}, ${tint[1]} 55%, #0b0b0b)` }} />

        <div className="grid-kpi">
          <Kpi label="Tickets sold" value={`${num(sold)} / ${num(cap)}`} hint={`${pct(cap > 0 ? (sold / cap) * 100 : 0, 1)} sold`} tone="info" />
          <Kpi label="Gross revenue" value={inr(revenue)} hint="sold × face value" />
          <Kpi label="Avg order value" value={inr(avgOrder)} hint="per ticket" />
          <Kpi label="Seats left" value={num(tiers.reduce((s, t) => s + Math.max(0, t.qty - t.sold), 0))} tone="info" />
        </div>

        {event.description ? <p className="small muted">{event.description}</p> : null}

        <EventTabs tiers={tiers} />
      </>
    );
  }

  // ---- Mock path: no live event for this id ----
  if (loading) {
    return (
      <>
        <PageHeader title={mock?.title ?? "Event"} subtitle="Loading from the DEV backend…" />
        <LoadingRows rows={4} />
      </>
    );
  }

  if (!mock) {
    return (
      <>
        <PageHeader title="Event not found" subtitle="This event is not in the backend and not in the mock data." />
        <DataErrorNote message={error?.message ?? "The server has no event with this id."} code={error?.code} />
        <Link href="/organiser" className="btn">
          ← Back to overview
        </Link>
      </>
    );
  }

  const sold = eventSold(mock);
  const cap = eventCapacity(mock);
  const revenue = eventRevenue(mock);
  const refunds = eventRefunds(mock);
  const avgOrder = sold > 0 ? Math.round(revenue / sold) : 0;

  return (
    <>
      <PageHeader
        title={mock.title}
        subtitle={`${mock.venue} · ${mock.when}`}
        actions={
          <>
            <MockBadge />
            <Badge tone={mock.status === "Published" ? "success" : mock.status === "Paused" ? "warning" : "neutral"}>
              {mock.status}
            </Badge>
            <Link href="/organiser/inventory" className="btn btn-outline">
              Edit event
            </Link>
          </>
        }
      />

      {error ? (
        <DataErrorNote
          message={`${error.message} The backend only returns published events, so drafts fall back to mock data.`}
          code={error.code}
        />
      ) : null}

      <div className="hero" style={{ background: `linear-gradient(120deg, ${mock.tint[0]}, ${mock.tint[1]} 55%, #0b0b0b)` }} />

      <div className="grid-kpi">
        <Kpi label="Tickets sold" value={`${num(sold)} / ${num(cap)}`} hint={`${pct((sold / cap) * 100, 1)} sold`} tone="info" />
        <Kpi label="Gross revenue" value={inr(revenue)} />
        <Kpi label="Avg order value" value={inr(avgOrder)} hint="per ticket" />
        <Kpi label="Refunds" value={inr(refunds)} tone="danger" />
      </div>

      <EventTabs tiers={mock.tiers} />
    </>
  );
}
