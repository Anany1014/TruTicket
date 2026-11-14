import { Badge, Card, PageHeader } from "@/components/ui";
import { MockBadge } from "@/components/MockBadge";
import { LiveResaleListings } from "@/components/LiveResaleListings";
import { ResaleCalc } from "@/components/ResaleCalc";
import { RESALE_LISTINGS } from "@/lib/organiser-data";
import { inr } from "@/lib/format";

/**
 * Resale policy and control (PRD screens 20 and the policy part of 16).
 *
 * Two parts:
 * - the listings table is live from `resale` "listings" once somebody is signed in,
 *   because the Edge Function authenticates the caller before it serves the list;
 * - the policy itself (cap, transfer limit, cutoff) has no read or write endpoint,
 *   so it stays mock and says so.
 */
export default function ResalePolicy() {
  return (
    <>
      <PageHeader
        title="Resale policy"
        subtitle="Set the price cap, transfer limits, and cutoff for your events."
        actions={<MockBadge label="Policy is mock" />}
      />

      <LiveResaleListings />

      <ResaleCalc />

      <Card title="Active resale listings and cap compliance" action={<MockBadge />}>
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Listing</th>
                <th>Event</th>
                <th>Ticket type</th>
                <th className="right">Face value</th>
                <th className="right">Ask price</th>
                <th>Cap check</th>
              </tr>
            </thead>
            <tbody>
              {RESALE_LISTINGS.map((l) => (
                <tr key={l.ref}>
                  <td className="strong">{l.ref}</td>
                  <td>{l.event}</td>
                  <td>{l.tier}</td>
                  <td className="right num">{inr(l.face)}</td>
                  <td className="right num">{inr(l.ask)}</td>
                  <td>
                    <Badge tone={l.status === "Compliant" ? "success" : "danger"}>{l.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="small muted">
          Listings over the cap are blocked on the server. This table shows any that slipped through for review.
        </div>
        <div className="notice warn">
          These rows are mock. The <code>resale</code> function serves <code>listings</code> only to a signed-in
          caller, and the web sign-in method is still an open decision for the project owner. Until that lands, this
          table stays on placeholder data.
        </div>
      </Card>
    </>
  );
}
