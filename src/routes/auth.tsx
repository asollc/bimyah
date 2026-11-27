import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { LiquidMetalButton } from "@/components/ui/liquid-metal-button";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/auth/AuthProvider";
import { useDiscord } from "@/discord/DiscordProvider";
import { PowLogo } from "@/components/game/Visuals";
import { WHITELIST_ACK_KEY } from "@/auth/WhitelistAckGuard";
import iconHome from "@/assets/icons3d/home-3d-v2.webp";
import cardBackImg from "@/assets/card-standard-bimyah.webp";

export const Route = createFileRoute("/auth")({
  head: () => {
    const title = "Sign in — Bimyah!";
    const description = "Sign in or create your free Bimyah! account to play the no-turns card race online with friends.";
    const url = "https://playbimyah.com/auth";
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
  component: AuthPage,
});

type Mode = "signin" | "signup";

function AuthPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const discord = useDiscord();
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
  const [showWhitelistOverlay, setShowWhitelistOverlay] = useState(false);
  const [ackChecked, setAckChecked] = useState(false);

  // If this user signed up earlier but never acknowledged the overlay
  // (e.g. browser closed, network drop, refresh), re-show it on return.
  useEffect(() => {
    if (loading || !user) return;
    try {
      const pending = localStorage.getItem(WHITELIST_ACK_KEY);
      if (pending && pending === user.id) {
        setShowWhitelistOverlay(true);
      }
    } catch {
      /* ignore */
    }
  }, [loading, user]);

  useEffect(() => {
    if (!loading && user && !showWhitelistOverlay) void navigate({ to: "/" });
  }, [loading, user, navigate, showWhitelistOverlay]);


  // The auth action runs from the button's click, NOT form submission:
  // embedded activity frames (Yapin') silently block form submissions,
  // which left the old type="submit" button completely dead there
  // (verified live 2026-11-04: no busy state, no error, no navigation,
  // while plain click handlers like Forgot password worked). Enter is
  // routed through the same click path via the form's onKeyDown, and
  // the form onSubmit stays as a fallback for normal browsers.
  function submit(e: React.FormEvent) {
    e.preventDefault();
    void runSubmit();
  }

  async function runSubmit() {
    setErr(null);
    setInfo(null);
    setBusy(true);
    try {
      if (mode === "signup") {
        const name = displayName.trim().slice(0, 14) || email.split("@")[0];
        if (!name) throw new Error("Display name is required.");
        // Check uniqueness (case-insensitive). Username is permanent once claimed.
        const { data: taken } = await supabase
          .from("profiles")
          .select("id")
          .ilike("display_name", name)
          .maybeSingle();
        if (taken) throw new Error("That display name is already taken. Pick another — your username is permanent.");
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
        // Mark this account as needing acknowledgement. Cleared only when the
        // user checks the box and clicks "Complete Registration".
        try {
          const newUid = (await supabase.auth.getUser()).data.user?.id;
          if (newUid) localStorage.setItem(WHITELIST_ACK_KEY, newUid);
        } catch {
          /* ignore */
        }
        // Fire the whitelist email right after signup (don't block UI on errors).
        void fetch("/api/public/send-whitelist-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        }).catch(() => {});
        setShowWhitelistOverlay(true);

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

  // Inside Discord, players sign in with their Discord account. The backend
  // links it to their Bimyah player record (or creates one), so web and
  // Discord share the same account, purchases, and items.
  if (discord.active) {
    return <DiscordAuthPanel />;
  }

  return (
    <div className="relative flex min-h-[calc(100dvh-50px)] w-screen flex-col items-center justify-center px-4 py-3">
      <Link to="/" aria-label="Back to home" className="absolute left-4 top-4 z-10">
        <img src={iconHome} alt="" className="h-10 w-10" />
      </Link>
      <Link to="/" className="mb-1">
        <PowLogo size={110} />
      </Link>

      <p className="mb-2 text-center text-sm font-display uppercase tracking-widest text-amber-300">
        Sign in or create a free account to play!
      </p>

      {/* Flip control: the switch (or either label) flips the card
          between its Log in and Create Account faces. The mode state
          drives the flip and every form behavior, unchanged. */}
      <div className="mb-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setMode("signin")}
          className={`font-display text-base font-black uppercase tracking-widest transition-colors ${
            mode === "signin" ? "text-[#00ff66]" : "text-[var(--gold)] hover:text-[var(--gold)]/80"
          }`}
        >
          Log in
        </button>
        <label className="flip-switch">
          <input
            type="checkbox"
            checked={mode === "signup"}
            onChange={(e) => setMode(e.target.checked ? "signup" : "signin")}
            aria-label="Flip between log in and create account"
          />
          <span className="slider" />
        </label>
        <button
          type="button"
          onClick={() => setMode("signup")}
          className={`font-display text-base font-black uppercase tracking-widest transition-colors ${
            mode === "signup" ? "text-[#00ff66]" : "text-[var(--gold)] hover:text-[var(--gold)]/80"
          }`}
        >
          Sign up
        </button>
      </div>

      <div className="auth-card-scene">
        <div className={`auth-card-inner ${mode === "signup" ? "flipped" : ""}`}>
          {/* FRONT: Log in */}
          <div className="auth-face auth-face-front" style={{ backgroundImage: `url(${cardBackImg})` }}>
            <div className="auth-index auth-index-tl text-[#f3c96b]">
              <span>Welcome</span>
              <span>Back</span>
            </div>
            <div className="auth-index auth-index-br text-[#f3c96b]">
              <span>Welcome</span>
              <span>Back</span>
            </div>
            <div className="auth-face-content">
              <div className="auth-face-title">Log in</div>
              <form
                onSubmit={submit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runSubmit();
                  }
                }}
                className="flex flex-col gap-2"
              >
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  tabIndex={mode === "signin" ? 0 : -1}
                  className="auth-input"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  tabIndex={mode === "signin" ? 0 : -1}
                  className="auth-input"
                />
                {err && <div className="text-center text-xs font-semibold text-[#fca5a5]">{err}</div>}
                {info && <div className="text-center text-xs font-semibold text-[#6ee7b7]">{info}</div>}
                <LiquidMetalButton
                  type="button"
                  onClick={() => void runSubmit()}
                  disabled={busy}
                  tabIndex={mode === "signin" ? 0 : -1}
                  className="btn-3d btn-3d-mint mt-1 w-full text-sm disabled:opacity-50"
                >
                  {busy ? "Please wait\u2026" : "Sign In"}
                </LiquidMetalButton>
              </form>

              <button
                type="button"
                disabled={busy}
                tabIndex={mode === "signin" ? 0 : -1}
                onClick={async () => {
                  setErr(null);
                  setInfo(null);
                  if (!email.trim()) {
                    setErr("Enter your email above, then tap Forgot password.");
                    return;
                  }
                  setBusy(true);
                  try {
                    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                      redirectTo: `${window.location.origin}/reset-password`,
                    });
                    if (error) throw error;
                    setInfo("Check your email for a password reset link.");
                  } catch (e) {
                    setErr((e as Error).message ?? "Could not send reset email.");
                  } finally {
                    setBusy(false);
                  }
                }}
                className="mt-3 block w-full text-center text-xs text-white/75 hover:text-white"
              >
                Forgot password?
              </button>
            </div>
          </div>

          {/* BACK: Create Account */}
          <div className="auth-face auth-face-back">
            <div className="auth-index auth-index-tl text-[#1c2f57]">
              <span>New</span>
              <span>Account</span>
            </div>
            <div className="auth-index auth-index-br text-[#1c2f57]">
              <span>New</span>
              <span>Account</span>
            </div>
            <div className="auth-face-content">
              <div className="auth-face-title">Sign up</div>
              <form
                onSubmit={submit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void runSubmit();
                  }
                }}
                className="flex flex-col gap-2"
              >
                <input
                  value={displayName}
                  maxLength={14}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display name (permanent)"
                  tabIndex={mode === "signup" ? 0 : -1}
                  className="auth-input"
                />
                <div className="-mt-1 text-[10px] text-[#1c2333]/50">
                  Your display name is permanent and cannot be changed later.
                </div>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Email"
                  tabIndex={mode === "signup" ? 0 : -1}
                  className="auth-input"
                />
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  tabIndex={mode === "signup" ? 0 : -1}
                  className="auth-input"
                />
                {err && <div className="text-center text-xs font-semibold text-[#b91c1c]">{err}</div>}
                {info && <div className="text-center text-xs font-semibold text-[#047857]">{info}</div>}
                <LiquidMetalButton
                  type="button"
                  onClick={() => void runSubmit()}
                  disabled={busy}
                  tabIndex={mode === "signup" ? 0 : -1}
                  className="btn-3d btn-3d-gold mt-3 w-full text-sm disabled:opacity-50"
                >
                  {busy ? "Please wait\u2026" : "Create Account"}
                </LiquidMetalButton>
              </form>
            </div>
          </div>
        </div>
      </div>

      <p className="mt-4 max-w-xs text-center text-xs text-white/50">
        By signing in or creating an account, you agree to our Terms of
        Service and Privacy Policy.
      </p>

      {showWhitelistOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border-2 border-[var(--gold)] bg-[#0d1b2a] p-6 shadow-2xl">
            <h2 className="mb-3 text-center font-display text-2xl uppercase tracking-wider text-[var(--gold)]">
              Super Important!
            </h2>
            <p className="mb-5 text-sm leading-relaxed text-white/90">
              I just sent you an email that more than likely ended up in your spam folder, due to
              how new the domain is. It's extremely important that you go to that email (subject
              will be <strong className="text-[var(--gold)]">Whitelist Bimyah!</strong>) and
              whitelist/star/add to contacts, and mark it as <strong>NOT SPAM</strong>, so that
              your game notifications like invites from friends don't go to spam. I promise not to
              sell your email, or send any junk. This is just the best way to send notifications
              until I put the app in the app stores. See you in your inbox in a sec.
            </p>
            <label className="mb-5 flex cursor-pointer items-center gap-3 rounded-lg border border-white/20 bg-black/40 p-3">
              <input
                type="checkbox"
                checked={ackChecked}
                onChange={(e) => setAckChecked(e.target.checked)}
                className="h-5 w-5 cursor-pointer accent-[var(--mint)]"
              />
              <span className="font-display text-sm uppercase tracking-widest text-white">Ok</span>
            </label>
            <LiquidMetalButton
              type="button"
              disabled={!ackChecked}
              onClick={() => {
                try {
                  localStorage.removeItem(WHITELIST_ACK_KEY);
                } catch {
                  /* ignore */
                }
                setShowWhitelistOverlay(false);
                setAckChecked(false);
                setInfo("Check your email to confirm your account, then sign in.");
                setMode("signin");
              }}
              className="btn-3d btn-3d-mint w-full text-sm disabled:opacity-40"
            >
              Complete Registration
            </LiquidMetalButton>
          </div>
        </div>
      )}
    </div>
  );
}


