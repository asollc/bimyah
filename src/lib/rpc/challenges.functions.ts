import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CHALLENGES, metricIncrements, type ChallengeCategory } from "@/lib/challenges";
import { entriesForUser } from "@/lib/challengesData.server";

async function assertAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Response("Forbidden", { status: 403 });
}

export type ChallengeEntry = {
  id: string;
  name: string;
  description: string;
  target: number;
  reward: number;
  progress: number;
  completed_at: string | null;
  category: ChallengeCategory;
  /** Seat sub category (2 to 8) the challenge belongs to. */
  seats: number;
};

/* ---------- Report a finished match (called by each human client) ---------- */
const reportSchema = z.object({
  game_code: z.string().min(1).max(64),
  match_number: z.number().int().min(1).max(10000),
  total_players: z.number().int().min(1).max(8),
  human_opponents: z.number().int().min(0).max(7),
  guest_opponents: z.number().int().min(0).max(7).optional().default(0),
  bot_opponents: z.number().int().min(0).max(7),
  full_room: z.boolean(),
  won: z.boolean(),
  hosted: z.boolean(),
  mode: z.enum(["standard", "tournament", "training"]),
  /** Match length in ms (Stats page fastest win / average length,
   *  Ronya 2026-11-09). Measured on the reporting client from the
   *  start of play to the win; optional so older clients still
   *  report. */
  duration_ms: z.number().int().min(0).max(7_200_000).optional().nullable().default(null),
  /** Piles the player had SET when the match ended (Stats page
   *  sets locked, Ronya 2026-11-09). Optional for older clients. */
  sets_locked: z.number().int().min(0).max(24).optional().default(0),
});

