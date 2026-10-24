// POST /api/discord/game
// Proxy for Discord Activity game operations.
// Discord's iframe blocks direct Supabase requests, so the client
// talks to us and we talk to Supabase server-side.
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars");
  return createClient(url, key);
}

export const Route = createFileRoute("/api/discord/game")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = await request.json();
          const { action } = body;
          const supabase = getSupabase();

          if (action === "create") {
            const { code, state } = body;
            const { error } = await supabase
              .from("discord_games")
              .insert({ code, state });
            if (error) throw error;
            // Also list in public_matches for cross-play visibility
            // (host_id is null for Discord guest hosts)
            try {
              await supabase.from("public_matches").insert({
                game_id: code,
                host_id: null,
                host_name: state.hostName || "Discord Host",
                mode: state.mode || "standard",
                max_seats: state.maxSeats || 4,
                seats_taken: 1,
              });
            } catch {
              /* public listing is best-effort */
            }
            return Response.json({ ok: true });
          }

          if (action === "get") {
            const { code } = body;
            const { data, error } = await supabase
              .from("discord_games")
              .select("state")
              .eq("code", code)
              .single();
            if (error) throw error;
            return Response.json({ ok: true, state: data.state });
          }

          if (action === "update") {
            const { code, state } = body;
            const { error } = await supabase
              .from("discord_games")
              .update({ state, updated_at: new Date().toISOString() })
              .eq("code", code);
            if (error) throw error;
            return Response.json({ ok: true });
          }

          if (action === "sendIntent") {
            const { code, intent } = body;
            const { error } = await supabase
              .from("discord_intents")
              .insert({ code, intent });
            if (error) throw error;
            return Response.json({ ok: true });
          }

          if (action === "getIntents") {
            const { code, afterId } = body;
            const { data, error } = await supabase
              .from("discord_intents")
              .select("id, intent")
              .eq("code", code)
              .gt("id", afterId || 0)
              .order("id", { ascending: true })
              .limit(50);
            if (error) throw error;
            // Clean up fetched intents
            if (data && data.length > 0) {
              const maxId = Math.max(...data.map((r) => r.id));
              await supabase
                .from("discord_intents")
                .delete()
                .eq("code", code)
                .lte("id", maxId);
            }
            return Response.json({ ok: true, intents: data || [] });
          }

          if (action === "destroy") {
            const { code } = body;
            await supabase.from("discord_games").delete().eq("code", code);
            await supabase.from("discord_intents").delete().eq("code", code);
            await supabase.from("public_matches").delete().eq("game_id", code);
            return Response.json({ ok: true });
          }

          return Response.json({ ok: false, error: "Unknown action" }, { status: 400 });
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          return Response.json({ ok: false, error: msg }, { status: 500 });
        }
      },
    },
  },
});
