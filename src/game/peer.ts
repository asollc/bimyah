import Peer, { type DataConnection } from "peerjs";
import type { GameState, Player } from "./types";
import {
  closePile,
  declareBimyah,
  declareSet,
  holdCenterCard,
  newTournament,
  nextMatch,
  openPile,
  PLAYER_COLORS,
  resetToLobby,
  setReady,
  swapCard,
} from "./engine";

/**
 * WebRTC multiplayer using PeerJS.
 *
 * Architecture:
 * - Host owns the authoritative GameState. Only the host mutates it
 *   (player intents, bot ticks, countdown ticks, hold timeouts).
 * - Joiners DO NOT mutate state locally. They send named intents to the host;
 *   the host applies them to its current state and broadcasts the result.
 * - Joiners may apply an optimistic local update for snappy UI; the next
 *   authoritative broadcast from the host overwrites it.
 *
 * This avoids the previous bug where two joiners (or joiner+host) sent
 * full-state snapshots that overwrote each other and produced ghost
 * selections / unresponsive center cards.
 */

export type Intent =
  | { kind: "addPlayer"; player: Player }
  | { kind: "addBot" }
  | { kind: "ready"; playerId: string; ready: boolean }
  | { kind: "openPile"; playerId: string; stackIndex: number }
  | { kind: "closePile"; playerId: string }
  | { kind: "holdCenter"; playerId: string; centerIndex: number }
  | { kind: "swap"; playerId: string; cardId: string }
  | { kind: "declareSet"; playerId: string }
  | { kind: "declareBimyah"; playerId: string }
  | { kind: "playAgain" }
  | { kind: "nextMatch" }
  | { kind: "newTournament"; pointLimit: number | null }
  /** Local-only fallback. Never accept this from remote clients. */
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
      const color =
        PLAYER_COLORS.find((c) => !usedColors.has(c)) ?? PLAYER_COLORS[0];
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
        id: `bot_${Math.random().toString(36).slice(2, 8)}`,
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
    case "replaceState":
      return intent.state;
  }
}

export type PeerSession = {
  meId: string;
  code: string;
  isHost: boolean;
  subscribe: (cb: (s: GameState) => void) => () => void;
  getState: () => GameState | null;
  /** Apply a mutation. Host: applies + broadcasts. Joiner: sends intent. */
  setState: (mutator: (s: GameState) => GameState) => void;
  /** Send a structured intent (preferred for joiners). */
  sendIntent: (intent: Intent) => void;
  connectionCount: () => number;
  /** Force a reconnection attempt (joiner only; no-op for host). */
  reconnect: () => void;
  /** True when the underlying transport is currently open. */
  isConnected: () => boolean;
  destroy: () => void;
};

type Message =
  | { type: "state"; state: GameState }
  | { type: "intent"; intent: Intent }
  | { type: "hello"; name: string };

function fourDigitCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function peerIdFor(code: string): string {
  return `bimyah-${code}`;
}

const PEER_OPTS = {
  debug: 1,
};

export async function hostGame(
  initialState: GameState,
  hostId: string,
): Promise<PeerSession> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = fourDigitCode();
    try {
      return await tryHost(code, initialState, hostId);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error("Failed to host game");
}

/**
 * Re-host an existing game using a known code (for resuming after a tab
 * close / refresh / mobile-app-kill on the host side). The PeerJS server
 * will release the previous peer-id once the old socket is gone, so this
 * may need to be retried for a few seconds.
 */
export async function rehostGame(
  code: string,
  state: GameState,
  hostId: string,
): Promise<PeerSession> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return await tryHost(code, state, hostId);
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw lastErr ?? new Error("Failed to re-host game");
}

