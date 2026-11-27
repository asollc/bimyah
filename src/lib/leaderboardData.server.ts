import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CHALLENGES, CHALLENGE_MAP, metricIncrements } from "@/lib/challenges";

/* Leaderboards aggregation (Ronya 2026-11-19), bulk edition.
 *
 * The first version ranked players by running the Stats page's
 * computeStats once per player: 35 players x ~5 database round
 * trips each, which left the dialog on its spinner for minutes in
 * production (live checks 2026-11-19). This version fetches each
 * table ONCE and replays the exact same merge math in memory:
 * the challenge-progress baseline (max progress per metric) minus
 * each recorded match's challenge increments, plus the raw match
 * aggregates. A local diff harness verified the per-player human
 * buckets match computeStats exactly for every player.
 *
 * Boards: match boards are HUMAN matches only (no bot opponents;
 * guest matches count, exactly like the Stats page's human bucket)
 * and split by seat count, key 0 = all seats. Fastest wins, piles
 * set, tournament limits, and day streaks come from per-match
 * recording (started 2026-11-09). The account boards (challenges
 * completed, Bimbits earned, Bimbits spent) are global. */

export type LeaderboardRow = {
  userId: string;
  name: string;
  avatarUrl: string | null;
  value: number;
};

export type LeaderboardsData = {
  /** Seat-split boards: board id -> seats key (0 = All) -> top 10. */
  match: Record<string, Record<number, LeaderboardRow[]>>;
  /** Global boards: board id -> top 10. */
  global: Record<string, LeaderboardRow[]>;
};

export type SeatValues = {
  won: number;
  played: number;
  hosted: number;
  setsLocked: number;
  fastestWinMs: number | null;
  bestStreak: number;
};

export type PlayerMatchValues = {
  /** seats key (0 = all seats, 2..8) -> board values for one player. */
  bySeats: Map<number, SeatValues>;
};

const SEAT_KEYS = [0, 2, 3, 4, 5, 6, 7, 8];
const DAY_MS = 86_400_000;

const etDay = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function longestDayStreak(dayKeys: Set<string>): number {
  if (dayKeys.size === 0) return 0;
  const days = [...dayKeys]
    .map((k) => {
      const [y, m, d] = k.split("-").map(Number);
      return Date.UTC(y, m - 1, d);
    })
    .sort((a, b) => a - b);
  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    if (days[i] - days[i - 1] === DAY_MS) {
      run += 1;
      best = Math.max(best, run);
    } else if (days[i] !== days[i - 1]) {
      run = 1;
    }
  }
  return best;
}

type RawAgg = {
  played: number;
  won: number;
  hosted: number;
  setsLocked: number;
  fastestWinMs: number | null;
};
const blankRaw = (): RawAgg => ({ played: 0, won: 0, hosted: 0, setsLocked: 0, fastestWinMs: null });

/** Per-player human-bucket values for the match boards, computed in
 *  bulk. Exported for the equivalence harness against computeStats. */
