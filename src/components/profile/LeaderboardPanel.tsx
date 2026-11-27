import { useEffect, useState } from "react";
import { Loader2, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  getLeaderboards,
  type LeaderboardRow,
  type LeaderboardsData,
} from "@/lib/rpc/leaderboards.functions";
import { useAuth } from "@/auth/AuthProvider";


/* Leaderboards (Ronya 2026-11-19): top 10 per board, opened from the
   podium icon in the profile's icon row. Match boards are human
   matches only and split by seat count like Challenges (with an All
   row); the challenges / Bimbits boards are global. Rank numbers 1,
   2, and 3 render in gold, silver, and bronze. Tapping a player's
   name opens their public profile. */

type BoardDef = {
  id: string;
  chip: string;
  title: string;
  sub: string;
  match: boolean;
};

/* Ronya's order (2026-11-19). */
const BOARDS: BoardDef[] = [
  { id: "wins", chip: "Wins", title: "Most Match Wins", sub: "Human matches won", match: true },
  { id: "fastest", chip: "Fastest Win", title: "Fastest Match Wins", sub: "Quickest win in a human match", match: true },
  { id: "tourneyLimit", chip: "Tourn. Limit", title: "Highest Tournament Score Limit", sub: "Biggest point limit of a tournament won", match: true },
  { id: "finished", chip: "Finished", title: "Most Matches Finished", sub: "Human matches played to the end", match: true },
  { id: "winRate", chip: "Win Rate", title: "Best Win Rate", sub: "Wins out of matches finished (10+ matches)", match: true },
  { id: "winStreak", chip: "Win Streak", title: "Longest Win Streak", sub: "Most match wins in a row", match: true },
  { id: "hosted", chip: "Hosted", title: "Most Matches Hosted", sub: "Human matches you hosted", match: true },
  { id: "piles", chip: "Piles Set", title: "Most Piles Set", sub: "Four-of-a-kind piles locked in human matches", match: true },
  { id: "challenges", chip: "Challenges", title: "Most Challenges Completed", sub: "Across every category", match: false },
  { id: "earned", chip: "Earned", title: "Most Bimbits Earned", sub: "From challenges and recruiting", match: false },
  { id: "spent", chip: "Spent", title: "Most Bimbits Spent", sub: "On Bmart items", match: false },
  { id: "referrals", chip: "Referrals", title: "Most Active Referrals", sub: "Recruits who played their first match", match: false },
  { id: "streak", chip: "Streak", title: "Longest Active Streak", sub: "Days in a row with at least one human match played", match: false },
];

const RANK_COLORS = ["#FFD700", "#C0C0C0", "#CD7F32"];

function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const whole = Math.floor(seconds);
  const tenths = Math.floor((seconds - whole) * 10);
  return `${minutes}:${String(whole).padStart(2, "0")}.${tenths}`;
}

function formatValue(boardId: string, value: number): string {
  switch (boardId) {
    case "fastest":
      return formatDuration(value);
    case "tourneyLimit":
      return `${value.toLocaleString()} pts`;
    case "streak":
      return `${value.toLocaleString()} day${value === 1 ? "" : "s"}`;
    case "winRate":
      return `${value}%`;
    default:
      return value.toLocaleString();
  }
}

export function LeaderboardPanel({
  data,
  loading,
  onSelectPlayer,
}: {
  data: LeaderboardsData | null;
  loading: boolean;
  onSelectPlayer?: (userId: string) => void;
}) {
  const { user } = useAuth();
  const [boardId, setBoardId] = useState("wins");
  const [seats, setSeats] = useState(0);
  const board = BOARDS.find((b) => b.id === boardId) ?? BOARDS[0];
  const rows: LeaderboardRow[] = data
    ? board.match
      ? (data.match[board.id]?.[seats] ?? [])
      : (data.global[board.id] ?? [])
    : [];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-none flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/50">
            <Trophy className="h-5 w-5 text-[var(--gold)]" />
            Leaderboards
          </div>
          <div className="text-[10px] uppercase tracking-widest text-[var(--gold)]/80">
            {board.match
              ? seats === 0
                ? "All seat counts"
                : seats === 2
                  ? "1-on-1 games"
                  : `${seats} seat games`
              : "All time"}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-1.5" role="tablist" aria-label="Leaderboard">
          {BOARDS.map((b) => (
            <button
              key={b.id}
              role="tab"
              aria-selected={boardId === b.id}
              onClick={() => setBoardId(b.id)}
              className={`rounded-full px-2 py-1.5 font-display text-[10px] font-bold uppercase tracking-wider transition ${
                boardId === b.id
                  ? "bg-[var(--gold)] text-black"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              }`}
            >
              {b.chip}
            </button>
          ))}
        </div>

        {board.match && (
          <>
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
          </>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
        <div>
          <div className="font-display text-sm font-bold text-white/95">{board.title}</div>
          <div className="text-xs text-white/50">{board.sub} · Top 10</div>
        </div>

        {loading && !data ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-lg border border-white/10 bg-black/30 px-3 py-4 text-center text-sm text-white/50">
            No one is on this board yet.
          </div>
        ) : (
          rows.map((r, i) => (
            <div
              key={r.userId}
              className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 ${
                r.userId === user?.id
                  ? "border-[var(--gold)]/50 bg-[var(--gold)]/10"
                  : "border-white/10 bg-black/30"
              }`}
            >
              <span
                className="w-6 flex-none text-center font-display text-base font-black"
                style={{ color: RANK_COLORS[i] ?? "rgba(255,255,255,0.4)" }}
              >
                {i + 1}
              </span>
              {r.avatarUrl ? (
                <img
                  src={r.avatarUrl}
                  alt=""
                  className="h-8 w-8 flex-none rounded-full object-cover"
                  draggable={false}
                />
              ) : (
                <span className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-white/10 font-display text-sm text-white/80">
                  {r.name.slice(0, 1).toUpperCase()}
                </span>
              )}
              <button
                type="button"
                onClick={() => onSelectPlayer?.(r.userId)}
                className="min-w-0 flex-1 truncate text-left font-display text-sm font-bold text-white/90 hover:underline"
              >
                {r.name}
              </button>
              <span className="flex-none font-display text-sm font-bold text-[var(--gold)]">
                {formatValue(board.id, r.value)}
              </span>
            </div>
          ))
        )}

      </div>
    </div>
  );
}

/* Profile page: the leaderboards in their own scrollable dialog,
   opened from the podium icon in the profile's icon row (same
   pattern as Challenges and Stats). */
export function LeaderboardDialog({
  onClose,
  onSelectPlayer,
}: {
  onClose: () => void;
  onSelectPlayer?: (userId: string) => void;
}) {
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
            Leaderboards
          </DialogTitle>
        </DialogHeader>
        <MyLeaderboardTab onSelectPlayer={onSelectPlayer} />
      </DialogContent>
    </Dialog>
  );
}

export function MyLeaderboardTab({
  onSelectPlayer,
}: {
  onSelectPlayer?: (userId: string) => void;
}) {
  const [data, setData] = useState<LeaderboardsData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await getLeaderboards();
        if (!cancelled) setData(res);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  /* Player taps are handed UP to the profile page, which closes
     this dialog and opens the public profile at page level. The
     profile overlay cannot live inside this Radix dialog: first
     its fixed positioning anchored to the dialog's transformed
     box (squashed into the top half of the screen), and portaling
     it out left it click-through under the dialog's pointer
     management (dead Close button). Page level is how it opens
     from everywhere else. */
  return (
    <LeaderboardPanel data={data} loading={loading} onSelectPlayer={onSelectPlayer} />
  );
}
