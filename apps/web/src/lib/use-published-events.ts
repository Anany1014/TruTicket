"use client";

import { useEffect, useState } from "react";
import { callFunction, ApiError } from "@/lib/api";
import type { ApiEvent, EventsListResponse } from "@/lib/api-types";

/**
 * Reads the published events from the `events` Edge Function ("list").
 *
 * This is the only live event list the backend has today. It is platform-wide:
 * the signed-in organiser's own events, drafts included, need an endpoint that
 * does not exist yet.
 *
 * Shared by the overview and the inventory screen so both read the same source.
 */
export function usePublishedEvents() {
  const [events, setEvents] = useState<ApiEvent[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setError(null);

    callFunction<EventsListResponse>("events", { action: "list" })
      .then((res) => {
        if (!alive) return;
        setEvents(res.events ?? []);
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
  }, []);

  return { events, loading, error };
}

/** Totals computed from the live event list. All amounts are in rupees. */
export type LiveTotals = {
  events: number;
  ticketTypes: number;
  capacity: number;
  sold: number;
  seatsLeft: number;
  revenue: number;
};

/**
 * Sums the live event list.
 *
 * `sold` is derived as quantity minus seats left, which is what the backend
 * gives us. It counts seats taken, which may include seats held by a
 * reservation. The backend does not separate paid sales from active holds.
 */
export function totalsFrom(events: ApiEvent[]): LiveTotals {
  const t: LiveTotals = {
    events: events.length,
    ticketTypes: 0,
    capacity: 0,
    sold: 0,
    seatsLeft: 0,
    revenue: 0,
  };
  for (const e of events) {
    t.ticketTypes += e.ticketTypes.length;
    for (const tt of e.ticketTypes) {
      t.capacity += tt.quantity;
      t.seatsLeft += tt.seatsLeft;
      const taken = Math.max(0, tt.quantity - tt.seatsLeft);
      t.sold += taken;
      t.revenue += taken * (tt.faceValueMinor / 100);
    }
  }
  return t;
}
