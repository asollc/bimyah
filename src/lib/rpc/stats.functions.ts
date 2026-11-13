import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CHALLENGE_MAP, metricIncrements } from "@/lib/challenges";
import { entriesForUser } from "@/lib/challengesData.server";

/* Stats page data (Ronya 2026-11-09). Per seat count (2 to 8) and
   Player/Bot bucket, mirroring the Challenges menus:
     played, hosted, won, guestWins (won as a non-host), tournament
     wins, fastest win, and average match length.
   Two sources are merged so the numbers are all-time, not just
   since the Stats page shipped:
   - Baseline: derived from user_challenges progress. Several
     challenge defs share one metric and increment together, so the
     MAX progress among a metric's defs at a seat count is the true
     historical count for that metric (played, won, hosted,
     tournament wins). Guest wins, fastest win, and durations were
     never tracked historically, so they start from the match_stats
     rows below.
   - match_stats rows: one per finished match since 2026-11-09,
     written by reportMatchForChallenges. Their challenge-metric
     contributions are subtracted from the baseline (they are
     already inside the challenge progress) and their raw counts
     are added, so nothing double counts.
   Bucket rule for raw rows: any bot opponents puts the match in
   the Bot bucket, otherwise Player. Guest matches count here
   (they are real finished games) even though challenges void them.
   Global stats (challenges completed, active referrals, currency
   spent) ignore seats and buckets entirely. */

export type StatBucket = {
  /** 2 to 8 for one table size; 0 is the all-seats total for the
   *  category (streaks and favorite-size math need server totals,
   *  they cannot be summed from per-seat rows). */
  seats: number;
  category: "human" | "bot";
  played: number;
  hosted: number;
  won: number;
  /** Wins in games the player joined but did not host. */
  guestWins: number;
  tournamentWins: number;
  fastestWinMs: number | null;
  avgDurationMs: number | null;
  /** Matches that carried a duration, for weighted All-seats averages. */
  durationCount: number;
  /** Total piles SET across all counted matches (from 2026-11-09). */
  setsLocked: number;
  /** Win streaks from recorded matches (from 2026-11-09). */
  currentStreak: number;
  bestStreak: number;
};

export type MyStats = {
  buckets: StatBucket[];
  global: {
    challengesCompleted: number;
    activeReferrals: number;
    bimbitsSpent: number;
    bimbucksSpent: number;
    bimbitsEarned: number;
  };
};

type Agg = {
  played: number;
  hosted: number;
  won: number;
  guestWins: number;
  tournamentWins: number;
  fastestWinMs: number | null;
  durationTotalMs: number;
  durationCount: number;
  setsLocked: number;
};

const emptyAgg = (): Agg => ({
  played: 0,
  hosted: 0,
  won: 0,
  guestWins: 0,
  tournamentWins: 0,
  fastestWinMs: null,
  durationTotalMs: 0,
  durationCount: 0,
  setsLocked: 0,
});