function DiscordAuthPanel() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const discord = useDiscord();
  const [tried, setTried] = useState(false);

  // Auto-start Discord sign-in once the SDK is ready.
  useEffect(() => {
    if (discord.status === "ready" && !tried && !user) {
      setTried(true);
      void discord.authenticate().catch(() => {
        /* error surfaces via discord.error */
      });
    }
  }, [discord, tried, user]);

  useEffect(() => {
    if (!loading && user) void navigate({ to: "/" });
  }, [loading, user, navigate]);

  const busy = discord.status === "initializing" || discord.status === "authenticating";

  return (
    <div className="relative flex min-h-[calc(100dvh-50px)] w-screen flex-col items-center justify-center px-4 py-6">
      <PowLogo size={182} />
      <p className="mb-3 mt-4 text-center text-sm font-display uppercase tracking-widest text-amber-300">
        Playing inside Discord
      </p>
      <div className="w-full max-w-xs rounded-2xl border border-[var(--mint)]/30 bg-black/40 p-5 text-center backdrop-blur">
        {discord.status === "error" ? (
          <>
            <p className="mb-3 text-xs text-[var(--player-red)]">
              {discord.error ?? "Discord sign-in failed."}
            </p>
            <LiquidMetalButton
              type="button"
              onClick={() => {
                setTried(false);
                void discord.authenticate().catch(() => {});
              }}
              className="btn-3d btn-3d-mint w-full text-sm"
            >
              Try Again
            </LiquidMetalButton>
          </>
        ) : (
          <>
            <p className="mb-4 text-sm text-white/70">
              {busy
                ? "Connecting your Discord account…"
                : "Sign in with Discord to play with your shared Bimyah! account."}
            </p>
            {!busy && discord.status === "ready" && (
              <LiquidMetalButton
                type="button"
                onClick={() => void discord.authenticate().catch(() => {})}
                className="btn-3d btn-3d-gold w-full text-sm"
              >
                Continue with Discord
              </LiquidMetalButton>
            )}
          </>
        )}
      </div>
    </div>
  );
}
