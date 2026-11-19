import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeStats } from "@/lib/statsData.server";

export type { MyStats, StatBucket } from "@/lib/statsData.server";

/* Stats page data (Ronya 2026-11-09): the aggregation itself lives in
   lib/statsData.server.ts (computeStats) so the Leaderboards can rank
   every player on the exact same numbers. */

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
