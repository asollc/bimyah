import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CHALLENGES, metricIncrements } from "@/lib/challenges";

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
};

async function entriesForUser(userId: string): Promise<ChallengeEntry[]> {
  const { data } = await supabaseAdmin
    .from("user_challenges")
    .select("challenge_id, progress, completed_at")
    .eq("user_id", userId);
  const byId = new Map((data ?? []).map((r) => [r.challenge_id, r]));
  return CHALLENGES.map((def) => {
    const row = byId.get(def.id);
    return {
      id: def.id,
      name: def.name,
      description: def.description,
      target: def.target,
      reward: def.reward,
      progress: row?.progress ?? 0,
      completed_at: row?.completed_at ?? null,
    };
  });
}

/* ---------- Report a finished match (called by each human client) ---------- */
const reportSchema = z.object({
  game_code: z.string().min(1).max(64),
  match_number: z.number().int().min(1).max(10000),
  total_players: z.number().int().min(1).max(8),
  human_opponents: z.number().int().min(0).max(7),
  bot_opponents: z.number().int().min(0).max(7),
  full_room: z.boolean(),
  won: z.boolean(),
  hosted: z.boolean(),
  mode: z.enum(["standard", "tournament", "training"]),
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
        return { duplicate: true, completed: [] as { id: string; name: string; reward: number }[], bimbits_earned: 0 };
      }
      throw new Error(dedupeErr.message);
    }

    const increments = metricIncrements(data);
    const { data: existing } = await supabaseAdmin
      .from("user_challenges")
      .select("challenge_id, progress, completed_at, awarded")
      .eq("user_id", userId);
    const byId = new Map((existing ?? []).map((r) => [r.challenge_id, r]));

    const completed: { id: string; name: string; reward: number }[] = [];
    let bimbits_earned = 0;

    for (const def of CHALLENGES) {
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

    return { duplicate: false, completed, bimbits_earned };
  });

/* ---------- My challenges (profile page) ---------- */
export const getMyChallenges = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    return { entries: await entriesForUser(context.userId) };
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
