import Link from "next/link";
import { Badge, Kpi, PageHeader } from "@/components/ui";
import { EventTabs } from "@/components/EventTabs";
import { LiveEventDetail } from "@/components/LiveEventDetail";
import { eventCapacity, eventRefunds, eventRevenue, eventSold, getEventRecord } from "@/lib/organiser-data";
import { inr, num, pct } from "@/lib/format";

/**
 * Event detail and analytics (PRD screen 17).
 *
 * The `events` "get" endpoint returns PUBLISHED events only, so a draft organiser
 * event is not visible through it. The live panel reads the event from the backend
 * and falls back to the mock record when the backend has nothing for this id.
 */
export default async function EventDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const mock = getEventRecord(id);

  return (
    <>
      <Link href="/organiser" className="muted small">
        ← Back to overview
      </Link>
      <LiveEventDetail eventId={id} mock={mock} />
    </>
  );
}
