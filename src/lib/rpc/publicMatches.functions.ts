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
      last_activity_at: new Date().toISOString(),
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
      .update({ seats_taken: data.seats_taken, last_activity_at: new Date().toISOString() })
      .eq("game_id", data.game_id)
      .eq("host_id", userId);
    return { ok: true };
  });

// Activity heartbeat for a public listing. Called periodically by EVERY
// participant in the room (host, players, spectators, including guests, so
// no auth middleware). A room can outlive its original host, so activity
// from anyone keeps the listing up. No row matches for private games, which
// makes this a safe no-op there.
export const touchPublicMatch = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z.object({ game_id: z.string().min(1).max(16) }).parse(input),
  )
  .handler(async ({ data }) => {
    await supabaseAdmin
      .from("public_matches")
      .update({ last_activity_at: new Date().toISOString() })
      .eq("game_id", data.game_id);
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

// Listing liveness (Ronya's rule, 2026-10-21): a listing closes only when
// the room is empty or there has been no activity at all for 5 minutes.
// Games can continue without the original host, so host departure alone
// never closes a listing. Participants heartbeat via touchPublicMatch;
// an empty room generates no heartbeats and expires on the same rule.
const ACTIVITY_TTL_MINUTES = 5;

// Guests can browse public matches without an account, so this endpoint
// intentionally has no auth middleware.
export const listPublicMatches = createServerFn({ method: "GET" })
  .handler(async (): Promise<{ rows: Listing[] }> => {
    const cutoff = new Date(Date.now() - ACTIVITY_TTL_MINUTES * 60 * 1000).toISOString();
    // Best-effort cleanup of inactive rows.
    void supabaseAdmin.from("public_matches").delete().lt("last_activity_at", cutoff);

    const { data: matches, error } = await supabaseAdmin
      .from("public_matches")
      .select("game_id, host_id, host_name, mode, max_seats, seats_taken, created_at, last_activity_at")
      .gte("last_activity_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Response(error.message, { status: 500 });
    // Zombie sweep: a live room heartbeats within a second of opening
    // and every 30s after, so a row whose activity never advanced past
    // creation is a room whose page died on arrival (app killed, tab
    // discarded) — its host is gone and nobody can join a game that is
    // not running. Drop those once they are 90s old instead of letting
    // them squat in the lobby for the full inactivity window.
    const nowMs = Date.now();
    const live = (matches ?? []).filter((m) => {
      const createdMs = new Date(m.created_at).getTime();
      const activityMs = new Date(m.last_activity_at).getTime();
      const neverActive = activityMs - createdMs < 2000;
      const zombie = neverActive && nowMs - createdMs > 90_000;
      if (zombie) {
        void supabaseAdmin.from("public_matches").delete().eq("game_id", m.game_id);
      }
      return !zombie;
    });
    // Defensive dedupe: keep only the most recent listing per host.
    const seen = new Set<string>();
    const rows: Listing[] = [];
    for (const m of live) {
      if (seen.has(m.host_id)) continue;
      seen.add(m.host_id);
      rows.push({
        game_id: m.game_id,
        host_name: m.host_name,
        mode: m.mode,
        max_seats: m.max_seats,
        seats_taken: m.seats_taken ?? 1,
        status: "lobby",
      });
    }
    return { rows };
  });
