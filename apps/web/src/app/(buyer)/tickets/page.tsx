import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { MyTickets } from "@/components/MyTickets";

/**
 * The signed-in user's own tickets.
 *
 * This is a buyer screen, not an organiser one, but it lives in the same shell so the
 * whole demo can be walked through from one place.
 */
export default function TicketsPage() {
  return (
    <>
      <PageHeader
        title="My tickets"
        subtitle="Your tickets, the entry code for the gate, and the resale price the backend allows."
        actions={
          <Link href="/organiser/resale" className="btn">
            Resale market
          </Link>
        }
      />
      <MyTickets />
    </>
  );
}
