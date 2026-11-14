/**
 * The signed-in user's session, and the email-code sign-in that creates it.
 *
 * The `auth` Edge Function signs people in with an emailed six-digit code. There is
 * no password anywhere: (`otp_request` then `otp_verify`). A successful verify returns
 * a Supabase session, which this module keeps so every later call can carry the token.
 *
 * Where the session lives: `sessionStorage`, not `localStorage`. The session dies with
 * the tab, so a shared machine does not keep somebody signed in. The trade-off is that
 * opening the app in a second tab asks for a code again.
 *
 * Nothing secret is stored here: the anon key is public and lives in the env, and the
 * access token is the user's own short-lived bearer token.
 */
import { callFunction, ApiError, functionsUrl, supabaseAnonKey } from "@/lib/api";

/** What the backend returns on a successful sign-in. */
type AuthResponse = {
  ok: true;
  session: {
    access_token: string;
    refresh_token: string;
    expires_in?: number;
    user?: { id?: string; email?: string };
  };
  user_id: string;
  created: boolean;
};

/** What this app keeps while somebody is signed in. */
export type Session = {
  access_token: string;
  refresh_token: string;
  user_id: string;
  email: string;
  /** When the access token stops working, in epoch milliseconds. */
  expires_at: number;
  /** True when this sign-in created the account. */
  created: boolean;
};

const STORAGE_KEY = "truticket.session";

/** Access tokens last an hour; refresh a little early to avoid a wasted round trip. */
const REFRESH_MARGIN_MS = 60_000;

/** Listeners for sign-in and sign-out, so screens can re-render. */
const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) {
    try {
      fn();
    } catch {
      // One broken listener must not stop the others.
    }
  }
}

// ---------- Reading and writing the stored session ----------

/** The stored session, or null when nobody is signed in or the page has not hydrated. */
export function getSession(): Session | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Session>;
    if (!parsed.access_token || !parsed.refresh_token || !parsed.user_id) return null;
    return {
      access_token: parsed.access_token,
      refresh_token: parsed.refresh_token,
      user_id: parsed.user_id,
      email: parsed.email ?? "",
      expires_at: parsed.expires_at ?? 0,
      created: parsed.created ?? false,
    };
  } catch {
    return null;
  }
}

/** The current user's access token, or null when nobody is signed in. */
export function getAccessToken(): string | null {
  return getSession()?.access_token ?? null;
}

/** True when a sign-in has stored a session. */
export function hasAccessToken(): boolean {
  return getSession() !== null;
}

/** Stores a session and tells the screens. */
export function storeSession(session: Session): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Private browsing or a full quota. The caller surfaces the failure.
  }
  notify();
}

/** Clears the stored session. */
export function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do: the token is gone once the page reloads either way.
  }
  notify();
}

/** Subscribes to sign-in and sign-out. Returns the unsubscribe function. */
export function subscribeSession(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

// ---------- Signing in ----------

/** Emails a six-digit sign-in code. The account is created on first verify. */
export async function requestEmailCode(email: string): Promise<void> {
  await callFunction<{ ok: true }>("auth", { action: "otp_request", email });
}

/**
 * Checks the emailed code and, on success, keeps the session.
 *
 * The server's own message is thrown as an `ApiError`, so the page can show exactly
 * what went wrong (a wrong code, a used code, too many attempts).
 */
export async function verifyEmailCode(email: string, code: string): Promise<Session> {
  const res = await callFunction<AuthResponse>("auth", { action: "otp_verify", email, code });

  const session: Session = {
    access_token: res.session.access_token,
    refresh_token: res.session.refresh_token,
    user_id: res.user_id,
    email,
    expires_at: Date.now() + (res.session.expires_in ?? 3600) * 1000,
    created: res.created,
  };
  storeSession(session);
  return session;
}

/** Signs out on this device. The server-side session is left to expire. */
export function signOut(): void {
  clearSession();
}

// ---------- Keeping the session alive ----------

/**
 * Swaps the refresh token for a new access token.
 *
 * Returns the new access token, or null when the session is beyond saving, in which
 * case the stored session is cleared so the screens fall back to signed-out.
 */
export async function refreshSession(): Promise<string | null> {
  const current = getSession();
  if (!current) return null;

  const anon = supabaseAnonKey();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (anon) headers.apikey = anon;

  let res: Response;
  try {
    res = await fetch(`${functionsUrl().replace("/functions/v1", "")}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers,
      body: JSON.stringify({ refresh_token: current.refresh_token }),
    });
  } catch {
    throw new ApiError("NETWORK", "No connection. Check your internet and try again.");
  }

  const data = (await res.json().catch(() => null)) as
    | { access_token?: string; refresh_token?: string; expires_in?: number }
    | null;

  if (!res.ok || !data?.access_token) {
    // The refresh token is spent or the account signed in elsewhere. Start over.
    clearSession();
    return null;
  }

  storeSession({
    ...current,
    access_token: data.access_token,
    refresh_token: data.refresh_token ?? current.refresh_token,
    expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
  });
  return data.access_token;
}

/**
 * Calls an Edge Function that needs a signed-in caller.
 *
 * Refreshes first when the token is nearly spent, and retries once when the server
 * says the token is bad. When the session cannot be saved, the call throws and the
 * session is cleared, so the screen shows the sign-in prompt instead.
 */
export async function callAuthed<T>(name: Parameters<typeof callFunction>[0], body: Record<string, unknown>): Promise<T> {
  let session = getSession();
  if (!session) {
    throw new ApiError("NOT_SIGNED_IN", "Sign in to see this. It comes from your account.");
  }

  if (session.expires_at > 0 && Date.now() > session.expires_at - REFRESH_MARGIN_MS) {
    const fresh = await refreshSession();
    if (!fresh) {
      throw new ApiError("NOT_SIGNED_IN", "Your sign-in expired. Sign in again.");
    }
    session = getSession();
    if (!session) {
      throw new ApiError("NOT_SIGNED_IN", "Your sign-in expired. Sign in again.");
    }
  }

  try {
    return await callFunction<T>(name, body, { token: session.access_token });
  } catch (e) {
    const err = e instanceof ApiError ? e : null;
    const looksStale = err?.status === 401 || err?.code === "AUTH_INVALID";

    if (!looksStale) throw e;

    const fresh = await refreshSession();
    if (!fresh) {
      throw new ApiError("NOT_SIGNED_IN", "Your sign-in expired. Sign in again.");
    }
    return await callFunction<T>(name, body, { token: fresh });
  }
}
