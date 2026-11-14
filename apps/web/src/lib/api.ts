/**
 * The one HTTP client for TruTicket's Edge Functions.
 *
 * Every function is a POST with a JSON body that has an `action` field.
 * The Edge Function source is the contract (services/api/supabase/functions).
 * Errors come back as { error: { code, message } }.
 *
 * Rules for this file:
 * - plain `fetch`, no client library, no new dependencies.
 * - the anon key only. Never a service-role key, never a secret.
 * - DEV project only (ref oviqjnzlgbkmggytaqao). Never the production ref.
 */

/** DEV project ref. The production ref (ccqbubgebsayoviilnul) must never be used here. */
const DEV_REF = "oviqjnzlgbkmggytaqao";

/** The production project ref. Hard-blocked so a mis-set env var cannot reach it. */
const PROD_REF = "ccqbubgebsayoviilnul";

export type FunctionName =
  | "auth"
  | "devices"
  | "events"
  | "orders"
  | "checkout"
  | "tickets"
  | "scanner_verify"
  | "resale"
  | "groups";

/** An error from the backend. `code` is the server's machine code, `message` is for people. */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

const trimSlash = (s: string) => s.replace(/\/+$/, "");

/** The Supabase project URL from the env. Empty string when it is not set. */
export function supabaseUrl(): string {
  return trimSlash(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
}

/** The DEV anon key from the env. Empty string when it is not set. */
export function supabaseAnonKey(): string {
  return (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
}

/** True when the web app knows which backend to talk to. */
export function isBackendConfigured(): boolean {
  return supabaseUrl().length > 0;
}

/**
 * The base URL for every Edge Function.
 * Throws when the env is not set, so a missing key never turns into a silent no-op.
 */
export function functionsUrl(): string {
  const url = supabaseUrl();
  if (!url) {
    throw new ApiError("CONFIG_MISSING", "The app is not connected to the server yet.");
  }
  if (url.includes(PROD_REF)) {
    // Hard stop. This web app talks to DEV only.
    throw new ApiError("CONFIG_MISSING", "This app is configured for the production project. Refusing to call it.");
  }
  if (!url.includes(DEV_REF)) {
    throw new ApiError("CONFIG_MISSING", `Expected the DEV project (${DEV_REF}). Check NEXT_PUBLIC_SUPABASE_URL.`);
  }
  return `${url}/functions/v1`;
}

/**
 * Calls one Edge Function and returns the parsed JSON body.
 *
 * Throws an `ApiError` with the server's `code` and `message` when the call fails,
 * so a screen can show the server's own words instead of a generic error.
 */
export async function callFunction<T>(
  name: FunctionName,
  body: Record<string, unknown>,
  opts: { token?: string } = {},
): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  // The anon key is public and safe in a browser. Send it when it is set.
  const anon = supabaseAnonKey();
  if (anon) headers.apikey = anon;

  // Only functions that need a sign-in get a bearer token.
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;

  // Resolve the URL BEFORE the try. `functionsUrl()` throws a configuration error when
  // the env is missing or points at production, and a `catch` here used to swallow that
  // and report "No connection" instead — which sent people hunting for a network fault
  // that did not exist.
  const url = `${functionsUrl()}/${name}`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof ApiError) throw e;
    // A real fetch failure. It can be an offline machine, a firewall, or a browser
    // extension blocking the request, so the message names all three.
    throw new ApiError(
      "NETWORK",
      "Could not reach the server. This is either no internet, a firewall, or a browser extension blocking " +
        "supabase.co. Open DevTools → Network and check what the events request says.",
    );
  }

  const data = (await res.json().catch(() => null)) as
    | (T & { error?: undefined })
    | { error?: { code?: string; message?: string } }
    | null;

  if (!res.ok) {
    const err = (data && typeof data === "object" && "error" in data ? data.error : undefined) ?? {};
    throw new ApiError(
      err.code ?? `HTTP_${res.status}`,
      err.message ?? "Something went wrong. Please try again.",
      res.status,
    );
  }
  if (!data) throw new ApiError("BAD_RESPONSE", "The server sent an unexpected reply.", res.status);
  return data as T;
}
