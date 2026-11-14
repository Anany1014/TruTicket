"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui";
import { callAuthed, signOut } from "@/lib/session";
import { useSession } from "@/lib/use-session";
import { ApiError } from "@/lib/api";

/** What `devices` "status" returns. Only the parts this chip shows. */
type DevicesStatus = {
  ok: true;
  status?: string;
  device?: { deviceKeyId?: string; platform?: string; attestation?: string } | null;
  device_key_id?: string;
};

/**
 * The account control in the top bar.
 *
 * Signed out: a Sign in button. Signed in: the email, the sign-out button, and the
 * real device status from `devices` "status" instead of a hard-coded "2FA on".
 *
 * The device chip is honest about what it knows. The backend reports whether a
 * device key is active or pending; the web app itself has no TOTP, so the chip never
 * claims that a second factor is on when it is not.
 */
export function AccountChip({ tone = "dark" }: { tone?: "dark" | "light" }) {
  const { session, signedIn, ready } = useSession();
  const pathname = usePathname();
  const [device, setDevice] = useState<{ state: "live" | "loading" | "error" | "none"; label: string }>({
    state: "loading",
    label: "Checking device…",
  });

  useEffect(() => {
    if (!signedIn) {
      setDevice({ state: "none", label: "Not signed in" });
      return;
    }
    let alive = true;
    setDevice({ state: "loading", label: "Checking device…" });

    callAuthed<DevicesStatus>("devices", { action: "status" })
      .then((res) => {
        if (!alive) return;
        const raw = (res.status ?? res.device?.attestation ?? "").toLowerCase();
        if (raw === "active" || raw === "unverified") {
          setDevice({ state: "live", label: "Device active" });
        } else if (raw === "pending") {
          setDevice({ state: "live", label: "Device pending" });
        } else {
          setDevice({ state: "live", label: "Device not registered" });
        }
      })
      .catch((e: unknown) => {
        if (!alive) return;
        const msg = e instanceof ApiError ? e.message : "Device status unavailable";
        setDevice({ state: "error", label: msg.length > 42 ? "Device status unavailable" : msg });
      });

    return () => {
      alive = false;
    };
  }, [signedIn, session?.user_id]);

  if (!ready) return null;

  if (!signedIn) {
    return (
      <Link href={`/sign-in?next=${encodeURIComponent(pathname || "/organiser")}`} className="btn btn-sm btn-primary">
        Sign in
      </Link>
    );
  }

  const initial = (session?.email ?? "U").trim().charAt(0).toUpperCase() || "U";

  return (
    <>
      {device.state === "live" ? (
        <Badge tone={device.label === "Device pending" ? "warning" : "success"}>{device.label}</Badge>
      ) : device.state === "error" ? (
        <Badge tone="warning">{device.label}</Badge>
      ) : null}
      <span className={`account-email ${tone === "light" ? "on-light" : ""}`} title={session?.email}>
        {session?.email || "Signed in"}
      </span>
      <button className="btn btn-sm" onClick={() => signOut()} title="Sign out">
        Sign out
      </button>
      <div className="avatar" aria-label="Account">
        {initial}
      </div>
    </>
  );
}
