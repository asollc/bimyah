// Discord polling fallback for game sessions.
// Uses our API proxy (playbimyah.com) instead of direct Supabase,
// because Discord's iframe blocks requests to supabase.co.
import type { GameState } from "./types";
import { secureNumericCode } from "@/lib/secureId";

export type Intent = {
  kind: string;
  [key: string]: unknown;
};

export type PeerSession = {
  meId: string;
  code: string;
  isHost: boolean;
  subscribe: (cb: (s: GameState) => void) => () => void;
  getState: () => GameState;
  setState: (mutator: (s: GameState) => GameState) => void;
  sendIntent: (intent: Intent) => void;
  connectionCount: () => number;
  reconnect: () => void;
  isConnected: () => boolean;
  destroy: () => void;
};

const POLL_STATE_MS = 1000;
const POLL_INTENT_MS = 500;

function fourDigitCode(): string {
  return secureNumericCode(4);
}

async function api(action: string, params: Record<string, unknown>) {
  const res = await fetch("/api/discord/game", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...params }),
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "API failed");
  return json;
}

export async function hostGamePolling(
  initialState: GameState,
  hostId: string,
): Promise<PeerSession> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = fourDigitCode();
    try {
      return await tryHostPolling(code, initialState, hostId);
    } catch (err) {
      if (attempt === 4) throw err;
    }
  }
  throw new Error("Failed to host game");
}

async function tryHostPolling(
  code: string,
  initialState: GameState,
  hostId: string,
): Promise<PeerSession> {
  let state: GameState = { ...initialState, id: code };
  const listeners = new Set<(s: GameState) => void>();
  let destroyed = false;
  let lastIntentId = 0;

  // Write initial state via proxy
  await api("create", { code, state });

  function notifyLocal() {
    for (const cb of listeners) cb(state);
  }

  async function writeState() {
    if (destroyed) return;
    try {
      await api("update", { code, state });
    } catch {
      /* write failed, retry next time */
    }
  }

  async function pollIntents() {
    if (destroyed) return;
    try {
      const json = await api("getIntents", { code, afterId: lastIntentId });
      const intents = json.intents || [];
      if (intents.length === 0) return;
      // Dynamically import applyIntent to avoid circular dependency
      const { applyIntent } = await import("./realtime");
      for (const row of intents) {
        lastIntentId = Math.max(lastIntentId, row.id);
        const intent = row.intent as unknown as import("./realtime").Intent;
        const next = applyIntent(state, intent);
        if (next !== state) {
          state = next;
        }
      }
      notifyLocal();
      await writeState();
    } catch {
      /* poll failed, retry next interval */
    }
  }

  const intentTimer = setInterval(pollIntents, POLL_INTENT_MS);

  // Notify immediately with initial state
  setTimeout(() => notifyLocal(), 0);

  const session: PeerSession = {
    meId: hostId,
    code,
    isHost: true,
    subscribe: (cb) => {
      listeners.add(cb);
      cb(state);
      return () => listeners.delete(cb);
    },
    getState: () => state,
    setState: (mutator) => {
      const next = mutator(state);
      if (next === state) return;
      state = next;
      notifyLocal();
      void writeState();
    },
    sendIntent: (intent) => {
      // Host applies intents directly
      notifyLocal();
    },
    connectionCount: () => 1,
    reconnect: () => {},
    isConnected: () => !destroyed,
    destroy: () => {
      destroyed = true;
      clearInterval(intentTimer);
      listeners.clear();
      void api("destroy", { code }).catch(() => {});
    },
  };

  return session;
}

export async function joinGamePolling(
  code: string,
  myId: string,
  myName: string,
): Promise<PeerSession> {
  const listeners = new Set<(s: GameState) => void>();
  let destroyed = false;

  // Fetch initial state via proxy
  let state: GameState;
  try {
    const json = await api("get", { code });
    state = json.state as GameState;
  } catch {
    throw new Error("Game not found");
  }

  function notifyLocal() {
    if (state) for (const cb of listeners) cb(state);
  }

  async function pollState() {
    if (destroyed) return;
    try {
      const json = await api("get", { code });
      const newState = json.state as GameState;
      // Simple change detection via JSON
      if (JSON.stringify(newState) !== JSON.stringify(state)) {
        state = newState;
        notifyLocal();
      }
    } catch {
      /* poll failed, retry next interval */
    }
  }

  const stateTimer = setInterval(pollState, POLL_STATE_MS);
  setTimeout(() => notifyLocal(), 0);

  const session: PeerSession = {
    meId: myId,
    code,
    isHost: false,
    subscribe: (cb) => {
      listeners.add(cb);
      if (state) cb(state);
      return () => listeners.delete(cb);
    },
    getState: () => state!,
    setState: () => {
      throw new Error("Only host can set state");
    },
    sendIntent: (intent) => {
      void api("sendIntent", {
        code,
        intent: { ...intent, playerId: myId, playerName: myName },
      }).catch(() => {});
    },
    connectionCount: () => 1,
    reconnect: () => {},
    isConnected: () => !destroyed,
    destroy: () => {
      destroyed = true;
      clearInterval(stateTimer);
      listeners.clear();
    },
  };

  return session;
}
