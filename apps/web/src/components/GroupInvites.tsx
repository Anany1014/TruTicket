"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Card, Kpi } from "@/components/ui";
import { LiveBadge, DataErrorNote, LoadingRows } from "@/components/MockBadge";
import { callAuthed } from "@/lib/session";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/use-session";
import { num } from "@/lib/format";

/** One group invite, as `groups` "mine" returns it. */
type Invite = {
  id: string;
  status: string;
  inviteExpiresAt: string | null;
  ticketId: string | null;
  inviteeEmailKey: string | null;
};

type MineResponse = { ok: true; invites: Invite[] };

function whenLabel(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Group ticket invites that this account sent, from `groups` "mine".
 *
 * A group ticket is a bucket the manager keeps until a team member claims a seat from
 * it. The backend only stores a hash of the invitee's email, so this screen shows the
 * masked key it gets back rather than pretending to know the full address.
 */
export function GroupInvites() {
  const { signedIn, ready } = useSession();
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);

  useEffect(() => {
    if (!ready || !signedIn) {
      setInvites(null);
      return;
    }
    let alive = true;
    setLoading(true);
    setError(null);

    callAuthed<MineResponse>("groups", { action: "mine" })
      .then((res) => {
        if (alive) setInvites(res.invites ?? []);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const err = e instanceof ApiError ? e : new ApiError("UNKNOWN", "Something went wrong.");
        setError({ message: err.message, code: err.code });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [signedIn, ready]);

  if (!ready) return <LoadingRows rows={3} />;

  if (!signedIn) {
    return (
      <div className="notice info">
        <b>Sign in to see your group invites.</b> Invites are tied to the account that sent them.
        <div style={{ marginTop: 10 }}>
          <Link href="/sign-in?next=%2Fgroups" className="btn btn-sm btn-primary">
            Sign in
          </Link>
        </div>
      </div>
    );
  }

  if (loading) return <LoadingRows rows={4} />;
  if (error) return <DataErrorNote message={error.message} code={error.code} />;

  const rows = invites ?? [];
  const pending = rows.filter((i) => i.status === "INVITED" || i.status === "PENDING").length;
  const claimed = rows.filter((i) => i.status === "CLAIMED" || i.status === "ACTIVE").length;

  return (
    <>
      <div className="grid-kpi">
        <Kpi label="Invites" value={num(rows.length)} />
        <Kpi label="Waiting to be claimed" value={num(pending)} tone="warning" />
        <Kpi label="Claimed" value={num(claimed)} tone="success" />
      </div>

      <Card title="Invites you sent" action={<LiveBadge />}>
        {rows.length === 0 ? (
          <p className="small muted">
            No group invites yet. Invites appear here when you share a group ticket with a team member.
          </p>
        ) : (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Invitee</th>
                  <th>Status</th>
                  <th>Expires</th>
                  <th>Ticket</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr key={i.id}>
                    <td className="small mono">{i.inviteeEmailKey ?? "—"}</td>
                    <td>
                      <Badge tone={i.status === "INVITED" || i.status === "PENDING" ? "warning" : "success"}>
                        {i.status}
                      </Badge>
                    </td>
                    <td className="small">{whenLabel(i.inviteExpiresAt)}</td>
                    <td className="small mono">{i.ticketId ? i.ticketId.slice(0, 8) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="small muted">
          The backend stores only a hash of the invitee&rsquo;s email, so the masked value above is what it returns. An
          invite is claimed with a code emailed to the invitee, not from this screen.
        </div>
      </Card>
    </>
  );
}
