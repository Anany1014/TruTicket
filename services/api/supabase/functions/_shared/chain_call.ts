// Calls the internal `chain` Edge Function from other Edge Functions (PHASE2_PLAN Phase 3, PRD FR-018 to FR-022).
//
// Policy (decided 13 Nov, option A, best effort): a chain failure never changes the database result.
// The ticket, resale or group transfer stays. The chain call is retried a few times in the background,
// and the `tickets` function retries missing mints when the buyer opens their tickets.
// Every chain action is idempotent, so a retry can never mint or move a token twice.
//
// Calls run one after another (mint, then list), never in parallel, to avoid nonce clashes on the operator wallet.

export type ChainConfig = { url: string; secret: string };

export type ChainResult =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; code: string };

export type ChainFetch = (url: string, init: RequestInit) => Promise<Response>;
export type Sleep = (ms: number) => Promise<void>;

/** Retry waits after the first try: 10 s, then 30 s. Three tries in total. */
export const RETRY_DELAYS_MS = [10_000, 30_000];
const CALL_TIMEOUT_MS = 90_000;

export function chainConfigFromEnv(get: (name: string) => string | undefined = (n) => Deno.env.get(n)): ChainConfig | null {
  const url = (get("CHAIN_FUNCTION_URL") ?? "").trim();
  const secret = (get("CHAIN_INTERNAL_SECRET") ?? "").trim();
  if (!url || !secret) return null;
  return { url, secret };
}

/** One HTTP call to the chain function. Never throws. */
export async function callChain(
  body: Record<string, unknown>,
  cfg: ChainConfig | null,
  fetchFn: ChainFetch = (url, init) => fetch(url, init),
): Promise<ChainResult> {
  if (!cfg) return { ok: false, status: 0, code: "CHAIN_NOT_CONFIGURED" };
  let res: Response;
  try {
    res = await fetchFn(cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": cfg.secret },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch {
    return { ok: false, status: 0, code: "CHAIN_UNREACHABLE" };
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.ok && data && data.ok === true) return { ok: true, data };
  const err = data && typeof data.error === "object" && data.error !== null ? (data.error as { code?: unknown }).code : undefined;
  return { ok: false, status: res.status, code: typeof err === "string" ? err : `HTTP_${res.status}` };
}

/**
 * Worth another try: the chain was unreachable, busy (409 IN_PROGRESS / NOT_MINTED / NOT_LISTED,
 * which can clear in seconds) or failed on the server (5xx). Bad input, bad config and auth are not retried.
 */
export function isRetryable(r: ChainResult): boolean {
  if (r.ok) return false;
  return r.status === 0 || r.status === 409 || r.status >= 500;
}

/** Runs `run` once, then again after each delay while the result is retryable. Returns the last result. */
export async function withRetry(
  run: () => Promise<ChainResult>,
  delaysMs: readonly number[] = RETRY_DELAYS_MS,
  sleep: Sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<ChainResult> {
  let last = await run();
  for (const delay of delaysMs) {
    if (last.ok || !isRetryable(last)) return last;
    await sleep(delay);
    last = await run();
  }
  return last;
}

/** Mint one ticket on chain, with retries. Already minted is a success. */
export function mintOnChain(cfg: ChainConfig | null, ticketId: string, fetchFn?: ChainFetch, sleep?: Sleep): Promise<ChainResult> {
  return withRetry(() => callChain({ action: "mint", ticket_id: ticketId }, cfg, fetchFn), RETRY_DELAYS_MS, sleep);
}

/**
 * List a ticket on chain at the given ask (paise). Mints first if the ticket has no token yet.
 * If the mint fails, the list is not attempted.
 */
export async function listOnChain(
  cfg: ChainConfig | null,
  ticketId: string,
  askMinor: number,
  fetchFn?: ChainFetch,
  sleep?: Sleep,
): Promise<ChainResult> {
  const minted = await mintOnChain(cfg, ticketId, fetchFn, sleep);
  if (!minted.ok) return minted;
  return withRetry(
    () => callChain({ action: "list", ticket_id: ticketId, ask_minor: askMinor }, cfg, fetchFn),
    RETRY_DELAYS_MS,
    sleep,
  );
}

/** Take the on-chain listing down. Nothing listed on chain is a success. */
export function cancelOnChain(cfg: ChainConfig | null, ticketId: string, fetchFn?: ChainFetch, sleep?: Sleep): Promise<ChainResult> {
  return withRetry(() => callChain({ action: "cancel", ticket_id: ticketId }, cfg, fetchFn), RETRY_DELAYS_MS, sleep);
}

/**
 * Resale payment captured and the database moved the ticket to the buyer.
 * ask_minor lets the chain list the ticket first if the listing never reached the chain.
 */
export function settleOnChain(
  cfg: ChainConfig | null,
  ticketId: string,
  buyerUserId: string,
  askMinor: number,
  fetchFn?: ChainFetch,
  sleep?: Sleep,
): Promise<ChainResult> {
  return withRetry(
    () => callChain({ action: "settle", ticket_id: ticketId, buyer_user_id: buyerUserId, ask_minor: askMinor }, cfg, fetchFn),
    RETRY_DELAYS_MS,
    sleep,
  );
}

/** Group invite claimed: zero-price transfer on chain to the member. Mints first if needed. */
export async function allocateOnChain(
  cfg: ChainConfig | null,
  ticketId: string,
  memberUserId: string,
  fetchFn?: ChainFetch,
  sleep?: Sleep,
): Promise<ChainResult> {
  const minted = await mintOnChain(cfg, ticketId, fetchFn, sleep);
  if (!minted.ok) return minted;
  return withRetry(
    () => callChain({ action: "allocate", ticket_id: ticketId, member_user_id: memberUserId }, cfg, fetchFn),
    RETRY_DELAYS_MS,
    sleep,
  );
}

function isFailure(r: unknown): r is { ok: false; code: string } {
  return typeof r === "object" && r !== null && (r as { ok?: unknown }).ok === false;
}

/**
 * Run a chain task in the background, so the HTTP response is not held up by a slow chain.
 * Supabase Edge Runtime keeps it alive with EdgeRuntime.waitUntil. Elsewhere it just runs.
 * Errors are logged, never thrown.
 */
export function inBackground(task: Promise<unknown>, label: string): void {
  const safe = task
    .then((r) => {
      if (isFailure(r)) console.error(`chain ${label} failed: ${r.code}`);
    })
    .catch((e) => console.error(`chain ${label} crashed`, e));
  const runtime = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(safe);
}