export const reportMatchForChallenges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => reportSchema.parse(d))
  .handler(async ({ context, data }) => {
    const userId = context.userId;

    // Dedupe: a match counts once per player, however many times the
    // client fires (win effect re-runs, reconnects, Play Again races).
    const { error: dedupeErr } = await supabaseAdmin
      .from("challenge_match_reports")
      .insert({
        user_id: userId,
        game_code: data.game_code,
        match_number: data.match_number,
      });
    if (dedupeErr) {
      // 23505 = unique violation: already reported, nothing to do.
      if ((dedupeErr as { code?: string }).code === "23505") {
        return { duplicate: true, completed: [] as { id: string; name: string; reward: number }[], bimbits_earned: 0, recruiter_activated: false };
      }
      throw new Error(dedupeErr.message);
    }

    // Stats page (Ronya 2026-11-09): record the raw match behind the
    // same dedupe gate, so a match lands in match_stats exactly when
    // it counts for challenges. getMyStats merges these rows with
    // the historical challenge-progress baseline. A stats write must
    // never break challenge reporting, so failures are swallowed.
    try {
      await supabaseAdmin.from("match_stats").insert({
        user_id: userId,
        game_code: data.game_code,
        match_number: data.match_number,
        total_players: data.total_players,
        human_opponents: data.human_opponents,
        guest_opponents: data.guest_opponents,
        bot_opponents: data.bot_opponents,
        hosted: data.hosted,
        won: data.won,
        mode: data.mode,
        duration_ms: data.duration_ms ?? null,
        sets_locked: data.sets_locked ?? 0,
      });
    } catch {
      /* non-fatal: stats never block the game */
    }

    const increments = metricIncrements(data);
    const { data: existing } = await supabaseAdmin
      .from("user_challenges")
      .select("challenge_id, progress, completed_at, awarded, seats")
      .eq("user_id", userId);
    const byId = new Map((existing ?? []).map((r) => [r.challenge_id, r]));

    const completed: { id: string; name: string; reward: number }[] = [];
    let bimbits_earned = 0;

    for (const def of CHALLENGES) {
      // The unique First Match is completed separately below.
      if (def.id === "first-match") continue;
      // Seat sub categories (Ronya 2026-11-02): a match only counts
      // toward challenges for its exact player count.
      if (def.seats !== data.total_players) continue;
      const inc = increments[def.metric];
      if (!inc) continue;
      const row = byId.get(def.id);
      const progress = (row?.progress ?? 0) + inc;
      const alreadyCompleted = !!row?.completed_at;
      const nowCompleted = !alreadyCompleted && progress >= def.target;
      const { error: upErr } = await supabaseAdmin.from("user_challenges").upsert(
        {
          user_id: userId,
          challenge_id: def.id,
          progress,
          completed_at: nowCompleted ? new Date().toISOString() : (row?.completed_at ?? null),
          awarded: nowCompleted ? true : (row?.awarded ?? false),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,challenge_id" },
      );
      if (upErr) throw new Error(upErr.message);
      if (nowCompleted) {
        const { error: creditErr } = await supabaseAdmin.rpc("credit_bimbits", {
          _user_id: userId,
          _amount: def.reward,
        });
        if (creditErr) throw new Error(creditErr.message);
        completed.push({ id: def.id, name: def.name, reward: def.reward });
        bimbits_earned += def.reward;
      }
    }

    // The unique First Match (Ronya 2026-11-02): the first match a
    // player ever plays completes it, whatever kind of match it was,
    // and it exists only in that match's seat sub category, so the
    // size is recorded on the row. Players who somehow reach a report
    // without it completed (for example they only played bot matches
    // while it was a metric challenge) complete it on this match
    // instead, so everyone ends up with exactly one.
    const fmDef = CHALLENGES.find((c) => c.id === "first-match");
    const fmRow = byId.get("first-match");
    if (fmDef && !fmRow?.completed_at) {
      const { error: fmErr } = await supabaseAdmin.from("user_challenges").upsert(
        {
          user_id: userId,
          challenge_id: "first-match",
          progress: 1,
          completed_at: new Date().toISOString(),
          awarded: true,
          seats: data.total_players,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,challenge_id" },
      );
      if (fmErr) throw new Error(fmErr.message);
      const { error: fmCreditErr } = await supabaseAdmin.rpc("credit_bimbits", {
        _user_id: userId,
        _amount: fmDef.reward,
      });
      if (fmCreditErr) throw new Error(fmCreditErr.message);
      completed.push({ id: fmDef.id, name: fmDef.name, reward: fmDef.reward });
      bimbits_earned += fmDef.reward;
    }

    // Recruiter activation (Ronya 2026-11-03): the reporting player is
    // a recruit. They become an ACTIVE recruit the first time they
    // complete a real (non-training) match with at least one other
    // human player, at any seat count. The reporter is always a
    // registered account (this function requires auth), which covers
    // the "registered with an email" requirement. On activation the
    // sponsor earns 300 Bimbits and one Recruiter level: the level is
    // the progress of their 'recruiter' user_challenges row, so level
    // N always means N active recruits, and each next level needs one
    // more recruit than the last. recruit_activations is unique on
    // referred_id, so this can only ever fire once per recruit.
    let recruiter_activated = false;
    const otherHumans = data.total_players - 1 - data.bot_opponents;
    if (otherHumans >= 1 && data.mode !== "training") {
      try {
        const { data: ref } = await supabaseAdmin
          .from("referrals")
          .select("referrer_id")
          .eq("referred_id", userId)
          .maybeSingle();
        if (ref) {
          const { error: actErr } = await supabaseAdmin
            .from("recruit_activations")
            .insert({
              referrer_id: ref.referrer_id,
              referred_id: userId,
              game_code: data.game_code,
              match_number: data.match_number,
            });
          if (!actErr) {
            const { error: recCreditErr } = await supabaseAdmin.rpc("credit_bimbits", {
              _user_id: ref.referrer_id,
              _amount: 300,
            });
            if (recCreditErr) throw new Error(recCreditErr.message);
            const { data: rcRow } = await supabaseAdmin
              .from("user_challenges")
              .select("progress")
              .eq("user_id", ref.referrer_id)
              .eq("challenge_id", "recruiter")
              .maybeSingle();
            const { error: rcErr } = await supabaseAdmin.from("user_challenges").upsert(
              {
                user_id: ref.referrer_id,
                challenge_id: "recruiter",
                progress: (rcRow?.progress ?? 0) + 1,
                completed_at: null,
                awarded: false,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "user_id,challenge_id" },
            );
            if (rcErr) throw new Error(rcErr.message);
            recruiter_activated = true;
          }
          // A 23505 here just means the recruit already activated on an
          // earlier match; nothing to pay out again.
        }
      } catch {
        // Recruiter bookkeeping must never break match reporting. The
        // activation row is the source of truth: if the credit failed
        // after the row landed, the recruit still counts as activated
        // exactly once rather than paying out twice.
      }
    }

    return { duplicate: false, completed, bimbits_earned, recruiter_activated };
  });

/* ---------- My challenges (profile page) ---------- */
export const getMyChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const entries = await entriesForUser(context.userId);
    // Recruiter (Ronya 2026-11-03): progress is the count of active
    // recruits, which is also the sponsor's Recruiter level. It does
    // not live in the CHALLENGES catalog because it has no seat count:
    // any table size qualifies.
    const { data: rcRow } = await supabaseAdmin
      .from("user_challenges")
      .select("progress")
      .eq("user_id", context.userId)
      .eq("challenge_id", "recruiter")
      .maybeSingle();
    return {
      entries,
      recruiter: { recruits: rcRow?.progress ?? 0, reward_per_recruit: 300 },
    };
  });

/* ---------- Admin: a member's challenges (admin user profile view) ---------- */
const adminUserSchema = z.object({ user_id: z.string().uuid() });

export const getAdminUserChallenges = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => adminUserSchema.parse(d))
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    return { entries: await entriesForUser(data.user_id) };
  });
