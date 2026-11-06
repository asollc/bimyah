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
  recruiter,
}: {
  entries: ChallengeEntry[] | null;
  loading: boolean;
  /** Recruiter challenge state (Ronya 2026-11-03). Only the player's
   *  own dialog passes it; the admin member view leaves it out. */
  recruiter?: { recruits: number; reward_per_recruit: number } | null;
}) {
  // Human / Bot tabs (Ronya 2026-11-01): each challenge lives on exactly
  // one tab, per its category in the catalog.
  const [tab, setTab] = useState<"human" | "bot">("human");
  // Seat sub categories (Ronya 2026-11-02): under the tabs, a row of
  // numbers 2 to 8 picks the table size; the list below shows only that
  // size's challenges. The 2 sub category holds the 1-on-1 challenges.
  const [seats, setSeats] = useState(2);
  if (loading && !entries) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const list = (entries ?? []).filter(
    // The unique First Match only exists once it has been completed,
    // in the sub category of the match that completed it (Ronya
    // 2026-11-02); before that it is not shown anywhere.
    (e) => e.id !== "first-match" || e.completed_at,
  );
  // The Recruiter challenge lives outside the catalog (it has no seat
  // count), so the totals add it in when the player's own dialog
  // passes it (Ronya 2026-11-03: the header still said 81 after
  // Recruiter shipped). It counts as complete once the first active
  // recruit lands (Recruiter level 1), and its 300 Bimbit payouts
  // count toward Bimbits earned.
  const totalCount = list.length + (recruiter ? 1 : 0);
  const done =
    list.filter((e) => e.completed_at).length +
    (recruiter && recruiter.recruits >= 1 ? 1 : 0);
  const earned =
    list.reduce((sum, e) => sum + (e.completed_at ? e.reward : 0), 0) +
    (recruiter ? recruiter.recruits * recruiter.reward_per_recruit : 0);
  const tabList = list.filter((e) => e.category === tab && e.seats === seats);
  // Completed challenges sink to a separate "Completed" section at the
  // bottom (Ronya 2026-10-25); in-progress ones keep their order on top.
  const active = tabList.filter((e) => !e.completed_at);
  const completed = tabList.filter((e) => e.completed_at);

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
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
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

  function renderRecruiterCard() {
    if (!recruiter) return null;
    const level = recruiter.recruits;
    const nextTarget = level + 1;
    const pct = Math.min(100, Math.round((level / nextTarget) * 100));
    return (
      <div className="rounded-lg border border-[var(--gold)]/40 bg-[var(--gold)]/10 px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-display text-sm text-white/90">
            <img src={iconMedal} alt="" className="h-5 w-5 shrink-0 object-contain" draggable={false} />
            Recruiter
            <span className="rounded-full bg-[var(--gold)] px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-black">
              Level {level}
            </span>
          </div>
          <div className="shrink-0 rounded-full bg-[var(--gold)]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[var(--gold)]">
            +{recruiter.reward_per_recruit} Bimbits each
          </div>
        </div>
        <div className="mt-0.5 text-xs text-white/50">
          Recruit an active player: someone who joins with your invite link and finishes a game
          with at least one other human player, at any table size. Each active recruit earns you{" "}
          {recruiter.reward_per_recruit} Bimbits and one Recruiter level.
        </div>
        <div className="mt-2 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[var(--gold)]/80"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="text-[10px] uppercase tracking-widest text-white/40">
            {level} / {nextTarget} to level {nextTarget}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Frozen header (Ronya 2026-11-02, restructured same day): the
          dialog is a flex column and this header is flex-none, so the
          counts row, the tab buttons, the Seats label and the seat
          numbers never move; only the cards region below scrolls. The
          earlier sticky version overlapped the dialog's own title and
          close button and cut them off. */}
      <div className="flex flex-none flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/50">
          <img src={iconMedal} alt="" className="h-6 w-6 object-contain" draggable={false} />
          Challenges
        </div>
        <div className="text-[10px] uppercase tracking-widest text-[var(--gold)]/80">
          {done} of {totalCount} complete · {earned} Bimbits earned
        </div>
      </div>
      <div className="flex gap-2" role="tablist" aria-label="Challenge type">
        {(
          [
            { id: "human", label: "Player Challenges", sub: "Registered Human Matches" },
            { id: "bot", label: "Bot Challenges", sub: "Matches with ANY bots" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-2xl px-3 py-1.5 transition ${
              tab === t.id
                ? "bg-[var(--gold)] text-black"
                : "bg-white/10 text-white/60 hover:bg-white/20"
            }`}
          >
            <div className="font-display text-[11px] font-bold uppercase tracking-widest">
              {t.label}
            </div>
            <div className="text-[9px] leading-tight opacity-80">{t.sub}</div>
          </button>
        ))}
      </div>
      <div className="text-center font-display text-[11px] font-bold uppercase tracking-widest text-white/50 underline">
        Seats
      </div>
      <div className="flex gap-1.5" role="tablist" aria-label="Players per game">
        {[2, 3, 4, 5, 6, 7, 8].map((n) => (
          <button
            key={n}
            role="tab"
            aria-selected={seats === n}
            aria-label={`${n} players`}
            onClick={() => setSeats(n)}
            className={`flex-1 rounded-full px-2 py-1 font-display text-[11px] font-bold transition ${
              seats === n
                ? "bg-[var(--gold)] text-black"
                : "bg-white/10 text-white/60 hover:bg-white/20"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      {renderRecruiterCard()}
      {active.map(renderCard)}
      {completed.length > 0 && (
        <>
          <div className="mt-2 flex items-center gap-2">
            <div className="h-px flex-1 bg-[var(--mint)]/25" />
            <div className="text-[10px] uppercase tracking-widest text-[var(--gold)]/70">
              Completed
            </div>
            <div className="h-px flex-1 bg-[var(--mint)]/25" />
          </div>
          {completed.map(renderCard)}
        </>
      )}
      </div>
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
      {/* Anchored to the top instead of centered (Ronya 2026-11-02):
          switching between the Human and Bot tabs changes the list
          length, and a centered window visibly jumps. With the top edge
          pinned, the window only gets shorter or taller in place. */}
      {/* The content is a flex column that never scrolls itself
          (Ronya 2026-11-02): the header (title + close button) and the
          panel's own header stay fixed, and only the challenge cards
          scroll inside the panel. */}
      <DialogContent className="top-[3dvh] flex max-h-[92dvh] max-w-md translate-y-0 flex-col overflow-hidden border-[var(--gold)]/30 bg-black/95 text-white">
        <DialogHeader className="flex-none">
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
  const [recruiter, setRecruiter] = useState<{ recruits: number; reward_per_recruit: number } | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getMyChallenges();
        if (!cancelled) {
          setEntries(res.entries);
          setRecruiter(res.recruiter ?? null);
        }
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
  return <ChallengesPanel entries={entries} loading={loading} recruiter={recruiter} />;
}
