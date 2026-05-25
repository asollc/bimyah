import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const createSchema = z.object({
  game_id: z.string().min(1).max(16),
  host_name: z.string().min(1).max(32),
  mode: z.string().min(1).max(32),
  max_seats: z.number().int().min(2).max(8),
  seats_taken: z.number().int().min(1).max(8).optional(),
});

export const createPublicMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    // Ensure each host has only one active public listing — remove any prior
    // rooms they hosted before inserting the new one.
    await supabaseAdmin
      .from("public_matches")
      .delete()
      .eq("host_id", userId)
      .neq("game_id", data.game_id);
    const { error } = await supabaseAdmin.from("public_matches").upsert({
      game_id: data.game_id,
      host_id: userId,
      host_name: data.host_name,
      mode: data.mode,
      max_seats: data.max_seats,
      seats_taken: data.seats_taken ?? 1,
    });
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });

export const updatePublicMatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        game_id: z.string().min(1).max(16),
        seats_taken: z.number().int().min(1).max(8),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    await supabaseAdmin
      .from("public_matches")
      .update({ seats_taken: data.seats_taken })
      .eq("game_id", data.game_id)
      .eq("host_id", userId);
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

// Listings auto-expire after this many hours since creation. Hosts that leave
// the lobby cleanly will call removePublicMatch; this TTL guards against
// abandoned/crashed hosts so the listing page doesn't fill with dead rooms.
const TTL_HOURS = 4;

export const listPublicMatches = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<{ rows: Listing[] }> => {
    const cutoff = new Date(Date.now() - TTL_HOURS * 60 * 60 * 1000).toISOString();
    // Best-effort cleanup of expired rows.
    void supabaseAdmin.from("public_matches").delete().lt("created_at", cutoff);

    const { data: matches, error } = await supabaseAdmin
      .from("public_matches")
      .select("game_id, host_name, mode, max_seats, seats_taken, created_at")
      .gte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Response(error.message, { status: 500 });
    const rows: Listing[] = (matches ?? []).map((m) => ({
      game_id: m.game_id,
      host_name: m.host_name,
      mode: m.mode,
      max_seats: m.max_seats,
      seats_taken: m.seats_taken ?? 1,
      status: "lobby",
    }));
    return { rows };
  });
