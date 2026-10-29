import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import iconMedal from "@/assets/icons3d/medal.webp";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getMyChallenges, type ChallengeEntry } from "@/lib/rpc/challenges.functions";

/* Challenge list, shared by the profile page (own challenges) and the
   admin user view (a member's challenges, read-only). Presentational:
   callers supply the entries. */
export function ChallengesPanel({
  entries,
  loading,
}: {
  entries: ChallengeEntry[] | null;
  loading: boolean;
}) {
  if (loading && !entries) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const list = entries ?? [];
  const done = list.filter((e) => e.completed_at).length;
  const earned = list.reduce((sum, e) => sum + (e.completed_at ? e.reward : 0), 0);
  // Completed challenges sink to a separate "Completed" section at the
  // bottom (Ronya 2026-10-25); in-progress ones keep their order on top.
  const active = list.filter((e) => !e.completed_at);
  const completed = list.filter((e) => e.completed_at);

  function renderCard(e: ChallengeEntry) {
    const complete = !!e.completed_at;
    const pct = Math.min(100, Math.round((Math.min(e.progress, e.target) / e.target) * 100));
    return (
      <div
        key={e.id}
        className={`rounded-lg border px-3 py-2.5 ${
          complete
            ? "border-[var(--mint)]/40 bg-[var(--mint)]/10"
            : "border-white/10 bg-black/30"
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-display text-sm text-white/90">
            {complete ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--mint)]" />
            ) : (
              <img src={iconMedal} alt="" className="h-5 w-5 shrink-0 object-contain" draggable={false} />
            )}
            {e.name}
          </div>
          <div className="shrink-0 rounded-full bg-[var(--gold)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--gold)]">
            +{e.reward} Bimbit{e.reward === 1 ? "" : "s"}
          </div>
        </div>
        <div className="mt-0.5 text-xs text-white/50">{e.description}</div>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full rounded-full ${complete ? "bg-[var(--mint)]" : "bg-[var(--gold)]/80"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-[10px] uppercase tracking-widest text-white/40">
            {complete
              ? `Done ${new Date(e.completed_at!).toLocaleDateString()}`
              : `${Math.min(e.progress, e.target)} / ${e.target}`}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/50">
          <img src={iconMedal} alt="" className="h-6 w-6 object-contain" draggable={false} />
          Challenges
        </div>
        <div className="text-[10px] uppercase tracking-widest text-[var(--gold)]/80">
          {done} of {list.length} complete · {earned} Bimbits earned
        </div>
      </div>
      {active.map(renderCard)}
      {completed.length > 0 && (
        <>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-px flex-1 bg-[var(--mint)]/25" />
            <div className="text-[10px] uppercase tracking-widest text-[var(--mint)]/70">
              Completed
            </div>
            <div className="h-px flex-1 bg-[var(--mint)]/25" />
          </div>
          {completed.map(renderCard)}
        </>
      )}
    </div>
  );
}

/* Profile page: the challenge list in its own scrollable dialog, opened
   from the treasure chest button under the wallet icon (Ronya 2026-10-23;
   challenges used to live in the profile tab bar). */
export function ChallengesDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto border-[var(--gold)]/30 bg-black/95 text-white">
        <DialogHeader>
          <DialogTitle className="font-display uppercase tracking-widest text-[var(--gold)]">
            Challenges
          </DialogTitle>
        </DialogHeader>
        <MyChallengesTab />
      </DialogContent>
    </Dialog>
  );
}

/* Profile page tab: fetches the signed-in user's own challenges. */
export function MyChallengesTab() {
  const [entries, setEntries] = useState<ChallengeEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { entries } = await getMyChallenges();
        if (!cancelled) setEntries(entries);
      } catch {
        if (!cancelled) setEntries([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return <ChallengesPanel entries={entries} loading={loading} />;
}
