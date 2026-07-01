import { useEffect, useState } from "react";
import { getMyReferrals, getMySponsor } from "@/lib/rpc/referrals.functions";
import { BplusIcon } from "@/components/BplusIcon";
import { Loader2 } from "lucide-react";

type Row = {
  user_id: string;
  display_name: string;
  joined_at: string;
  is_plus: boolean;
};

export function ReferralsTab() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sponsor, setSponsor] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [refs, spon] = await Promise.all([getMyReferrals(), getMySponsor()]);
        if (cancelled) return;
        setRows(refs.rows);
        setSponsor(spon.sponsor);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (err) {
    return (
      <div className="rounded-lg border border-white/10 bg-black/30 px-4 py-6 text-center text-xs text-[var(--player-red)]">
        {err}
      </div>
    );
  }
  if (!rows) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-black/30 px-4 py-8 text-xs text-white/60">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading…
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="flex flex-col items-center justify-center gap-1 rounded-lg border border-white/10 bg-black/30 px-4 py-8 text-center">
        <div className="font-display text-sm uppercase tracking-widest text-white/70">
          No referrals yet
        </div>
        <div className="text-[10px] uppercase tracking-widest text-[var(--gold)]/70">
          Share your link to invite players
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
      <table className="w-full text-xs">
        <thead className="bg-white/5 text-left text-[10px] uppercase tracking-widest text-white/50">
          <tr>
            <th className="px-3 py-2 w-8">#</th>
            <th className="px-3 py-2">Player</th>
            <th className="px-3 py-2">Joined</th>
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
  );
}
