import { useEffect, useState } from "react";
import { BarChart3, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getMyStats, type MyStats, type StatBucket } from "@/lib/rpc/stats.functions";

/* Stats page (Ronya 2026-11-09): same Player/Bot tabs and seat
   number row as the Challenges dialog, plus an "All" seat option
   that totals every seat count. The eight tracked stats: games
   hosted (finished), games won, games won as a guest (shown under
   games won), fastest win, challenges completed, active referrals,
   Bimbits spent, Bimbucks spent. Extras: games played, win rate,
   tournament wins, average game length, Bimbits earned. The last
   five profile-wide stats live in the All Time section because they
   do not split by seats. */

function formatDuration(ms: number | null): string {
  if (ms == null) return "Not timed yet";
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const whole = Math.floor(seconds);
  const tenths = Math.floor((seconds - whole) * 10);
  return `${minutes}:${String(whole).padStart(2, "0")}.${tenths}`;
}

function formatAvg(ms: number | null): string {
  if (ms == null) return "—";
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function combine(buckets: StatBucket[]): {
  played: number;
  hosted: number;
  won: number;
  guestWins: number;
  tournamentWins: number;
  fastestWinMs: number | null;
  avgDurationMs: number | null;
  setsLocked: number;
  currentStreak: number;
  bestStreak: number;
} {
  let fastest: number | null = null;
  let durationWeighted = 0;
  let durationCount = 0;
  const out = {
    played: 0,
    hosted: 0,
    won: 0,
    guestWins: 0,
    tournamentWins: 0,
    fastestWinMs: null as number | null,
    avgDurationMs: null as number | null,
    setsLocked: 0,
    currentStreak: 0,
    bestStreak: 0,
  };
  for (const b of buckets) {
    out.played += b.played;
    out.hosted += b.hosted;
    out.won += b.won;
    out.guestWins += b.guestWins;
    out.tournamentWins += b.tournamentWins;
    out.setsLocked += b.setsLocked;
    out.bestStreak = Math.max(out.bestStreak, b.bestStreak);
    if (b.fastestWinMs != null) {
      fastest = fastest == null ? b.fastestWinMs : Math.min(fastest, b.fastestWinMs);
    }
    if (b.avgDurationMs != null && b.durationCount > 0) {
      durationWeighted += b.avgDurationMs * b.durationCount;
      durationCount += b.durationCount;
    }
  }
  out.fastestWinMs = fastest;
  out.avgDurationMs = durationCount > 0 ? Math.round(durationWeighted / durationCount) : null;
  return out;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-widest text-white/50">{label}</div>
      <div className="mt-0.5 font-display text-xl font-bold text-white/95">{value}</div>
      {sub && <div className="text-[10px] text-white/40">{sub}</div>}
    </div>
  );
}

