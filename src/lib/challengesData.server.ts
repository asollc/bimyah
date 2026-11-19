import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { CHALLENGES } from "@/lib/challenges";
import type { ChallengeEntry } from "@/lib/rpc/challenges.functions";

/* Server-only challenge progress reader, shared by the challenges
 * functions and the public profile function. Lives in a .server
 * module so client-imported .functions files never drag the admin
 * client into the client bundle (import protection). */
export async function entriesForUser(userId: string): Promise<ChallengeEntry[]> {
  const { data } = await supabaseAdmin
    .from("user_challenges")
    .select("challenge_id, progress, completed_at, seats")
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
      category: def.category,
      seats: row?.seats ?? def.seats,
    };
  });
}
