"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { callFunction, ApiError } from "@/lib/api";
import type { EventsListResponse } from "@/lib/api-types";

/**
 * The "Event detail" link in the organiser sidebar.
 *
 * It points at the first published event the backend knows about, so the link
 * always lands on a live screen. If the backend has no published event, it
 * falls back to the mock event id, which shows the mock fallback page.
 */
export function LiveEventDetailLink({ mockHref }: { mockHref: string }) {
  const [href, setHref] = useState(mockHref);

  useEffect(() => {
    let alive = true;
    callFunction<EventsListResponse>("events", { action: "list" })
      .then((res) => {
        if (!alive) return;
        const first = res.events?.[0];
        if (first) setHref(`/organiser/events/${first.id}`);
      })
      .catch((e: unknown) => {
        // No backend, or it is unreachable. The mock link still works.
        if (!(e instanceof ApiError)) return;
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Link href={href} className="nav-item">
      Event detail
    </Link>
  );
}
