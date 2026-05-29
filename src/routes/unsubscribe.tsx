import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";

type Status = "loading" | "ready" | "already" | "invalid" | "success" | "error";

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === "string" ? s.token : "",
  }),
  component: UnsubscribePage,
});

function UnsubscribePage() {
  const { token } = useSearch({ from: "/unsubscribe" });
  const [status, setStatus] = useState<Status>("loading");
  const [email, setEmail] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("invalid");
      return;
    }
    void (async () => {
      try {
        const res = await fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`);
        const body = await res.json();
        if (!res.ok) {
          setErrMsg(body?.error ?? "Invalid token");
          setStatus("invalid");
          return;
        }
        if (body.alreadyUnsubscribed || body.already_unsubscribed) {
          setEmail(body.email ?? null);
          setStatus("already");
          return;
        }
        setEmail(body.email ?? null);
        setStatus("ready");
      } catch {
        setStatus("error");
      }
    })();
  }, [token]);

  async function confirm() {
    setStatus("loading");
    try {
      const res = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setErrMsg(body?.error ?? "Failed to unsubscribe");
        setStatus("error");
        return;
      }
      setStatus("success");
    } catch {
      setStatus("error");
    }
  }

  return (
    <div className="min-h-screen bg-[oklch(0.14_0.04_165)] text-white grid place-items-center px-4">
      <div className="w-full max-w-md rounded-xl border border-[var(--mint)]/30 bg-black/40 p-6 backdrop-blur">
        <h1 className="font-display text-lg uppercase tracking-widest text-[var(--mint)]">
          Email preferences
        </h1>
        <div className="mt-4 text-sm text-white/80">
          {status === "loading" && <p>Loading…</p>}
          {status === "invalid" && (
            <p className="text-[var(--player-red)]">
              {errMsg ?? "This unsubscribe link is invalid or expired."}
            </p>
          )}
          {status === "ready" && (
            <>
              <p>
                Unsubscribe{" "}
                {email ? <span className="font-mono text-white">{email}</span> : "this address"}{" "}
                from Bimyah emails?
              </p>
              <button
                onClick={confirm}
                className="btn-3d btn-3d-mint mt-5 w-full text-sm"
              >
                Confirm unsubscribe
              </button>
            </>
          )}
          {status === "already" && (
            <p>
              {email ? <span className="font-mono">{email}</span> : "This address"} is already
              unsubscribed.
            </p>
          )}
          {status === "success" && (
            <p className="text-[var(--mint)]">You've been unsubscribed. Sorry to see you go.</p>
          )}
          {status === "error" && (
            <p className="text-[var(--player-red)]">{errMsg ?? "Something went wrong."}</p>
          )}
        </div>
      </div>
    </div>
  );
}
