import { useEffect, useState } from "react";
import { getMyReferrals, getMySponsor } from "@/lib/rpc/referrals.functions";
import { useAuth } from "@/auth/AuthProvider";
import { BplusIcon } from "@/components/BplusIcon";
import { Check, Copy, Loader2 } from "lucide-react";

type Row = {
  user_id: string;
  display_name: string;
  joined_at: string;
  is_plus: boolean;
  active: boolean;
};

export function ReferralsTab() {
  const { profile } = useAuth();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sponsor, setSponsor] = useState<string | null | undefined>(undefined);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [refs, spon] = await Promise.all([getMyReferrals(), getMySponsor()]);
        if (cancelled) return;
        setRows(refs?.rows ?? []);
        setSponsor(spon?.sponsor ?? null);
      } catch (e) {
        if (!cancelled) {
          const msg =
            e instanceof Response
              ? `Request failed (${e.status})`
              : ((e as Error).message ?? "Failed to load referrals.");
          setErr(msg);
          setRows([]);
          setSponsor(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const inviteLink = profile?.display_name
    ? `https://playbimyah.com/?ref=${encodeURIComponent(profile.display_name)}`
    : null;

  async function copyInviteLink() {
    if (!inviteLink) return;
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable; the link text stays visible to copy by hand */
    }
  }

  const sponsorBanner = (
    <div className="rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-center">
      {sponsor === undefined ? (
        <div className="text-[10px] uppercase tracking-widest text-white/40">Loading sponsor…</div>
      ) : sponsor ? (
        <div className="text-xs text-white/70">
          Your sponsor is{" "}
          <span className="font-medium text-[var(--gold)]">{sponsor}</span>
        </div>
      ) : (
        <div className="text-xs text-white/60">No sponsor assigned</div>
      )}
    </div>
  );

  // Invite link + earning rules (Ronya 2026-11-03). The tab used to
  // tell players to share their link without ever showing it; now the
  // link lives here with a copy button, next to the Recruiter
  // challenge and screenshot share terms.
  const inviteBlock = inviteLink ? (
    <div className="space-y-3">
      <div className="rounded-lg border border-white/10 bg-black/30 px-4 py-3">
        <div className="text-center font-display text-xs uppercase tracking-widest text-white/70">
          Your invite link
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate rounded-md bg-black/40 px-2.5 py-2 text-xs font-medium text-white">
            {inviteLink}
          </div>
          <button
            type="button"
            onClick={() => void copyInviteLink()}
            className="btn-black-border flex shrink-0 items-center gap-1 rounded-md bg-[var(--gold)] px-2.5 py-2 text-xs font-bold text-black transition hover:scale-105"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <div className="rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-xs leading-relaxed text-white/70">
        <div className="font-display text-xs uppercase tracking-widest text-[var(--gold)]">
          Recruiter challenge
        </div>
        <p className="mt-1">
          When a player who joined with your link finishes a game with at least one other human
          player, they become an <b className="text-white">active recruit</b>. Every active
          recruit earns you <b className="text-white">300 Bimbits</b> and one Recruiter level:
          level 1 takes 1 active recruit, level 2 takes 2, and each level after that takes one
          more.
        </p>
        <div className="mt-3 font-display text-xs uppercase tracking-widest text-[var(--gold)]">
          Share and earn
        </div>
        <p className="mt-1">
          Share a game screenshot publicly from the win screen camera button and earn{" "}
          <b className="text-white">50 Bimbits</b>, once a day. Shares must be public. If a post
          is removed, the Bimbits earned from it will be taken back.
        </p>
      </div>
    </div>
  ) : null;

  if (err) {
    return (
      <div className="space-y-3">
        {sponsorBanner}
        {inviteBlock}
        <div className="rounded-lg border border-white/10 bg-black/30 px-4 py-6 text-center text-xs text-[var(--player-red)]">
          {err}
        </div>
      </div>
    );
  }
  if (!rows) {
    return (
      <div className="space-y-3">
        {sponsorBanner}
        {inviteBlock}
        <div className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-black/30 px-4 py-8 text-xs text-white/60">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="space-y-3">
        {sponsorBanner}
        {inviteBlock}
        <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-black/30 px-4 py-8 text-center">
          <div className="font-display text-sm uppercase tracking-widest text-white/70">
            No referrals yet
          </div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--gold)]/70">
            Share your link to invite players
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sponsorBanner}
      {inviteBlock}
      <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
        <table className="w-full text-xs">
          <thead className="bg-white/5 text-left text-[10px] uppercase tracking-widest text-white/50">
            <tr>
              <th className="px-3 py-2 w-8">#</th>
              <th className="px-3 py-2">Player</th>
              <th className="px-3 py-2">Joined</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2 text-right">Plan</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.user_id} className="border-t border-white/5">
                <td className="px-3 py-2 text-white/40">{i + 1}</td>
                <td className="px-3 py-2 font-medium text-white/90">{r.display_name}</td>
                <td className="px-3 py-2 text-white/60">
                  {new Date(r.joined_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-2">
                  {r.active ? (
                    <span className="font-bold text-emerald-400">Active</span>
                  ) : (
                    <span className="text-white/50">Not active yet</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  {r.is_plus ? (
                    <span className="inline-flex items-center gap-1 text-[var(--gold)]">
                      <BplusIcon size={12} /> B+
                    </span>
                  ) : (
                    <span className="text-white/50">Free</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
