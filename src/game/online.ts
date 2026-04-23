import { supabase } from "@/integrations/supabase/client";
import type { GameState } from "@/game/types";

const TABLE = "games";

function shortId() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

export async function createOnlineGame(state: GameState, hostId: string): Promise<string> {
  const id = shortId();
  const stateWithId = { ...state, id };
  await supabase.from(TABLE).insert({
    id,
    host_id: hostId,
    status: state.status,
    // jsonb column accepts plain object
    state: stateWithId as unknown as Record<string, unknown>,
  });
  return id;
}

export async function pushOnlineGame(state: GameState): Promise<void> {
  await supabase
    .from(TABLE)
    .update({
      status: state.status,
      state: state as unknown as Record<string, unknown>,
      updated_at: new Date().toISOString(),
    })
    .eq("id", state.id);
}

export async function fetchOnlineGame(id: string): Promise<GameState | null> {
  const { data } = await supabase.from(TABLE).select("state").eq("id", id).maybeSingle();
  if (!data) return null;
  return data.state as unknown as GameState;
}

export function subscribeOnlineGame(
  id: string,
  onState: (s: GameState) => void,
): () => void {
  const channel = supabase
    .channel(`game-${id}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE, filter: `id=eq.${id}` },
      (payload) => {
        const row = payload.new as { state?: unknown } | undefined;
        if (row?.state) onState(row.state as GameState);
      },
    )
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