async function computeStats(userId: string): Promise<MyStats> {
    const keyOf = (seats: number, category: "human" | "bot") => `${seats}|${category}`;

    /* ---- Baseline from challenge progress (max per metric) ---- */
    const entries = await entriesForUser(userId);
    const maxProg = new Map<string, number>();
    for (const e of entries) {
      const def = CHALLENGE_MAP.get(e.id);
      if (!def) continue;
      const k = `${def.metric}|${def.category}|${def.seats}`;
      maxProg.set(k, Math.max(maxProg.get(k) ?? 0, e.progress));
    }
    const baseline = new Map<string, Agg>();
    const baseFor = (seats: number, category: "human" | "bot") => {
      const k = keyOf(seats, category);
      if (!baseline.has(k)) baseline.set(k, emptyAgg());
      return baseline.get(k)!;
    };
    for (const seats of [2, 3, 4, 5, 6, 7, 8]) {
      const h = baseFor(seats, "human");
      h.played = maxProg.get(`matches|human|${seats}`) ?? 0;
      h.won = Math.max(
        maxProg.get(`wins|human|${seats}`) ?? 0,
        maxProg.get(`wins_vs_humans|human|${seats}`) ?? 0,
      );
      h.hosted = maxProg.get(`matches_hosted|human|${seats}`) ?? 0;
      h.tournamentWins = maxProg.get(`wins_tournament|human|${seats}`) ?? 0;
      const b = baseFor(seats, "bot");
      b.played = maxProg.get(`matches_vs_bots|bot|${seats}`) ?? 0;
      b.won = maxProg.get(`wins_vs_bots|bot|${seats}`) ?? 0;
      b.tournamentWins = maxProg.get(`wins_tournament_bots|bot|${seats}`) ?? 0;
    }

    /* ---- Raw match rows: subtract challenge overlap, add raw ---- */
    const { data: rows } = await supabaseAdmin
      .from("match_stats")
      .select(
        "total_players, human_opponents, guest_opponents, bot_opponents, hosted, won, mode, duration_ms, sets_locked",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: true })
      .limit(10000);
    const raw = new Map<string, Agg>();
    const rawFor = (seats: number, category: "human" | "bot") => {
      const k = keyOf(seats, category);
      if (!raw.has(k)) raw.set(k, emptyAgg());
      return raw.get(k)!;
    };
    // Win streaks run in match order, per seat bucket and per
    // category (the all-seats streak cannot be derived from the
    // per-seat ones, so both are tracked).
    const streaks = new Map<string, { cur: number; best: number }>();
    const bumpStreak = (k: string, won: boolean) => {
      const s = streaks.get(k) ?? { cur: 0, best: 0 };
      s.cur = won ? s.cur + 1 : 0;
      s.best = Math.max(s.best, s.cur);
      streaks.set(k, s);
    };
    for (const r of rows ?? []) {
      const seats = r.total_players as number;
      if (seats < 2 || seats > 8) continue;
      const category = (r.bot_opponents as number) > 0 ? "bot" : "human";
      const a = rawFor(seats, category);
      a.played += 1;
      a.setsLocked += (r.sets_locked as number) ?? 0;
      bumpStreak(keyOf(seats, category), r.won as boolean);
      bumpStreak(`all|${category}`, r.won as boolean);
      if (r.hosted) a.hosted += 1;
      if (r.won) {
        a.won += 1;
        if (!r.hosted) a.guestWins += 1;
        if (r.mode === "tournament") a.tournamentWins += 1;
        if (r.duration_ms != null) {
          a.fastestWinMs =
            a.fastestWinMs == null
              ? (r.duration_ms as number)
              : Math.min(a.fastestWinMs, r.duration_ms as number);
        }
      }
      if (r.duration_ms != null) {
        a.durationTotalMs += r.duration_ms as number;
        a.durationCount += 1;
      }
      // Remove this match's challenge-metric contributions from the
      // baseline: they are already counted in the raw numbers above.
      const inc = metricIncrements({
        total_players: seats,
        human_opponents: r.human_opponents as number,
        guest_opponents: r.guest_opponents as number,
        bot_opponents: r.bot_opponents as number,
        full_room: seats >= 8,
        won: r.won as boolean,
        hosted: r.hosted as boolean,
        mode: r.mode as "standard" | "tournament" | "training",
      });
      const bh = baseFor(seats, "human");
      bh.played -= inc.matches;
      bh.won -= inc.wins;
      bh.hosted -= inc.matches_hosted;
      bh.tournamentWins -= inc.wins_tournament;
      const bb = baseFor(seats, "bot");
      bb.played -= inc.matches_vs_bots;
      bb.won -= inc.wins_vs_bots;
      bb.tournamentWins -= inc.wins_tournament_bots;
    }

    const buckets: StatBucket[] = [];
    for (const seats of [2, 3, 4, 5, 6, 7, 8]) {
      for (const category of ["human", "bot"] as const) {
        const b = baseFor(seats, category);
        const a = rawFor(seats, category);
        const durationCount = a.durationCount;
        const s = streaks.get(keyOf(seats, category)) ?? { cur: 0, best: 0 };
        buckets.push({
          seats,
          category,
          played: Math.max(0, b.played) + a.played,
          hosted: Math.max(0, b.hosted) + a.hosted,
          won: Math.max(0, b.won) + a.won,
          guestWins: a.guestWins,
          tournamentWins: Math.max(0, b.tournamentWins) + a.tournamentWins,
          fastestWinMs: a.fastestWinMs,
          avgDurationMs:
            durationCount > 0 ? Math.round(a.durationTotalMs / durationCount) : null,
          durationCount,
          setsLocked: a.setsLocked,
          currentStreak: s.cur,
          bestStreak: s.best,
        });
      }
    }
    // All-seats totals per category (seats 0): counts sum from the
    // seat buckets; streaks come from the category-level run above.
    for (const category of ["human", "bot"] as const) {
      const parts = buckets.filter((x) => x.category === category);
      const durationCount = parts.reduce((sum, x) => sum + x.durationCount, 0);
      const durationWeighted = parts.reduce(
        (sum, x) => sum + (x.avgDurationMs ?? 0) * x.durationCount,
        0,
      );
      const fastest = parts.reduce<number | null>(
        (acc, x) =>
          x.fastestWinMs == null ? acc : acc == null ? x.fastestWinMs : Math.min(acc, x.fastestWinMs),
        null,
      );
      const s = streaks.get(`all|${category}`) ?? { cur: 0, best: 0 };
      buckets.push({
        seats: 0,
        category,
        played: parts.reduce((sum, x) => sum + x.played, 0),
        hosted: parts.reduce((sum, x) => sum + x.hosted, 0),
        won: parts.reduce((sum, x) => sum + x.won, 0),
        guestWins: parts.reduce((sum, x) => sum + x.guestWins, 0),
        tournamentWins: parts.reduce((sum, x) => sum + x.tournamentWins, 0),
        fastestWinMs: fastest,
        avgDurationMs: durationCount > 0 ? Math.round(durationWeighted / durationCount) : null,
        durationCount,
        setsLocked: parts.reduce((sum, x) => sum + x.setsLocked, 0),
        currentStreak: s.cur,
        bestStreak: s.best,
      });
    }

    /* ---- Global stats (all seats, all buckets) ---- */
    const { data: rcRow } = await supabaseAdmin
      .from("user_challenges")
      .select("progress")
      .eq("user_id", userId)
      .eq("challenge_id", "recruiter")
      .maybeSingle();
    const recruits = rcRow?.progress ?? 0;
    const challengesCompleted =
      entries.filter((e) => e.completed_at).length + (recruits >= 1 ? 1 : 0);
    const bimbitsEarned =
      entries.reduce((sum, e) => sum + (e.completed_at ? e.reward : 0), 0) +
      recruits * 300;

    const { count: activeReferrals } = await supabaseAdmin
      .from("recruit_activations")
      .select("id", { count: "exact", head: true })
      .eq("referrer_id", userId);

    const { data: ledger } = await supabaseAdmin
      .from("purchase_ledger")
      .select("currency, price")
      .eq("user_id", userId)
      .neq("item_id", "admin_gift")
      .limit(10000);
    let bimbitsSpent = 0;
    let bimbucksSpent = 0;
    for (const r of ledger ?? []) {
      if (r.currency === "bimbits") bimbitsSpent += r.price as number;
      else if (r.currency === "bimbucks") bimbucksSpent += r.price as number;
    }

    return {
      buckets,
      global: {
        challengesCompleted,
        activeReferrals: activeReferrals ?? recruits,
        bimbitsSpent,
        bimbucksSpent,
        bimbitsEarned,
      },
    };
}

export const getMyStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => computeStats(context.userId));

/* Public profile view (Ronya 2026-11-09): the same stats are
   viewable on a player's public profile, so this mirrors
   getPublicProfile: no auth middleware (guests can view), and it
   only ever reads the whitelisted stat aggregates for the given
   user. */
const publicStatsSchema = z.object({ userId: z.string().uuid() });

export const getPublicStats = createServerFn({ method: "POST" })
  .inputValidator((d) => publicStatsSchema.parse(d))
  .handler(async ({ data }) => computeStats(data.userId));
