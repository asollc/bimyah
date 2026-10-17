import { supabase } from "@/integrations/supabase/client";
import type { GameState, Player } from "./types";
import { secureNumericCode } from "@/lib/secureId";

import {
  closePile,
  declareBimyah,
  declareSet,
  holdCenterCard,
  holdFreeCard,
  markActive,
  markDisconnected,
  markReconnected,
  newTournament,
  nextMatch,
  openPile,
  PLAYER_COLORS,
  resetToLobby,
  setReady,
  setReadyForNext,
  swapCard,
  swapFreeCard,
} from "./engine";

/**
 * Supabase Realtime multiplayer (replaces PeerJS P2P).
 *
 * Architecture (same as P2P, different transport):
 * - Host owns the authoritative GameState. Only the host mutates it.
 * - Joiners send named intents to the host via Realtime Broadcast;
 *   the host applies them and broadcasts the new state.
 * - Channel name: `game:${code}` (4-digit code).
 * - Uses Broadcast (ephemeral) for intents/state, Presence for liveness.
 */

export const MAX_SPECTATORS = 20;

export type Intent =
  | { kind: "addPlayer"; player: Player }
  | { kind: "addBot" }
  | { kind: "removeBot" }
  | { kind: "ready"; playerId: string; ready: boolean }
  | { kind: "openPile"; playerId: string; stackIndex: number }
  | { kind: "closePile"; playerId: string }
  | { kind: "holdCenter"; playerId: string; centerIndex: number }
  | { kind: "swap"; playerId: string; cardId: string }
  | { kind: "holdFreeCard"; viewerId: string; ownerId: string; pileIndex: number; cardId: string }
  | { kind: "swapFreeCard"; viewerId: string; cardId: string }
  | { kind: "declareSet"; playerId: string }
  | { kind: "declareBimyah"; playerId: string }
  | { kind: "playAgain" }
  | { kind: "nextMatch" }
  | { kind: "newTournament"; pointLimit: number | null }
  | { kind: "readyForNext"; playerId: string; ready: boolean }
  | { kind: "ping"; playerId: string }
  | {
      kind: "emblemLayout";
      playerId: string;
      slot: 1 | 2;
      layout: { dx: number; dy: number; s: number };
    }
  | { kind: "markDisconnected"; playerId: string }
  | { kind: "markReconnected"; playerId: string }
  | { kind: "addSpectator"; spectator: { id: string; name: string; avatarUrl?: string | null } }
  | { kind: "removeSpectator"; spectatorId: string }
  | { kind: "chat"; message: import("./types").ChatMessage }
  | { kind: "replaceState"; state: GameState };

