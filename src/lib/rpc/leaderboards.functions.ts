import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeLeaderboards } from "@/lib/leaderboardData.server";

export type { LeaderboardRow, LeaderboardsData } from "@/lib/leaderboardData.server";

/* Leaderboards (Ronya 2026-11-19): top 10 per board, shown in the
   profile's icon row next to Challenges and Stats. The aggregation
   itself lives in lib/leaderboardData.server.ts (bulk fetches, the
   Stats merge math replayed in memory) so a board load is a handful
   of database calls, not one Stats computation per player. */
export const getLeaderboards = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => computeLeaderboards());