export async function aggregateAllPlayers(
  people: Map<string, { name: string; avatarUrl: string | null }>,
  challengeRows: { user_id: string; challenge_id: string; progress: number; completed_at: string | null }[],
  matchRows: {
    user_id: string;
    total_players: number;
    human_opponents: number;
    guest_opponents: number;
    bot_opponents: number;
    hosted: boolean;
    won: boolean;
    mode: string;
    duration_ms: number | null;
    sets_locked: number;
    point_limit: number | null;
    champion: boolean;
    created_at: string;
  }[],
): Promise<{
  values: Map<string, PlayerMatchValues>;
  tourneyLimit: Map<number, Map<string, number>>;
  streak: Map<number, Map<string, number>>;
}> {
  /* ---- Baseline from challenge progress (max per metric) ---- */
  const rowsByUser = new Map<string, Map<string, number>>();
  for (const r of challengeRows) {
    if (!rowsByUser.has(r.user_id)) rowsByUser.set(r.user_id, new Map());
    rowsByUser.get(r.user_id)!.set(r.challenge_id, r.progress ?? 0);
  }
  // userId -> seats -> { played, won, hosted } baseline (human only)
  const baseline = new Map<string, Map<number, { played: number; won: number; hosted: number }>>();
  for (const userId of people.keys()) {
    const byId = rowsByUser.get(userId) ?? new Map<string, number>();
    const maxProg = new Map<string, number>();
    for (const def of CHALLENGES) {
      const progress = byId.get(def.id) ?? 0;
      const k = `${def.metric}|${def.category}|${def.seats}`;
      maxProg.set(k, Math.max(maxProg.get(k) ?? 0, progress));
    }
    const per = new Map<number, { played: number; won: number; hosted: number }>();
    for (const seats of [2, 3, 4, 5, 6, 7, 8]) {
      per.set(seats, {
        played: maxProg.get(`matches|human|${seats}`) ?? 0,
        won: Math.max(
          maxProg.get(`wins|human|${seats}`) ?? 0,
          maxProg.get(`wins_vs_humans|human|${seats}`) ?? 0,
        ),
        hosted: maxProg.get(`matches_hosted|human|${seats}`) ?? 0,
      });
    }
    baseline.set(userId, per);
  }

  /* ---- Raw recorded matches: subtract increments, add raw ---- */
  const raw = new Map<string, Map<number, RawAgg>>();
  const rawFor = (userId: string, seats: number) => {
    if (!raw.has(userId)) raw.set(userId, new Map());
    const per = raw.get(userId)!;
    if (!per.has(seats)) per.set(seats, blankRaw());
    return per.get(seats)!;
  };
  const limitBySeat = new Map<number, Map<string, number>>();
  const daysBySeat = new Map<number, Map<string, Set<string>>>();
  /* Win streaks replay the recorded matches in order, exactly like
     computeStats' bumpStreak: per seat count and across all seats. */
  const streaks = new Map<string, Map<number, { cur: number; best: number }>>();
  const allStreaks = new Map<string, { cur: number; best: number }>();
  const bumpStreak = (userId: string, seatsKey: number | null, won: boolean) => {
    let run: { cur: number; best: number };
    if (seatsKey == null) {
      if (!allStreaks.has(userId)) allStreaks.set(userId, { cur: 0, best: 0 });
      run = allStreaks.get(userId)!;
    } else {
      if (!streaks.has(userId)) streaks.set(userId, new Map());
      const per = streaks.get(userId)!;
      if (!per.has(seatsKey)) per.set(seatsKey, { cur: 0, best: 0 });
      run = per.get(seatsKey)!;
    }
    run.cur = won ? run.cur + 1 : 0;
    run.best = Math.max(run.best, run.cur);
  };
  const orderedRows = [...matchRows].sort((a, b) =>
    a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0,
  );
  for (const k of SEAT_KEYS) {
    limitBySeat.set(k, new Map());
    daysBySeat.set(k, new Map());
  }
  for (const r of orderedRows) {
    const userId = r.user_id;
    if (!people.has(userId)) continue;
    const seats = r.total_players;
    if ((r.bot_opponents as number) === 0) {
      // Human-bucket boards fed by per-match recording.
      const keys = seats >= 2 && seats <= 8 ? [0, seats] : [0];
      for (const k of keys) {
        const dayMap = daysBySeat.get(k)!;
        if (!dayMap.has(userId)) dayMap.set(userId, new Set());
        dayMap.get(userId)!.add(etDay.format(new Date(r.created_at)));
        if (r.champion && r.point_limit != null) {
          const m = limitBySeat.get(k)!;
          m.set(userId, Math.max(m.get(userId) ?? 0, r.point_limit));
        }
      }
    }
    if (seats < 2 || seats > 8) continue;
    const inc = metricIncrements({
      total_players: seats,
      human_opponents: r.human_opponents,
      guest_opponents: r.guest_opponents,
      bot_opponents: r.bot_opponents,
      full_room: seats >= 8,
      won: r.won,
      hosted: r.hosted,
      mode: r.mode as "standard" | "tournament" | "training",
    });
    const base = baseline.get(userId)?.get(seats);
    if (base) {
      base.played -= inc.matches;
      base.won -= inc.wins;
      base.hosted -= inc.matches_hosted;
    }
    if ((r.bot_opponents as number) > 0) continue; // human bucket only
    bumpStreak(userId, seats, r.won);
    bumpStreak(userId, null, r.won);
    const a = rawFor(userId, seats);
    a.played += 1;
    if (r.hosted) a.hosted += 1;
    a.setsLocked += r.sets_locked ?? 0;
    if (r.won) {
      a.won += 1;
      if (r.duration_ms != null) {
        a.fastestWinMs =
          a.fastestWinMs == null ? r.duration_ms : Math.min(a.fastestWinMs, r.duration_ms);
      }
    }
  }

  /* ---- Merge baseline + raw into final per-seat values ---- */
  const values = new Map<string, PlayerMatchValues>();
  for (const userId of people.keys()) {
    const bySeats = new Map<number, SeatValues>();
    let allPlayed = 0;
    let allWon = 0;
    let allHosted = 0;
    let allSets = 0;
    let allFastest: number | null = null;
    for (const seats of [2, 3, 4, 5, 6, 7, 8]) {
      const base = baseline.get(userId)?.get(seats) ?? { played: 0, won: 0, hosted: 0 };
      const a = raw.get(userId)?.get(seats) ?? blankRaw();
      const v = {
        won: Math.max(0, base.won) + a.won,
        played: Math.max(0, base.played) + a.played,
        hosted: Math.max(0, base.hosted) + a.hosted,
        setsLocked: a.setsLocked,
        fastestWinMs: a.fastestWinMs,
        bestStreak: streaks.get(userId)?.get(seats)?.best ?? 0,
      };
      bySeats.set(seats, v);
      allPlayed += v.played;
      allWon += v.won;
      allHosted += v.hosted;
      allSets += v.setsLocked;
      if (v.fastestWinMs != null) {
        allFastest = allFastest == null ? v.fastestWinMs : Math.min(allFastest, v.fastestWinMs);
      }
    }
    bySeats.set(0, {
      won: allWon,
      played: allPlayed,
      hosted: allHosted,
      setsLocked: allSets,
      fastestWinMs: allFastest,
      bestStreak: allStreaks.get(userId)?.best ?? 0,
    });
    values.set(userId, { bySeats });
  }

  const streak = new Map<number, Map<string, number>>();
  for (const k of SEAT_KEYS) {
    const m = new Map<string, number>();
    for (const [userId, days] of daysBySeat.get(k)!) {
      m.set(userId, longestDayStreak(days));
    }
    streak.set(k, m);
  }

  return { values, tourneyLimit: limitBySeat, streak };
}