function tryHost(
  code: string,
  initialState: GameState,
  hostId: string,
): Promise<PeerSession> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(peerIdFor(code), PEER_OPTS);
    const conns = new Map<string, DataConnection>();
    const listeners = new Set<(s: GameState) => void>();
    let state: GameState = { ...initialState, id: code };

    function broadcast() {
      const msg: Message = { type: "state", state };
      for (const c of conns.values()) {
        if (c.open) c.send(msg);
      }
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

    peer.on("open", () => {
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
        connectionCount: () => conns.size,
        reconnect: () => {
          // Host is always "reconnected" once peer is open. No-op.
        },
        isConnected: () => !peer.disconnected && !peer.destroyed,
        destroy: () => {
          for (const c of conns.values()) {
            try {
              c.close();
            } catch {
              // ignore
            }
          }
          peer.destroy();
        },
      };
      resolve(session);
    });

    peer.on("connection", (conn) => {
      conn.on("open", () => {
        conns.set(conn.peer, conn);
        const msg: Message = { type: "state", state };
        conn.send(msg);
      });
      conn.on("data", (raw) => {
        const msg = raw as Message;
        if (msg.type === "intent") {
          if (msg.intent.kind === "replaceState") {
            return;
          }
          // Apply the joiner's intent against current authoritative state.
          applyAndBroadcast((s) => applyIntent(s, msg.intent));
        }
        // Ignore "state" from joiners — joiners are no longer authoritative.
      });
      conn.on("close", () => {
        conns.delete(conn.peer);
      });
    });

    peer.on("error", (err) => {
      reject(err);
    });
  });
}

export async function joinGame(code: string, myId: string): Promise<PeerSession> {
  return new Promise((resolve, reject) => {
    let peer: Peer = new Peer(PEER_OPTS);
    let conn: DataConnection | null = null;
    let resolved = false;
    let destroyed = false;
    let state: GameState | null = null;
    const listeners = new Set<(s: GameState) => void>();
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function notify() {
      if (state) for (const cb of listeners) cb(state);
    }

    function send(m: Message) {
      if (conn && conn.open) conn.send(m);
    }

    function attachConn(c: DataConnection) {
      conn = c;
      c.on("data", (raw) => {
        const msg = raw as Message;
        if (msg.type === "state") {
          state = msg.state;
          notify();
          if (!resolved) {
            resolved = true;
            resolve(session);
          }
        }
      });
      c.on("close", () => {
        if (destroyed) return;
        scheduleReconnect();
      });
      c.on("error", () => {
        if (!resolved) {
          // Initial failure handled by timeout below.
          return;
        }
        if (destroyed) return;
        scheduleReconnect();
      });
    }

    function openAndConnect() {
      peer.on("open", () => {
        if (destroyed) return;
        const c = peer.connect(peerIdFor(code), { reliable: true });
        attachConn(c);
      });
      peer.on("error", (err) => {
        if (!resolved) {
          reject(err);
          return;
        }
        if (destroyed) return;
        scheduleReconnect();
      });
    }

    function scheduleReconnect() {
      if (destroyed || reconnectTimer) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = null;
        if (destroyed) return;
        try {
          conn?.close();
        } catch {
          // ignore
        }
        try {
          peer.destroy();
        } catch {
          // ignore
        }
        peer = new Peer(PEER_OPTS);
        openAndConnect();
      }, 1500);
    }

    const session: PeerSession = {
      meId: myId,
      code,
      isHost: false,
      subscribe: (cb) => {
        listeners.add(cb);
        if (state) cb(state);
        return () => {
          listeners.delete(cb);
        };
      },
      getState: () => state,
      setState: (mutator) => {
        if (!state) return;
        state = mutator(state);
        notify();
      },
      sendIntent: (intent) => {
        send({ type: "intent", intent });
      },
      connectionCount: () => (conn?.open ? 1 : 0),
      reconnect: () => {
        if (conn?.open) return;
        scheduleReconnect();
      },
      isConnected: () => !!conn?.open,
      destroy: () => {
        destroyed = true;
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        try {
          conn?.close();
        } catch {
          // ignore
        }
        try {
          peer.destroy();
        } catch {
          // ignore
        }
      },
    };

    openAndConnect();

    setTimeout(() => {
      if (!resolved) reject(new Error("Could not connect to host"));
    }, 10000);
  });
}

