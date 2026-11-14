/** Buying: hold seats, create a Razorpay order, then pay on the hosted checkout page. */
import { callFunction } from "./api";
import { PAY_PAGE_URL } from "./config";

export type Reservation = { reservation_id: string; expires_at: string; quantity: number };

export async function reserveTickets(ticketTypeId: string, quantity: number): Promise<Reservation> {
  return callFunction<Reservation>(
    "events",
    { action: "reserve", ticket_type_id: ticketTypeId, quantity },
    { auth: true },
  );
}

export type OrderCreated = {
  order_id: string;
  razorpay_order_id: string;
  amount: number; // paise
  currency: string;
  key_id: string;
};

export async function createOrder(reservationId: string): Promise<OrderCreated> {
  return callFunction<OrderCreated>("orders", { action: "create", reservation_id: reservationId }, { auth: true });
}

/**
 * The hosted payment page (static, from pay-page/). It needs the Razorpay order id and the
 * public key id. The amount comes from the order on Razorpay's side, not from the URL.
 */
export { evaluateMobileSessionRisk } from "./ml";

export function checkoutPageUrl(razorpayOrderId: string, keyId: string): string {
  if (!PAY_PAGE_URL) {
    throw new Error("Payment page is not set. Add EXPO_PUBLIC_PAY_PAGE_URL to apps/mobile/.env and restart Metro.");
  }
  const base = PAY_PAGE_URL.endsWith("/") ? PAY_PAGE_URL : `${PAY_PAGE_URL}/`;
  return `${base}?order=${encodeURIComponent(razorpayOrderId)}&key=${encodeURIComponent(keyId)}`;
}