export async function computeLeaderboards(): Promise<LeaderboardsData> {
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("id, display_name, avatar_url")
    .limit(1000);
  const people = new Map(
    (profiles ?? []).map((p) => [
      p.id as string,
      {
        name: (p.display_name as string) || "Player",
        avatarUrl: (p.avatar_url as string | null) ?? null,
      },
    ]),
  );

  const [{ data: challengeRows }, { data: matchRows }, { data: ledger }, { data: activations }] =
    await Promise.all([
      supabaseAdmin
        .from("user_challenges")
        .select("user_id, challenge_id, progress, completed_at")
        .limit(100000),
      supabaseAdmin
        .from("match_stats")
        .select(
          "user_id, total_players, human_opponents, guest_opponents, bot_opponents, hosted, won, mode, duration_ms, sets_locked, point_limit, champion, created_at",
        )
        .limit(100000),
      supabaseAdmin
        .from("purchase_ledger")
        .select("user_id, price")
        .eq("currency", "bimbits")
        .neq("item_id", "admin_gift")
        .limit(100000),
      supabaseAdmin.from("recruit_activations").select("referrer_id").limit(100000),
    ]);

  const { values, tourneyLimit, streak } = await aggregateAllPlayers(
    people,
    (challengeRows ?? []) as never,
    (matchRows ?? []) as never,
  );

  const top = (vals: Map<string, number>, dir: "desc" | "asc" = "desc"): LeaderboardRow[] =>
    [...vals.entries()]
      .filter(([, v]) => v > 0)
      .sort((a, b) =>
        dir === "desc"
          ? b[1] - a[1] || (people.get(a[0])?.name ?? "").localeCompare(people.get(b[0])?.name ?? "")
          : a[1] - b[1] || (people.get(a[0])?.name ?? "").localeCompare(people.get(b[0])?.name ?? ""),
      )
      .slice(0, 10)
      .map(([userId, value]) => ({
        userId,
        name: people.get(userId)?.name ?? "Player",
        avatarUrl: people.get(userId)?.avatarUrl ?? null,
        value,
      }));

  const pick = (fn: (v: SeatValues) => number | null) => {
    const per = new Map<number, Map<string, number>>();
    for (const k of SEAT_KEYS) per.set(k, new Map());
    for (const [userId, pv] of values) {
      for (const k of SEAT_KEYS) {
        const val = fn(pv.bySeats.get(k)!);
        if (val != null) per.get(k)!.set(userId, val);
      }
    }
    return per;
  };
  const seatBoards = (per: Map<number, Map<string, number>>, dir: "desc" | "asc" = "desc") =>
    Object.fromEntries(SEAT_KEYS.map((k) => [k, top(per.get(k)!, dir)]));

  /* ---- Account boards (global) ---- */
  const challengesDone = new Map<string, number>();
  const earned = new Map<string, number>();
  for (const r of challengeRows ?? []) {
    const userId = r.user_id as string;
    if (!people.has(userId)) continue;
    const id = r.challenge_id as string;
    if (id === "recruiter") {
      const recruits = (r.progress as number) ?? 0;
      if (recruits >= 1) challengesDone.set(userId, (challengesDone.get(userId) ?? 0) + 1);
      earned.set(userId, (earned.get(userId) ?? 0) + recruits * 300);
    } else if (id === "complete-tutorial") {
      if (r.completed_at) {
        challengesDone.set(userId, (challengesDone.get(userId) ?? 0) + 1);
        earned.set(userId, (earned.get(userId) ?? 0) + 1);
      }
    } else if (r.completed_at) {
      challengesDone.set(userId, (challengesDone.get(userId) ?? 0) + 1);
      earned.set(userId, (earned.get(userId) ?? 0) + (CHALLENGE_MAP.get(id)?.reward ?? 0));
    }
  }
  const spent = new Map<string, number>();
  for (const r of ledger ?? []) {
    const userId = r.user_id as string;
    if (!people.has(userId)) continue;
    spent.set(userId, (spent.get(userId) ?? 0) + ((r.price as number) ?? 0));
  }

  /* Active referrals: one recruit_activations row per recruit who
     played their first match (the same count the Stats page shows). */
  const referralCounts = new Map<string, number>();
  for (const r of activations ?? []) {
    const referrer = r.referrer_id as string;
    if (!people.has(referrer)) continue;
    referralCounts.set(referrer, (referralCounts.get(referrer) ?? 0) + 1);
  }

  return {
    match: {
      wins: seatBoards(pick((v) => v.won)),
      fastest: seatBoards(pick((v) => v.fastestWinMs), "asc"),
      tourneyLimit: seatBoards(tourneyLimit),
      finished: seatBoards(pick((v) => v.played)),
      /* Win Rate needs a real sample (Ronya's boards, 2026-11-19):
         at least 10 finished matches, so one lucky game cannot top
         the board. Stored as a whole percent. */
      winRate: seatBoards(
        pick((v) => (v.played >= 10 ? Math.round((v.won / v.played) * 100) : null)),
      ),
      winStreak: seatBoards(pick((v) => v.bestStreak)),
      hosted: seatBoards(pick((v) => v.hosted)),
      piles: seatBoards(pick((v) => v.setsLocked)),
    },
    global: {
      challenges: top(challengesDone),
      earned: top(earned),
      spent: top(spent),
      referrals: top(referralCounts),
      /* Streak is global, not per seat (Ronya 2026-11-19): any
         finished game at any seat count keeps the streak going,
         so it ranks on the all-seats day set only. */
      streak: top(streak.get(0)!),
    },
  };
}
