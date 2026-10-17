import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PowLogo } from "@/components/game/Visuals";

export const Route = createFileRoute("/reset-password")({
  head: () => {
    const title = "Reset password — Bimyah!";
    const description = "Choose a new password for your Bimyah! account using the secure recovery link sent to your email.";
    const url = "https://playbimyah.com/reset-password";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
        { name: "robots", content: "noindex" },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Supabase delivers the recovery session via URL hash. The client picks it
  // up automatically — we just need to wait for the recovery event.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });
    // Also handle the case where the session is already loaded.
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    if (password.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setErr("Passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setInfo("Password updated! Redirecting…");
      setTimeout(() => void navigate({ to: "/" }), 1200);
    } catch (e) {
      setErr((e as Error).message ?? "Could not update password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-[calc(100dvh-50px)] w-screen flex-col items-center justify-center px-4 py-6">
      <Link to="/" className="mb-4">
        <PowLogo size={182} />
      </Link>

      <p className="mb-3 text-center text-sm font-display uppercase tracking-widest text-amber-300">
        Set a new password
      </p>

      <div className="w-full max-w-xs rounded-2xl border border-[var(--mint)]/30 bg-black/40 p-5 backdrop-blur">
        {!ready ? (
          <div className="text-center text-sm text-white/70">
            Validating reset link…
            <div className="mt-3 text-xs text-white/40">
              If this takes too long, request a new link from the sign-in page.
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-2">
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password"
              className="rounded-lg border border-white/20 bg-black/40 px-4 py-2 font-display text-white placeholder:text-white/30"
            />
            <input
              type="password"
              required
              minLength={6}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Confirm new password"
              className="rounded-lg border border-white/20 bg-black/40 px-4 py-2 font-display text-white placeholder:text-white/30"
            />
            {err && <div className="text-center text-xs text-[var(--player-red)]">{err}</div>}
            {info && <div className="text-center text-xs text-[var(--mint)]">{info}</div>}
            <button
              type="submit"
              disabled={busy}
              className="btn-3d btn-3d-mint mt-1 w-full text-sm disabled:opacity-50"
            >
              {busy ? "Saving…" : "Update password"}
            </button>
          </form>
        )}

        <Link
          to="/auth"
          className="mt-3 block text-center text-xs text-white/50 hover:text-white"
        >
          Back to sign in
        </Link>
        <Link
          to="/"
          className="mt-1 block text-center text-xs text-white/50 hover:text-white"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
