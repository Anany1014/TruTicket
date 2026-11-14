/** Resale marketplace: browse, list my ticket, take a listing down, buy. Source: the `resale` Edge Function. */
import { callFunction } from "./api";
import { checkoutPageUrl } from "./checkout";
import { fetchMyTickets } from "./tickets";
import { rupeesToPaise, toAppListing, type AppListing, type RawListing } from "./marketplace";
import type { AppTicket } from "./types";

/** Marketplace listings from every seller. Sign-in needed. */
export async function fetchListings(): Promise<AppListing[]> {
  const res = await callFunction<{ listings: RawListing[] }>("resale", { action: "listings" }, { auth: true });
  return res.listings.map(toAppListing);
}

/** My own listings, so I can take them down. */
export async function fetchMyListings(): Promise<AppListing[]> {
  const res = await callFunction<{ listings: RawListing[] }>("resale", { action: "mine" }, { auth: true });
  return res.listings.map(toAppListing);
}

/** List one of my tickets. The server checks the cap again and returns the highest allowed price in the message. */
export async function listTicketForResale(ticketId: string, askRupees: number): Promise<void> {
  await callFunction("resale", { action: "list", ticket_id: ticketId, ask_minor: rupeesToPaise(askRupees) }, { auth: true });
}

export async function cancelListing(listingId: string): Promise<void> {
  await callFunction("resale", { action: "cancel", listing_id: listingId }, { auth: true });
}

/** Holds the listing for 15 minutes and returns the hosted payment page URL. Open it in the browser. */
export async function startResalePurchase(listingId: string): Promise<string> {
  const res = await callFunction<{ razorpay_order_id: string; key_id: string }>(
    "resale",
    { action: "buy", listing_id: listingId },
    { auth: true },
  );
  return checkoutPageUrl(res.razorpay_order_id, res.key_id);
}

/**
 * After the browser closes, wait for the transfer to show up in My Tickets.
 * Same idea as fix 4 on checkout: poll up to 45 s, then give up and say so.
 */
export async function waitForNewTicket(countBefore: number, timeoutMs = 45_000, intervalMs = 3_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const now: AppTicket[] = await fetchMyTickets().catch(() => []);
    if (now.length > countBefore) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
