/**
 * Resale and group helpers (Phase 2.8). Pure: no network and no native modules, so the
 * tests can run these on their own. The network calls live in services/resale.ts and services/groups.ts.
 */

/** Platform default cap: 110% of face value (PRD 6.5). Each event can set its own; the server is the authority. */
export const DEFAULT_CAP_BPS = 11000;

export type RawListing = {
  listing_id: string;
  ask_minor: number;
  max_minor: number;
  event_title: string;
  venue: string;
  starts_at: string;
  status?: string;
};

export type AppListing = {
  id: string;
  askRupees: number;
  maxRupees: number;
  eventTitle: string;
  venue: string;
  startsAt: string;
  status: string; // ACTIVE | PURCHASE_PENDING for my listings; ACTIVE for the marketplace
};

export type RawInvite = {
  id: string;
  status: string;
  inviteExpiresAt: string | null;
  ticketId: string;
  inviteeEmailKey: string;
};

export type AppInvite = {
  id: string;
  ticketId: string;
  status: string; // INVITED | CLAIMED | REVOKED
  expiresAt: string | null;
};

/** The subset of AppTicket that the group helpers need. */
export type BucketCandidate = {
  id: string;
  eventId: string;
  eventTitle: string;
  tierName: string;
  statusRaw: string;
};

export const BUCKET_STATUS = "ISSUED_UNASSIGNED_GROUP";

/** Whole rupees to paise (integer). Rounds to the nearest paisa so 48.5 becomes 4850. */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Highest ask in whole rupees: floor(face × capBps / 10000). Never rounds up, same as the server. */
export function capForFace(faceRupees: number, capBps: number): number {
  return Math.floor((faceRupees * capBps) / 10000);
}

/** ₹ with Indian grouping and no decimals, e.g. 48000 -> "₹48,000". */
export function formatRupees(amount: number): string {
  return `₹${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(amount)}`;
}

/** Message for a bad ask, or null if the ask is fine. The server checks again on submit. */
export function askError(askRupees: number, capRupees: number): string | null {
  if (!Number.isFinite(askRupees) || askRupees < 1) return "Enter a price in rupees, above zero.";
  if (askRupees > capRupees) return `The highest price allowed is ${formatRupees(capRupees)}.`;
  return null;
}

export function toAppListing(raw: RawListing): AppListing {
  return {
    id: raw.listing_id,
    askRupees: Math.round(raw.ask_minor / 100),
    maxRupees: Math.round(raw.max_minor / 100),
    eventTitle: raw.event_title,
    venue: raw.venue,
    startsAt: raw.starts_at,
    status: raw.status ?? "ACTIVE",
  };
}

export function toAppInvite(raw: RawInvite): AppInvite {
  return { id: raw.id, ticketId: raw.ticketId, status: raw.status, expiresAt: raw.inviteExpiresAt };
}

const INVITE_LABELS: Record<string, string> = {
  INVITED: "Waiting for the member to claim",
  CLAIMED: "Claimed",
  REVOKED: "Cancelled",
};

export function inviteLabel(status: string): string {
  return INVITE_LABELS[status] ?? status;
}

export function listingLabel(status: string): string {
  if (status === "PURCHASE_PENDING") return "Someone is paying for this";
  return "Listed";
}

/**
 * Group bucket tickets (not yet given to a member), grouped by event and tier.
 * The first ticket id of each group is what the manager screen opens with.
 */
export type BucketGroup = {
  key: string;
  eventId: string;
  eventTitle: string;
  tierName: string;
  ticketIds: string[];
};

export function bucketGroups(tickets: BucketCandidate[]): BucketGroup[] {
  const map = new Map<string, BucketGroup>();
  for (const t of tickets) {
    if (t.statusRaw !== BUCKET_STATUS) continue;
    const key = `${t.eventId}|${t.tierName}`;
    const g = map.get(key) ?? { key, eventId: t.eventId, eventTitle: t.eventTitle, tierName: t.tierName, ticketIds: [] };
    g.ticketIds.push(t.id);
    map.set(key, g);
  }
  return [...map.values()];
}

/** Unassigned bucket tickets for the same event and tier as `anchor`, in the order they were listed. */
export function bucketFor(tickets: BucketCandidate[], anchor: BucketCandidate | undefined): BucketCandidate[] {
  if (!anchor) return [];
  return tickets.filter((t) => t.statusRaw === BUCKET_STATUS && t.eventId === anchor.eventId && t.tierName === anchor.tierName);
}
