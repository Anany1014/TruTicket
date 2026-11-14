import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  allocateOnChain,
  callChain,
  chainConfigFromEnv,
  isRetryable,
  listOnChain,
  mintOnChain,
  settleOnChain,
  withRetry,
  type ChainFetch,
  type ChainResult,
} from "./chain_call.ts";

const CFG = { url: "https://example.test/functions/v1/chain", secret: "s".repeat(40) };
const NO_SLEEP = async () => {};

/** A fake chain: answers each action from a script. Records every request body. */
function fakeChain(script: Record<string, Array<{ status: number; body: Record<string, unknown> } | "throw">>) {
  const calls: Array<{ action: string; secret: string | null }> = [];
  const fetchFn: ChainFetch = async (_url, init) => {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    const action = String(body.action);
    calls.push({ action, secret: new Headers(init.headers).get("x-internal-secret") });
    const queue = script[action] ?? [];
    const next = queue.length > 1 ? queue.shift()! : queue[0];
    if (!next) throw new Error(`no script for ${action}`);
    if (next === "throw") throw new TypeError("network down");
    return new Response(JSON.stringify(next.body), { status: next.status, headers: { "content-type": "application/json" } });
  };
  return { fetchFn, calls };
}

const OK = { status: 200, body: { ok: true, token_id: "7" } };
const BUSY = { status: 409, body: { ok: false, error: { code: "IN_PROGRESS" } } };
const BAD = { status: 400, body: { ok: false, error: { code: "INVALID_INPUT" } } };

Deno.test("config is read from the environment and needs both values", () => {
  assertEquals(chainConfigFromEnv(() => undefined), null);
  assertEquals(chainConfigFromEnv((n) => (n === "CHAIN_FUNCTION_URL" ? "https://x" : undefined)), null);
  const cfg = chainConfigFromEnv((n) => (n === "CHAIN_FUNCTION_URL" ? " https://x/chain " : "y".repeat(40)));
  assertEquals(cfg, { url: "https://x/chain", secret: "y".repeat(40) });
});

Deno.test("no config means no call and a clear code", async () => {
  let called = false;
  const r = await callChain({ action: "mint" }, null, async () => {
    called = true;
    return new Response("{}");
  });
  assertEquals(r, { ok: false, status: 0, code: "CHAIN_NOT_CONFIGURED" });
  assertEquals(called, false);
});

Deno.test("the internal secret is sent in the header, and the body is JSON", async () => {
  const { fetchFn, calls } = fakeChain({ mint: [OK] });
  const r = await callChain({ action: "mint", ticket_id: "t" }, CFG, fetchFn);
  assert(r.ok);
  assertEquals(calls[0], { action: "mint", secret: CFG.secret });
});

Deno.test("a network error is reported as unreachable and is retryable", async () => {
  const { fetchFn } = fakeChain({ mint: ["throw"] });
  const r = await callChain({ action: "mint" }, CFG, fetchFn);
  assertEquals(r, { ok: false, status: 0, code: "CHAIN_UNREACHABLE" });
  assert(isRetryable(r));
});

Deno.test("busy (409) and server errors (5xx) retry, bad input and auth do not", () => {
  assert(isRetryable({ ok: false, status: 409, code: "NOT_MINTED" }));
  assert(isRetryable({ ok: false, status: 502, code: "CHAIN_ERROR" }));
  assert(!isRetryable({ ok: false, status: 400, code: "INVALID_INPUT" }));
  assert(!isRetryable({ ok: false, status: 401, code: "UNAUTHORISED" }));
  assert(!isRetryable({ ok: true, data: {} }));
});

Deno.test("withRetry stops at the first success", async () => {
  let runs = 0;
  const r = await withRetry(
    async (): Promise<ChainResult> => {
      runs++;
      return runs === 1 ? { ok: false, status: 409, code: "IN_PROGRESS" } : { ok: true, data: {} };
    },
    [1, 1, 1],
    NO_SLEEP,
  );
  assert(r.ok);
  assertEquals(runs, 2);
});

Deno.test("withRetry gives up after the configured delays, returning the last failure", async () => {
  let runs = 0;
  const sleeps: number[] = [];
  const r = await withRetry(
    async () => {
      runs++;
      return { ok: false, status: 503, code: "HTTP_503" } as ChainResult;
    },
    [10, 30],
    async (ms) => {
      sleeps.push(ms);
    },
  );
  assertEquals(runs, 3);
  assertEquals(sleeps, [10, 30]);
  assertEquals(r, { ok: false, status: 503, code: "HTTP_503" });
});

Deno.test("withRetry does not retry a non-retryable failure", async () => {
  let runs = 0;
  await withRetry(
    async () => {
      runs++;
      return { ok: false, status: 400, code: "INVALID_INPUT" } as ChainResult;
    },
    [1, 1],
    NO_SLEEP,
  );
  assertEquals(runs, 1);
});

Deno.test("mint retries a busy ticket and then succeeds", async () => {
  const { fetchFn, calls } = fakeChain({ mint: [BUSY, OK] });
  const r = await mintOnChain(CFG, "ticket-1", fetchFn, NO_SLEEP);
  assert(r.ok);
  assertEquals(calls.map((c) => c.action), ["mint", "mint"]);
});

Deno.test("list mints first, then lists at the ask", async () => {
  const { fetchFn, calls } = fakeChain({ mint: [OK], list: [OK] });
  const r = await listOnChain(CFG, "ticket-1", 4500, fetchFn, NO_SLEEP);
  assert(r.ok);
  assertEquals(calls.map((c) => c.action), ["mint", "list"]);
});

Deno.test("list is skipped when the mint never succeeds", async () => {
  const { fetchFn, calls } = fakeChain({ mint: [BAD], list: [OK] });
  const r = await listOnChain(CFG, "ticket-1", 4500, fetchFn, NO_SLEEP);
  assertEquals(r.ok, false);
  assertEquals(calls.map((c) => c.action), ["mint"]);
});

Deno.test("allocate mints first, then moves the token to the member", async () => {
  const { fetchFn, calls } = fakeChain({ mint: [OK], allocate: [OK] });
  const r = await allocateOnChain(CFG, "ticket-1", "member-1", fetchFn, NO_SLEEP);
  assert(r.ok);
  assertEquals(calls.map((c) => c.action), ["mint", "allocate"]);
});

Deno.test("settle sends the buyer and the ask, so the chain can list first if needed", async () => {
  let sent: Record<string, unknown> = {};
  const fetchFn: ChainFetch = async (_u, init) => {
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  const r = await settleOnChain(CFG, "ticket-1", "buyer-1", 4800, fetchFn, NO_SLEEP);
  assert(r.ok);
  assertEquals(sent, { action: "settle", ticket_id: "ticket-1", buyer_user_id: "buyer-1", ask_minor: 4800 });
});