export function applyIntent(state: GameState, intent: Intent): GameState {
  switch (intent.kind) {
    case "addPlayer":
      if (state.status !== "lobby") return state;
      if (state.players.some((p) => p.id === intent.player.id)) return state;
      if (state.players.length >= (state.maxSeats ?? 4)) return state;
      return {
        ...state,
        players: [...state.players, intent.player],
        scores: { ...state.scores, [intent.player.id]: state.scores[intent.player.id] ?? 0 },
      };
    case "addBot": {
      if (state.status !== "lobby") return state;
      if (state.players.length >= (state.maxSeats ?? 4)) return state;
      const usedColors = new Set(state.players.map((p) => p.color));
      const color = PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? PLAYER_COLORS[0];
      const usedNums = new Set(
        state.players
          .filter((p) => p.isBot)
          .map((p) => {
            const m = /^Bot\s+(\d+)$/.exec(p.name);
            return m ? parseInt(m[1], 10) : 0;
          }),
      );
      let n = 1;
      while (usedNums.has(n)) n++;
      const bot: Player = {
        id: `bot_${Date.now()}_${n}`,
        name: `Bot ${n}`,
        color,
        isBot: true,
        ready: true,
        avatarUrl: null,
        cardBackUrl: null,
        piles: [],
        pileLocked: [],
        hand: [],
        openPileIndex: null,
      };
      return {
        ...state,
        players: [...state.players, bot],
        scores: { ...state.scores, [bot.id]: 0 },
      };
    }
    case "removeBot": {
      if (state.status !== "lobby") return state;
      const idx = state.players.findIndex((p) => p.isBot);
      if (idx === -1) return state;
      const removed = state.players[idx];
      return {
        ...state,
        players: state.players.filter((_, i) => i !== idx),
        scores: Object.fromEntries(
          Object.entries(state.scores).filter(([k]) => k !== removed.id)
        ),
      };
    }
    case "ready":
      return setReady(state, intent.playerId, intent.ready);
    case "openPile":
      return openPile(state, intent.playerId, intent.stackIndex);
    case "closePile":
      return closePile(state, intent.playerId);
    case "holdCenter":
      return holdCenterCard(state, intent.playerId, intent.centerIndex);
    case "swap":
      return swapCard(state, intent.playerId, intent.cardId);
    case "holdFreeCard":
      return holdFreeCard(state, intent.viewerId, intent.ownerId, intent.pileIndex, intent.cardId);
    case "swapFreeCard":
      return swapFreeCard(state, intent.viewerId, intent.cardId);
    case "declareSet":
      return declareSet(state, intent.playerId);
    case "declareBimyah":
      return declareBimyah(state, intent.playerId);
    case "playAgain":
      return resetToLobby(state);
    case "nextMatch":
      return nextMatch(state);
    case "newTournament":
      return newTournament(state, intent.pointLimit);
    case "readyForNext":
      return setReadyForNext(state, intent.playerId, intent.ready);
    case "ping":
      return markActive(state, intent.playerId);
    case "emblemLayout": {
      // Update player's emblem layout in state
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === intent.playerId
            ? { ...p, emblemLayout: { ...(p as any).emblemLayout, [intent.slot]: intent.layout } }
            : p
        ),
      };
    }
    case "markDisconnected":
      return markDisconnected(state, intent.playerId);
    case "markReconnected":
      return markReconnected(state, intent.playerId);
    case "addSpectator": {
      const spectators = state.spectators ?? [];
      if (spectators.some((s) => s.id === intent.spectator.id)) return state;
      return { ...state, spectators: [...spectators, intent.spectator] };
    }
    case "removeSpectator": {
      const spectators = state.spectators ?? [];
      return { ...state, spectators: spectators.filter((s) => s.id !== intent.spectatorId) };
    }
    case "chat": {
      const messages = state.chat ?? [];
      return { ...state, chat: [...messages, intent.message].slice(-50) };
    }
    case "replaceState":
      return intent.state;
    default:
      return state;
  }
}

export type PeerSession = {
  meId: string;
  code: string;
  isHost: boolean;
  subscribe: (cb: (s: GameState) => void) => () => void;
  getState: () => GameState | null;
  setState: (mutator: (s: GameState) => GameState) => void;
  sendIntent: (intent: Intent) => void;
  connectionCount: () => number;
  reconnect: () => void;
  isConnected: () => boolean;
  destroy: () => void;
};

const PING_INTERVAL_MS = 2500;
const PING_TIMEOUT_MS = 6000;
const BROADCAST_MIN_INTERVAL_MS = 50;

function fourDigitCode(): string {
  return secureNumericCode(4);
}

function channelName(code: string): string {
  return `game:${code}`;
}

export async function hostGame(
  initialState: GameState,
  hostId: string,
): Promise<PeerSession> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = fourDigitCode();
    try {
      return await tryHost(code, initialState, hostId);
    } catch (err) {
      if (attempt === 4) throw err;
      // Try a different code
    }
  }
  throw new Error("Failed to host game");
}

export async function rehostGame(
  code: string,
  initialState: GameState,
  hostId: string,
): Promise<PeerSession> {
  return tryHost(code, initialState, hostId);
}

