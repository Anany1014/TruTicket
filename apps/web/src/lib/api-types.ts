/**
 * Response shapes from the DEV Edge Functions.
 *
 * These mirror the TypeScript in services/api/supabase/functions/*\/index.ts.
 * The Edge Function source is the contract, so these types follow it exactly.
 */

/** A ticket type as `events` returns it. Amounts are in paise (minor units). */
export type ApiTicketType = {
  id: string;
  eventId: string;
  name: string;
  faceValueMinor: number;
  currency: string;
  quantity: number;
  saleStart: string | null;
  saleEnd: string | null;
  perAccountLimit: number | null;
  seatsLeft: number;
};

/** A published event as `events` returns it. */
export type ApiEvent = {
  id: string;
  title: string;
  description: string | null;
  venue: string;
  startAt: string;
  endAt: string;
  categories: string[] | null;
  coverImageUrl: string | null;
  status: string;
  ticketTypes: ApiTicketType[];
};

export type EventsListResponse = { ok: true; events: ApiEvent[] };
export type EventsGetResponse = { ok: true; event: ApiEvent };

/** One active resale listing. `ask_minor` and `max_minor` are in paise. */
export type ApiResaleListing = {
  listing_id: string;
  ask_minor: number;
  max_minor: number;
  event_title: string;
  venue: string;
  starts_at: string;
};

export type ResaleListingsResponse = { ok: true; listings: ApiResaleListing[] };

/** The reply from `events` `create`. The event starts as a draft. */
export type EventsCreateResponse = {
  ok: true;
  event_id: string;
  status: string;
};
