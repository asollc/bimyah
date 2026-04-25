import Peer, { type DataConnection } from "peerjs";
import type { GameState } from "./types";
import {
  closePile,
  declareBimyah,
  declareSet,
  holdCenterCard,
  openPile,
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
  | { kind: "ready"; playerId: string; ready: boolean }
  | { kind: "openPile"; playerId: string; stackIndex: number }
  | { kind: "closePile"; playerId: string }
  | { kind: "holdCenter"; playerId: string; centerIndex: number }
  | { kind: "swap"; playerId: string; cardId: string }
  | { kind: "declareSet"; playerId: string }
  | { kind: "declareBimyah"; playerId: string }
  | { kind: "playAgain" }
  /** Fallback: full-state replace (only used by host->client broadcasts and
   *  rare client-side resets like Play Again that don't fit a named intent). */
  | { kind: "replaceState"; state: GameState };

function applyIntent(state: GameState, intent: Intent): GameState {
  switch (intent.kind) {
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
      return {
        ...state,
        status: "lobby",
        winnerId: null,
        countdownEndsAt: null,
        center: [],
        players: state.players.map((p) => ({
          ...p,
          ready: p.isBot,
          piles: [],
          pileLocked: [],
          hand: [],
          openPileIndex: null,
        })),
      };
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
    const peer = new Peer(PEER_OPTS);
    let resolved = false;
    let state: GameState | null = null;
    const listeners = new Set<(s: GameState) => void>();

    peer.on("open", () => {
      const conn = peer.connect(peerIdFor(code), { reliable: true });

      conn.on("data", (raw) => {
        const msg = raw as Message;
        if (msg.type === "state") {
          state = msg.state;
          for (const cb of listeners) cb(state);
          if (!resolved) {
            resolved = true;
            const send = (m: Message) => {
              if (conn.open) conn.send(m);
            };
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
                // Optimistic local update (snappy UI). Host's next broadcast
                // is authoritative and will overwrite this.
                if (!state) return;
                state = mutator(state);
                for (const cb of listeners) cb(state);
                // Joiner cannot send a function; send full state as a
                // last-resort intent. Prefer sendIntent for known actions.
                send({ type: "intent", intent: { kind: "replaceState", state } });
              },
              sendIntent: (intent) => {
                send({ type: "intent", intent });
              },
              connectionCount: () => (conn.open ? 1 : 0),
              destroy: () => {
                try {
                  conn.close();
                } catch {
                  // ignore
                }
                peer.destroy();
              },
            };
            resolve(session);
          }
        }
      });

      conn.on("error", (err) => {
        if (!resolved) reject(err);
      });

      setTimeout(() => {
        if (!resolved) reject(new Error("Could not connect to host"));
      }, 10000);
    });

    peer.on("error", (err) => {
      if (!resolved) reject(err);
    });
  });
}