function tryHost(
  code: string,
  initialState: GameState,
  hostId: string,
): Promise<PeerSession> {
  return new Promise((resolve, reject) => {
    const channel = supabase.channel(channelName(code), {
      config: { broadcast: { ack: true }, presence: { key: hostId } },
    });

    const listeners = new Set<(s: GameState) => void>();
    let state: GameState = { ...initialState, id: code };
    const lastSeen = new Map<string, number>();
    let destroyed = false;

    let dirty = false;
    let lastBroadcastAt = 0;
    let flushTimer: ReturnType<typeof setTimeout> | null = null;

    function sendStateNow() {
      dirty = false;
      lastBroadcastAt = Date.now();
      if (destroyed) return;
      channel.send({
        type: "broadcast",
        event: "state",
        payload: { state },
      });
    }

    function broadcast() {
      dirty = true;
      if (flushTimer) return;
      const since = Date.now() - lastBroadcastAt;
      if (since >= BROADCAST_MIN_INTERVAL_MS) {
        sendStateNow();
        return;
      }
      flushTimer = setTimeout(() => {
        flushTimer = null;
        if (dirty) sendStateNow();
      }, BROADCAST_MIN_INTERVAL_MS - since);
    }

    function notifyLocal() {
      for (const cb of listeners) cb(state);
    }

    function applyAndBroadcast(mutator: (s: GameState) => GameState) {
      const next = mutator(state);
      if (next === state) return;
      state = next;
      notifyLocal();
      broadcast();
    }

    function touch(playerId: string) {
      lastSeen.set(playerId, Date.now());
    }

    // Liveness: mark stale players disconnected
    const livenessTimer = setInterval(() => {
      if (destroyed) return;
      const now = Date.now();
      for (const [pid, ts] of lastSeen) {
        if (now - ts > PING_TIMEOUT_MS) {
          applyAndBroadcast((s) => markDisconnected(s, pid));
        }
      }
    }, 1000);

    // Listen for intents from joiners
    channel.on("broadcast", { event: "intent" }, ({ payload }) => {
      if (destroyed) return;
      const intent = payload.intent as Intent;
      if (!intent || !intent.kind) return;
      // Host-only intents are rejected (markDisconnected/markReconnected)
      if (intent.kind === "markDisconnected" || intent.kind === "markReconnected") return;
      // Touch liveness for player intents
      const pid = (intent as any).playerId || (intent as any).viewerId;
      if (pid) touch(pid);
      applyAndBroadcast((s) => applyIntent(s, intent));
    });

    // Listen for hello from joiners
    channel.on("broadcast", { event: "hello" }, ({ payload }) => {
      if (destroyed) return;
      const { playerId, spectatorId, name } = payload;
      if (playerId) {
        touch(playerId);
        // If player not in game, add them (if in lobby)
        if (state.status === "lobby" && !state.players.some((p) => p.id === playerId)) {
          // Player info comes via addPlayer intent, but we can mark active
          applyAndBroadcast((s) => markReconnected(s, playerId));
        } else {
          applyAndBroadcast((s) => markReconnected(s, playerId));
        }
      } else if (spectatorId) {
        applyAndBroadcast((s) =>
          applyIntent(s, {
            kind: "addSpectator",
            spectator: { id: spectatorId, name: name || "Spectator" },
          })
        );
      }
      // Send current state to the new joiner
      sendStateNow();
    });

    // Listen for pings
    channel.on("broadcast", { event: "ping" }, ({ payload }) => {
      if (destroyed) return;
      if (payload.playerId) touch(payload.playerId);
    });

    // Track presence for connection count
    channel.on("presence", { event: "sync" }, () => {
      // Presence synced, connection count available via channel.presenceState()
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        // Track host presence
        await channel.track({ id: hostId, isHost: true, online_at: new Date().toISOString() });

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
          setState: (mutator) => applyAndBroadcast(mutator),
          sendIntent: (intent) => applyAndBroadcast((s) => applyIntent(s, intent)),
          connectionCount: () => {
            const presence = channel.presenceState();
            return Object.keys(presence).length;
          },
          reconnect: () => {
            // Host is always connected once subscribed. No-op.
          },
          isConnected: () => !destroyed,
          destroy: () => {
            destroyed = true;
            clearInterval(livenessTimer);
            if (flushTimer) clearTimeout(flushTimer);
            supabase.removeChannel(channel);
            listeners.clear();
          },
        };
        resolve(session);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        reject(new Error(`Failed to host: ${status}`));
      }
    });

    // Timeout if we don't subscribe within 10s
    setTimeout(() => {
      if (!destroyed) {
        destroyed = true;
        supabase.removeChannel(channel);
        reject(new Error("Connection timed out. The game server may be unreachable from Discord. Try again."));
      }
    }, 10000);
  });
}

