import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { PowLogo } from "@/components/game/Visuals";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — BIMYAH!" },
      { name: "description", content: "Sign in or create your free Bimyah! account." },
    ],
  }),
  component: AuthPage,
});

type Mode = "signin" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState(() => {
    try {
      return localStorage.getItem("bimyah_last_name") ?? "";
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && user) void navigate({ to: "/" });
  }, [loading, user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const name = displayName.trim().slice(0, 14) || email.split("@")[0];
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/`,
            data: { display_name: name },
          },
        });
        if (error) throw error;
        try {
          localStorage.setItem("bimyah_last_name", name);
        } catch {
          /* ignore */
        }
        setInfo("Check your email to confirm your account, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        void navigate({ to: "/" });
      }
    } catch (e) {
      setErr((e as Error).message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setErr(null);
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/` },
      });
      if (error) throw error;
    } catch (e) {
      setErr((e as Error).message ?? "Google sign-in failed.");
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-[calc(100dvh-50px)] w-screen flex-col items-center justify-center px-4 py-6">
      <Link to="/" className="mb-4">
        <PowLogo size={140} />
      </Link>

      <div className="w-full max-w-xs rounded-2xl border border-[var(--mint)]/30 bg-black/40 p-5 backdrop-blur">
        <div className="mb-4 flex justify-center gap-2 text-xs font-display uppercase tracking-widest">
          <button
            onClick={() => setMode("signin")}
            className={mode === "signin" ? "text-[var(--mint)]" : "text-white/50"}
          >
            Sign In
          </button>
          <span className="text-white/30">/</span>
          <button
            onClick={() => setMode("signup")}
            className={mode === "signup" ? "text-[var(--gold)]" : "text-white/50"}
          >
            Create Account
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-2">
          {mode === "signup" && (
            <input
              value={displayName}
              maxLength={14}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Display name"
              className="rounded-lg border border-white/20 bg-black/40 px-4 py-2 font-display text-white placeholder:text-white/30"
            />
          )}
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email"
            className="rounded-lg border border-white/20 bg-black/40 px-4 py-2 font-display text-white placeholder:text-white/30"
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="rounded-lg border border-white/20 bg-black/40 px-4 py-2 font-display text-white placeholder:text-white/30"
          />
          {err && <div className="text-center text-xs text-[var(--player-red)]">{err}</div>}
          {info && <div className="text-center text-xs text-[var(--mint)]">{info}</div>}
          <button
            type="submit"
            disabled={busy}
            className={`btn-3d ${mode === "signup" ? "btn-3d-gold" : "btn-3d-mint"} mt-1 w-full text-sm disabled:opacity-50`}
          >
            {busy ? "Please wait…" : mode === "signup" ? "Create Account" : "Sign In"}
          </button>
        </form>

        <div className="my-3 text-center text-[10px] uppercase tracking-widest text-white/40">or</div>

        <button
          onClick={google}
          disabled={busy}
          className="btn-3d btn-3d-dark w-full text-sm disabled:opacity-50"
        >
          Continue with Google
        </button>

        <Link
          to="/"
          className="mt-3 block text-center text-xs text-white/50 hover:text-white"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}
