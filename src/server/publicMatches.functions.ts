import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const createSchema = z.object({
  game_id: z.string().min(1).max(16),
  host_name: z.string().min(1).max(32),
  mode: z.string().min(1).max(32),
  max_seats: z.number().int().min(2).max(8),
});

export const createPublicMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { error } = await supabaseAdmin.from("public_matches").upsert({
      game_id: data.game_id,
      host_id: userId,
      host_name: data.host_name,
      mode: data.mode,
      max_seats: data.max_seats,
    });
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });

export const removePublicMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ game_id: z.string().min(1).max(16) }).parse(input))
  .handler(async ({ data }) => {
    await supabaseAdmin.from("public_matches").delete().eq("game_id", data.game_id);
    return { ok: true };
  });

type Listing = {
  game_id: string;
  host_name: string;
  mode: string;
  max_seats: number;
  seats_taken: number;
  status: string;
};

export const listPublicMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ rows: Listing[] }> => {
    const { data: matches } = await supabaseAdmin
      .from("public_matches")
      .select("game_id, host_name, mode, max_seats, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (!matches || matches.length === 0) return { rows: [] };
    const ids = matches.map((m) => m.game_id);
    const { data: games } = await supabaseAdmin
      .from("games")
      .select("id, status, state")
      .in("id", ids);
    const byId = new Map((games ?? []).map((g) => [g.id, g]));
    const staleIds: string[] = [];
    const rows: Listing[] = [];
    for (const m of matches) {
      const g = byId.get(m.game_id);
      if (!g) {
        staleIds.push(m.game_id);
        continue;
      }
      if (g.status !== "lobby") {
        staleIds.push(m.game_id);
        continue;
      }
      const state = g.state as { players?: unknown[] } | null;
      const seats_taken = Array.isArray(state?.players) ? state!.players!.length : 0;
      rows.push({
        game_id: m.game_id,
        host_name: m.host_name,
        mode: m.mode,
        max_seats: m.max_seats,
        seats_taken,
        status: g.status,
      });
    }
    // Best-effort cleanup of stale rows (started or removed games).
    if (staleIds.length > 0) {
      void supabaseAdmin.from("public_matches").delete().in("game_id", staleIds);
    }
    return { rows };
  });
