"use client";

import { useEffect, useState } from "react";
import { getSession, subscribeSession, type Session } from "@/lib/session";

/**
 * The current session, kept in sync with sign-in and sign-out.
 *
 * Starts as null on the server and after hydration, because the token lives in the
 * browser. A screen should treat null as "not signed in yet" until `ready` is true.
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setSession(getSession());
    setReady(true);
    return subscribeSession(() => setSession(getSession()));
  }, []);

  return { session, signedIn: session !== null, ready };
}
