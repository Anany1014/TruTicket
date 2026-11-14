"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Logo } from "@/components/Logo";
import { ApiError } from "@/lib/api";
import { requestEmailCode, verifyEmailCode, signOut } from "@/lib/session";
import { useSession } from "@/lib/use-session";

/**
 * Sign-in with an emailed six-digit code.
 *
 * Step one asks for the email. Step two asks for the code. There is no password and
 * no client-chosen role: the backend decides what the account is, and a first-time
 * email simply creates the account.
 *
 * The page sits outside the organiser and admin shells on purpose: somebody who is
 * not signed in yet has no navigation to see.
 */
export default function SignInPage() {
  // `useSearchParams` suspends during prerender, so the form sits behind a boundary
  // and the static shell renders without it.
  return (
    <div className="signin-page">
      <div className="signin-inner">
        <div className="signin-brand">
          <Logo height={34} />
        </div>
        <Suspense fallback={<div className="card"><div className="card-body">Loading sign-in…</div></div>}>
          <SignInForm />
        </Suspense>
        <p className="small muted signin-foot">
          Fair access. Genuine tickets. Controlled resale.{" "}
          <Link href="/organiser" className="signin-link">
            Back to the app
          </Link>
        </p>
      </div>
    </div>
  );
}

function SignInForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { session, signedIn, ready } = useSession();

  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Where to go after signing in. Only same-site paths are accepted, so a crafted
  // link cannot bounce somebody to another site once they are signed in.
  const rawNext = params.get("next") ?? "/organiser";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/organiser";

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await requestEmailCode(email.trim());
      setStep("code");
      setNotice(`We emailed a six-digit code to ${email.trim()}. It expires in a few minutes.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send the code. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function checkCode(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await verifyEmailCode(email.trim(), code.trim());
      router.push(next);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That code did not work. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (!ready) {
    return (
      <div className="card">
        <div className="card-body">Loading sign-in…</div>
      </div>
    );
  }

  if (signedIn && session) {
    return (
      <div className="card">
        <div className="card-body">
          <h1 className="signin-title">You are signed in</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            {session.email || session.user_id}
          </p>
          <div className="row" style={{ marginTop: 18 }}>
            <Link href={next} className="btn btn-primary">
              Continue
            </Link>
            <button
              className="btn"
              onClick={() => {
                signOut();
                setStep("email");
                setNotice(null);
              }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="card-body">
        <h1 className="signin-title">{step === "email" ? "Sign in to TruTicket" : "Enter your code"}</h1>
        <p className="muted small" style={{ marginTop: 4, marginBottom: 18 }}>
          {step === "email"
            ? "We email you a six-digit code. No password to remember."
            : `Sent to ${email.trim()}. Check your inbox and spam folder.`}
        </p>

        {notice ? <div className="notice info">{notice}</div> : null}
        {error ? <div className="notice danger">{error}</div> : null}

        {step === "email" ? (
          <form onSubmit={sendCode}>
            <label className="field-label" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
            <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={busy || email.trim() === ""}>
              {busy ? "Sending…" : "Email me a code"}
            </button>
          </form>
        ) : (
          <form onSubmit={checkCode}>
            <label className="field-label" htmlFor="code">
              Six-digit code
            </label>
            <input
              id="code"
              className="input code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              placeholder="000000"
            />
            <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} disabled={busy || code.length !== 6}>
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button
              type="button"
              className="btn btn-block"
              style={{ marginTop: 8 }}
              disabled={busy}
              onClick={() => {
                setStep("email");
                setCode("");
                setNotice(null);
                setError(null);
              }}
            >
              Use another email
            </button>
          </form>
        )}

        <p className="small muted" style={{ marginTop: 18, marginBottom: 0 }}>
          Signing in unlocks the screens that read your own data: resale listings, your tickets, group invites and
          device security. Everything else works without an account.
        </p>
      </div>
    </div>
  );
}