export async function joinGame(
  code: string,
  myId: string,
  opts: { asSpectator?: boolean } = {},
): Promise<PeerSession> {
  const asSpectator = opts.asSpectator ?? false;
  // Retry loop for transient failures
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await tryJoinOnce(code, myId, asSpectator);
    } catch (err) {
      lastErr = err;
      if (attempt < 2) await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastErr ?? new Error("Failed to join game");
}

function tryJoinOnce(
  code: string,
  myId: string,
  asSpectator: boolean,
): Promise<PeerSession> {
  return new Promise((resolve, reject) => {
    const channel = supabase.channel(channelName(code), {
      config: { broadcast: { ack: true }, presence: { key: myId } },
    });

    let state: GameState | null = null;
    const listeners = new Set<(s: GameState) => void>();
    let destroyed = false;
    let resolved = false;
    let settled = false;

    const pingTimer = setInterval(() => {
      if (destroyed || asSpectator) return;
      channel.send({
        type: "broadcast",
        event: "ping",
        payload: { playerId: myId },
      });
    }, PING_INTERVAL_MS);

    function settleResolve(session: PeerSession) {
      if (settled) return;
      settled = true;
      resolved = true;
      resolve(session);
    }

    function settleReject(err: unknown) {
      if (settled) return;
      settled = true;
      supabase.removeChannel(channel);
      reject(err);
    }

    function notify() {
      if (state) for (const cb of listeners) cb(state);
    }

    // Listen for state broadcasts from host
    channel.on("broadcast", { event: "state" }, ({ payload }) => {
      if (destroyed) return;
      const newState = payload.state as GameState;
      if (!newState) return;
      state = newState;
      notify();
      if (!resolved) {
        // First state received = successfully joined
        const session: PeerSession = {
          meId: myId,
          code,
          isHost: false,
          subscribe: (cb) => {
            listeners.add(cb);
            if (state) cb(state);
            return () => listeners.delete(cb);
          },
          getState: () => state,
          setState: (mutator) => {
            // Joiner optimistic update (host broadcast will overwrite)
            if (!state) return;
            state = mutator(state);
            notify();
          },
          sendIntent: (intent) => {
            if (destroyed) return;
            channel.send({
              type: "broadcast",
              event: "intent",
              payload: { intent },
            });
          },
          connectionCount: () => 1, // Connected to host via channel
          reconnect: () => {
            // Re-subscribe to get fresh state
            if (!destroyed) {
              channel.send({
                type: "broadcast",
                event: "hello",
                payload: asSpectator
                  ? { spectatorId: myId, name: "" }
                  : { playerId: myId, name: "" },
              });
            }
          },
          isConnected: () => !destroyed,
          destroy: () => {
            destroyed = true;
            clearInterval(pingTimer);
            if (!asSpectator) {
              // Notify host we're leaving
              channel.send({
                type: "broadcast",
                event: "intent",
                payload: { intent: { kind: "markDisconnected", playerId: myId } },
              });
            } else {
              channel.send({
                type: "broadcast",
                event: "intent",
                payload: { intent: { kind: "removeSpectator", spectatorId: myId } },
              });
            }
            supabase.removeChannel(channel);
            listeners.clear();
          },
        };
        settleResolve(session);
      }
    });

    channel.subscribe(async (status) => {
      if (status === "SUBSCRIBED") {
        // Track presence
        await channel.track({
          id: myId,
          isSpectator: asSpectator,
          online_at: new Date().toISOString(),
        });
        // Send hello to host
        channel.send({
          type: "broadcast",
          event: "hello",
          payload: asSpectator
            ? { spectatorId: myId, name: "" }
            : { playerId: myId, name: "" },
        });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        settleReject(new Error(`Failed to join: ${status}`));
      }
    });

    // Timeout: if no state received within 15s, fail
    // (Host must be online and broadcasting)
    setTimeout(() => {
      if (!settled) {
        settleReject(
          new Error("Could not connect. Check the code. (No host broadcasting state)")
        );
      }
    }, 15000);
  });
}
