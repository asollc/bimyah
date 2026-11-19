import { useEffect, useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { useAuth } from "@/auth/AuthProvider";
import { supabase } from "@/integrations/supabase/client";
import { LiquidMetalButton } from "@/components/ui/liquid-metal-button";

type LinkRow = {
  yapin_user_id: string;
  yapin_username: string | null;
  created_at: string;
};

type RedeemResult = {
  ok: boolean;
  error?: string;
  yapin_username?: string | null;
};

const ERROR_TEXT: Record<string, string> = {
  invalid_code: "That code doesn't look right. Check it and try again.",
  code_used: "That code has already been used. Run /link in Yapin' for a fresh one.",
  code_expired: "That code expired. Run /link in Yapin' for a fresh one.",
  already_linked:
    "This Bimyah account is already linked to a Yapin' account. Unlink it first if you want to switch.",
  yapin_taken: "That Yapin' account is already linked to a different Bimyah account.",
  not_signed_in: "You need to be signed in to link accounts.",
};

/**
 * Bottom-of-profile Connections block: link this Bimyah account to a
 * Yapin' account. The Bimyah bot's /link command DMs a one-time code;
 * redeeming it here (signed in, which proves this account is yours)
 * stores the pairing in yapin_links, and the bot can then answer
 * /profile in Yapin' with this account's stats.
 */
export function YapinLinkSection() {
  const { user } = useAuth();
  const [link, setLink] = useState<LinkRow | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("yapin_links")
        .select("yapin_user_id, yapin_username, created_at")
        .eq("bimyah_user_id", user.id)
        .maybeSingle();
      setLink((data as LinkRow | null) ?? null);
      setLoaded(true);
    })();
  }, [user]);

  async function redeem() {
    const value = code.trim();
    if (!value || busy) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const { data, error } = await supabase.rpc("redeem_yapin_link", {
        p_code: value,
      });
      if (error) throw error;
      const res = data as RedeemResult | null;
      if (!res?.ok) {
        throw new Error(
          ERROR_TEXT[res?.error ?? ""] ?? "Something went wrong. Try again.",
        );
      }
      setCode("");
      setMsg(
        res.yapin_username
          ? `Linked to Yapin' user ${res.yapin_username}. The Bimyah bot can now show your profile there.`
          : "Linked. The Bimyah bot can now show your profile in Yapin'.",
      );
      if (user) {
        const { data: row } = await supabase
          .from("yapin_links")
          .select("yapin_user_id, yapin_username, created_at")
          .eq("bimyah_user_id", user.id)
          .maybeSingle();
        setLink((row as LinkRow | null) ?? null);
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function unlink() {
    if (busy) return;
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const { data, error } = await supabase.rpc("unlink_yapin");
      if (error) throw error;
      const res = data as RedeemResult | null;
      if (!res?.ok) {
        throw new Error(
          ERROR_TEXT[res?.error ?? ""] ?? "Something went wrong. Try again.",
        );
      }
      setLink(null);
      setMsg("Yapin' account unlinked.");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!user || !loaded) return null;

  // Rendered inside the profile page's combined Connections section
  // (Ronya 2026-11-10): the section supplies the header, the shared
  // explanation, and this platform's logo, so this component is just
  // the link state + code field.
  return (
    <div>
      {link ? (
        <>
          <p className="mt-3 text-sm text-white/80">
            Linked to Yapin' user{" "}
            <span className="font-display text-white">
              {link.yapin_username ?? "unknown"}
            </span>
          </p>
          <button
            type="button"
            onClick={() => void unlink()}
            disabled={busy}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/20 bg-black/40 px-4 py-2 text-sm text-white/80 transition hover:border-white/40 hover:text-white disabled:opacity-50"
          >
            <Unlink className="h-4 w-4" /> Unlink Yapin'
          </button>
        </>
      ) : (
        <>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => {
              if (e.key === "Enter") void redeem();
            }}
            placeholder="Link code from the bot"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            className="mt-3 w-full rounded-lg border border-white/20 bg-black/40 px-4 py-2 font-display tracking-[0.2em] text-white placeholder:tracking-normal placeholder:text-white/30"
          />
          <LiquidMetalButton
            type="button"
            onClick={() => void redeem()}
            disabled={busy || !code.trim()}
            className="btn-3d btn-3d-gold mt-3 inline-flex w-full items-center justify-center gap-2 text-sm"
          >
            <Link2 className="h-4 w-4" /> Link Yapin'
          </LiquidMetalButton>
        </>
      )}

      {msg && <div className="mt-3 text-xs text-emerald-400">{msg}</div>}
      {err && (
        <div className="mt-3 text-xs text-[var(--player-red)]">{err}</div>
      )}
    </div>
  );
}
