import { useState } from "react";
import { LiquidMetalButton } from "@/components/ui/liquid-metal-button";
import { supabase } from "@/integrations/supabase/client";
import { WHITELIST_ACK_KEY } from "@/auth/WhitelistAckGuard";

type Mode = "signin" | "signup";

/**
 * In-room account element (Ronya 2026-11-03): the SAME login element
 * as the auth page, Sign In / Create Account tabs included, so an
 * invited player holding a pending seat never needs another screen to
 * log in or create an account. The signup path mirrors the auth page
 * exactly: permanent display name with the uniqueness check, the
 * whitelist acknowledgement overlay, and the whitelist email. OAuth
 * buttons are the one omission: they redirect away from the room.
 * On success the caller refreshes the seat with the account identity.
 */
export function InRoomAuthModal({
  onCancel,
  onSuccess,
}: {
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [showWhitelistOverlay, setShowWhitelistOverlay] = useState(false);
  const [ackChecked, setAckChecked] = useState(false);

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
        onSuccess();
      }
    } catch (e) {
      setErr((e as Error).message ?? "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function completeRegistration() {
    try {
      localStorage.removeItem(WHITELIST_ACK_KEY);
    } catch {
      /* ignore */
    }
    setShowWhitelistOverlay(false);
    setAckChecked(false);
    // If signup produced a session, the seat identifies now. If the
    // project asks for email confirmation first, there is no session
    // yet: mirror the auth page and ask them to confirm, then sign in
    // (the modal can be reopened; their seat stays pending).
    const { data } = await supabase.auth.getSession();
    if (data.session) {
      onSuccess();
    } else {
      setInfo("Check your email to confirm your account, then sign in.");
      setMode("signin");
    }
  }

  if (showWhitelistOverlay) {
    return (
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4 py-6 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
      >
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
            onClick={() => void completeRegistration()}
            className="btn-3d btn-3d-mint w-full text-sm disabled:opacity-40"
          >
            Complete Registration
          </LiquidMetalButton>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xs">
        <p className="mb-3 text-center font-display text-sm uppercase tracking-widest text-amber-300">
          Sign in or create a free account to play!
        </p>
        <div className="w-full rounded-2xl border border-[var(--mint)]/30 bg-black/60 p-5 backdrop-blur">
          <div className="mb-4 grid grid-cols-2 overflow-hidden rounded-lg border border-white/10">
            <button
              type="button"
              onClick={() => setMode("signin")}
              className={`px-3 py-2 font-display text-base font-black uppercase tracking-widest transition-colors ${
                mode === "signin"
                  ? "bg-[var(--gold)]/15 text-[var(--gold)]"
                  : "bg-transparent text-[var(--gold)]/40 hover:text-[var(--gold)]/70"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => setMode("signup")}
              className={`px-3 py-2 font-display text-base font-black uppercase tracking-widest transition-colors ${
                mode === "signup"
                  ? "bg-[#00ff66]/15 text-[#00ff66]"
                  : "bg-transparent text-[#00ff66] hover:text-[#00ff66]/80"
              }`}
            >
              Create Account
            </button>
          </div>

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
            {mode === "signup" && (
              <>
                <input
                  value={displayName}
                  maxLength={14}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Display name (permanent)"
                  className="rounded-lg border border-white/20 bg-black/40 px-4 py-2 font-display text-white placeholder:text-white/30"
                />
                <div className="-mt-1 text-[10px] text-white/40">
                  Your display name is permanent and cannot be changed later.
                </div>
              </>
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
            {info && <div className="text-center text-xs text-emerald-400">{info}</div>}
            <LiquidMetalButton
type="button"
onClick={() => void runSubmit()}
              disabled={busy}
              className={`btn-3d ${mode === "signup" ? "btn-3d-gold" : "btn-3d-mint"} mt-1 w-full text-sm disabled:opacity-50`}
            >
              {busy ? "Please wait…" : mode === "signup" ? "Create Account" : "Sign In"}
            </LiquidMetalButton>
          </form>

          <p className="mt-3 text-center text-xs text-white/50">
            By signing in or creating an account, you agree to our Terms of
            Service and Privacy Policy.
          </p>

          {mode === "signin" && (
            <button
              type="button"
              disabled={busy}
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
              className="mt-3 block w-full text-center text-xs text-white/70 hover:text-white"
            >
              Forgot password?
            </button>
          )}

          <button
            type="button"
            onClick={onCancel}
            className="mt-2 block w-full text-center text-xs text-white hover:text-white"
          >
            Cancel
          </button>
        </div>
        <div className="mt-2 text-center text-[10px] uppercase tracking-widest text-white/40">
          Your seat is held while you do this
        </div>
      </div>
    </div>
  );
}