export function StatsPanel({
  stats,
  loading,
}: {
  stats: MyStats | null;
  loading: boolean;
}) {
  const [tab, setTab] = useState<"human" | "bot">("human");
  // 0 = All seat counts (Ronya: these stats are tracked across all
  // seat counts); 2 to 8 picks one table size like Challenges.
  const [seats, setSeats] = useState(0);
  if (loading && !stats) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const inTab = (stats?.buckets ?? []).filter((b) => b.category === tab);
  // The server sends a seats-0 bucket per category with the true
  // all-seats totals (streaks cannot be summed from per-seat rows).
  const selected =
    inTab.find((b) => b.seats === seats) ??
    combine(inTab.filter((b) => b.seats > 0));
  const winRate =
    selected.played > 0 ? `${Math.round((selected.won / selected.played) * 100)}%` : "—";
  // Favorite table size: the seat count with the most finished
  // games in this tab (ties keep the smaller table).
  const favorite = inTab
    .filter((b) => b.seats > 0)
    .reduce<StatBucket | null>(
      (acc, b) => (acc == null || b.played > acc.played ? b : acc),
      null,
    );
  const favoriteLabel =
    !favorite || favorite.played === 0 ? "—" : `${favorite.seats} seats`;
  const favoriteSub =
    !favorite || favorite.played === 0
      ? "No games yet"
      : `${favorite.played} games played at this size`;
  const g = stats?.global;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-none flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/50">
            <BarChart3 className="h-5 w-5 text-[var(--gold)]" />
            Stats
          </div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--gold)]/80">
            {seats === 0 ? "All seat counts" : seats === 2 ? "1-on-1 games" : `${seats} seat games`}
          </div>
        </div>
        <div className="flex gap-2" role="tablist" aria-label="Stat type">
          {(
            [
              { id: "human", label: "Player Stats", sub: "Registered Human Matches" },
              { id: "bot", label: "Bot Stats", sub: "Matches with ANY bots" },
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
          {[0, 2, 3, 4, 5, 6, 7, 8].map((n) => (
            <button
              key={n}
              role="tab"
              aria-selected={seats === n}
              aria-label={n === 0 ? "All seat counts" : `${n} players`}
              onClick={() => setSeats(n)}
              className={`flex-1 rounded-full px-2 py-1 font-display text-[11px] font-bold transition ${
                seats === n
                  ? "bg-[var(--gold)] text-black"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              {n === 0 ? "All" : n}
            </button>
          ))}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Games played" value={String(selected.played)} sub="Finished games" />
          <StatCard label="Games hosted" value={String(selected.hosted)} sub="Finished games you hosted" />
          <div className="col-span-2 rounded-lg border border-[var(--gold)]/30 bg-[var(--gold)]/5 px-3 py-2.5">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-white/50">Games won</div>
                <div className="mt-0.5 font-display text-xl font-bold text-white/95">
                  {selected.won}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] uppercase tracking-widest text-white/40">
                  Won as a guest
                </div>
                <div className="font-display text-sm font-bold text-[var(--gold)]">
                  {selected.guestWins}
                </div>
              </div>
            </div>
            <div className="mt-1 text-[10px] text-white/40">
              Wins in games you joined but did not host
            </div>
          </div>
          <StatCard label="Win rate" value={winRate} sub="Wins out of games played" />
          <StatCard label="Tournament wins" value={String(selected.tournamentWins)} />
          <StatCard label="Sets locked" value={String(selected.setsLocked)} sub="Four-of-a-kind piles you SET" />
          <StatCard label="Fastest win" value={formatDuration(selected.fastestWinMs)} />
          <StatCard label="Average game" value={formatAvg(selected.avgDurationMs)} sub="Length of a finished game" />
          <StatCard label="Current win streak" value={String(selected.currentStreak)} sub="Wins in a row right now" />
          <StatCard label="Best win streak" value={String(selected.bestStreak)} sub="Longest run of wins" />
          <StatCard label="Favorite table size" value={favoriteLabel} sub={favoriteSub} />
        </div>

        <div className="mt-2 flex items-center gap-2">
          <div className="h-px flex-1 bg-[var(--gold)]/25" />
          <div className="text-[10px] uppercase tracking-widest text-[var(--gold)]/70">
            All time · every seat count
          </div>
          <div className="h-px flex-1 bg-[var(--gold)]/25" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="Challenges completed" value={String(g?.challengesCompleted ?? 0)} />
          <StatCard label="Active referrals" value={String(g?.activeReferrals ?? 0)} sub="Recruits who finished a real game" />
          <StatCard label="Bimbits spent" value={(g?.bimbitsSpent ?? 0).toLocaleString()} sub="On Bmart items" />
          <StatCard label="Bimbucks spent" value={(g?.bimbucksSpent ?? 0).toLocaleString()} sub="On Bmart items" />
          <StatCard label="Bimbits earned" value={(g?.bimbitsEarned ?? 0).toLocaleString()} sub="From challenges and recruiting" />
        </div>
        <p className="text-[10px] leading-relaxed text-white/35">
          Fastest win, games won as a guest, win streaks, sets locked, and average game length
          count from November 9, 2026, when per-match recording started. Games played, hosted,
          and won include your full history.
        </p>
      </div>
    </div>
  );
}

/* Profile page: the stats list in its own scrollable dialog, opened
   from the chart button under the wallet icon (same pattern as
   Challenges). */
export function StatsDialog({ onClose }: { onClose: () => void }) {
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent className="top-[3dvh] flex max-h-[92dvh] max-w-md translate-y-0 flex-col overflow-hidden border-[var(--gold)]/30 bg-black/95 text-white">
        <DialogHeader className="flex-none">
          <DialogTitle className="font-display uppercase tracking-widest text-[var(--gold)]">
            Stats
          </DialogTitle>
        </DialogHeader>
        <MyStatsTab />
      </DialogContent>
    </Dialog>
  );
}

export function MyStatsTab() {
  const [stats, setStats] = useState<MyStats | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getMyStats();
        if (!cancelled) setStats(res);
      } catch {
        if (!cancelled) setStats(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return <StatsPanel stats={stats} loading={loading} />;
}
