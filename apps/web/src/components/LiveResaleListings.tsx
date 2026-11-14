"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge, Card } from "@/components/ui";
import { LiveBadge, DataErrorNote, LoadingRows } from "@/components/MockBadge";
import { callAuthed } from "@/lib/session";
import { ApiError } from "@/lib/api";
import { useSession } from "@/lib/use-session";
import { inr } from "@/lib/format";

/** One active resale listing, as `resale` "listings" returns it. */
type Listing = {
  listing_id: string;
  ask_minor: number;
  max_minor: number;
  event_title: string;
  venue: string;
  starts_at: string;
};

type ListingsResponse = { ok: true; listings: Listing[] };

function whenLabel(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * The active resale listings, read from `resale` "listings".
 *
 * This is the one resale action that reports on the market rather than acting on a
 * single ticket. It still needs a signed-in caller: the Edge Function authenticates
 * before it serves the list, so a signed-out visitor is asked to sign in rather than
 * shown a 401.
 *
 * The price cap the backend sends (`max_minor`) is per listing, so the screen shows
 * the ask next to its own cap instead of inventing one policy for the whole event.
 */
export function LiveResaleListings() {
  const { signedIn, ready } = useSession();
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; code: string } | null>(null);
  const [needSignIn, setNeedSignIn] = useState(false);

  useEffect(() => {
    if (!ready) return;

    if (!signedIn) {
      setListings(null);
      setNeedSignIn(true);
      setError(null);
      setLoading(false);
      return;
    }

    let alive = true;
    setNeedSignIn(false);
    setLoading(true);
    setError(null);

    callAuthed<ListingsResponse>("resale", { action: "listings" })
      .then((res) => {
        if (!alive) return;
        setListings(res.listings ?? []);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        if (e instanceof ApiError && e.code === "NOT_SIGNED_IN") {
          setNeedSignIn(true);
          return;
        }
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
  }, [signedIn, ready]);

  return (
    <Card title="Active resale listings" action={signedIn ? <LiveBadge /> : undefined}>
      {!ready || loading ? <LoadingRows rows={3} /> : null}

      {ready && needSignIn ? (
        <div className="notice info">
          <b>Sign in to see the resale market.</b> The backend checks who is asking before it returns listings.
          <div style={{ marginTop: 10 }}>
            <Link href="/sign-in?next=%2Forganiser%2Fresale" className="btn btn-sm btn-primary">
              Sign in
            </Link>
          </div>
        </div>
      ) : null}

      {error ? <DataErrorNote message={error.message} code={error.code} /> : null}

      {listings && listings.length === 0 ? (
        <p className="small muted">No active listings right now. When a ticket is put up for resale it appears here.</p>
      ) : null}

      {listings && listings.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Event</th>
                <th>Venue</th>
                <th>Starts</th>
                <th className="right">Asking</th>
                <th className="right">Cap for this ticket</th>
                <th>Within cap</th>
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => (
                <tr key={l.listing_id}>
                  <td className="strong">{l.event_title}</td>
                  <td className="small">{l.venue}</td>
                  <td className="small">{whenLabel(l.starts_at)}</td>
                  <td className="right num">{inr(l.ask_minor / 100)}</td>
                  <td className="right num">{inr(l.max_minor / 100)}</td>
                  <td>
                    <Badge tone={l.ask_minor <= l.max_minor ? "success" : "danger"}>
                      {l.ask_minor <= l.max_minor ? "Yes" : "Over cap"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </Card>
  );
}
