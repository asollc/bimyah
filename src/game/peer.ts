import Peer, { type DataConnection } from "peerjs";
import type { GameState } from "./types";

/**
 * WebRTC multiplayer using PeerJS.
 *
 * Architecture:
 * - Host opens a Peer with id `bimyah-XXXX` (4-digit code) and accepts connections.
 * - Host holds authoritative GameState in memory. On every local mutation, the
 *   host broadcasts the new state to all connected peers.
 * - Joiners connect to the host, receive state updates, and send their own
 *   state mutations back as full snapshots ({ type: "state", state }).
 * - Host accepts the joiner snapshot, replaces local state, and rebroadcasts to
 *   all other peers (so all clients converge on the host's authoritative copy).
 */

export type PeerSession = {
  /** Local player id assigned by the session. Always set after `ready` resolves. */
  meId: string;
  /** 4-digit room code (also embedded in peer id). */
  code: string;
  /** True if this peer is the host. */
  isHost: boolean;
  /** Subscribe to state changes. Returns unsubscribe. */
  subscribe: (cb: (s: GameState) => void) => () => void;
  /** Get current state. */
  getState: () => GameState | null;
  /** Apply a mutation locally and propagate. */
  setState: (mutator: (s: GameState) => GameState) => void;
  /** Number of currently connected peers (host only). */
  connectionCount: () => number;
  /** Tear down the connection. */
  destroy: () => void;
};

type Message =
  | { type: "state"; state: GameState }
  | { type: "hello"; name: string };

function fourDigitCode(): string {
  return Math.floor(1000 + Math.random() * 9000).toString();
}

function peerIdFor(code: string): string {
  return `bimyah-${code}`;
}

const PEER_OPTS = {
  // Default PeerJS cloud server. Free, no setup required.
  // Could be replaced with a self-hosted PeerServer if needed.
  debug: 1,
};

/**
 * Host a new game. Initial state must already include the host as the first
 * player. Returns once the Peer is open and ready to accept connections.
 */
export async function hostGame(
  initialState: GameState,
  hostId: string,
): Promise<PeerSession> {
  // Try a few codes in case of collision on the public PeerJS server.
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = fourDigitCode();
    try {
      const session = await tryHost(code, initialState, hostId);
      return session;
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

    function broadcast(except?: DataConnection) {
      const msg: Message = { type: "state", state };
      for (const c of conns.values()) {
        if (c === except) continue;
        if (c.open) c.send(msg);
      }
    }

    function notifyLocal() {
      for (const cb of listeners) cb(state);
    }

    peer.on("open", () => {
      const session: PeerSession = {
        meId: hostId,
        code,
        isHost: true,
        subscribe: (cb) => {
          listeners.add(cb);
          // immediate callback
          cb(state);
          return () => listeners.delete(cb);
        },
        getState: () => state,
        setState: (mutator) => {
          state = mutator(state);
          notifyLocal();
          broadcast();
        },
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
        // send current state immediately
        const msg: Message = { type: "state", state };
        conn.send(msg);
      });
      conn.on("data", (raw) => {
        const msg = raw as Message;
        if (msg.type === "state") {
          // Joiner-initiated change. Replace state, fan out to everyone else.
          state = { ...msg.state, id: code };
          notifyLocal();
          broadcast(conn);
        }
      });
      conn.on("close", () => {
        conns.delete(conn.peer);
      });
    });

    peer.on("error", (err) => {
      // unavailable-id => the peer id (code) is taken on the broker.
      reject(err);
    });
  });
}

/**
 * Join an existing game by 4-digit code. Returns once a state snapshot has
 * been received from the host.
 */
export async function joinGame(code: string, myId: string): Promise<PeerSession> {
  return new Promise((resolve, reject) => {
    const peer = new Peer(PEER_OPTS);
    let resolved = false;
    let state: GameState | null = null;
    const listeners = new Set<(s: GameState) => void>();

    peer.on("open", () => {
      const conn = peer.connect(peerIdFor(code), { reliable: true });

      conn.on("open", () => {
        // wait for first state push to resolve
      });

      conn.on("data", (raw) => {
        const msg = raw as Message;
        if (msg.type === "state") {
          state = msg.state;
          for (const cb of listeners) cb(state);
          if (!resolved) {
            resolved = true;
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
                if (!state) return;
                state = mutator(state);
                for (const cb of listeners) cb(state);
                if (conn.open) conn.send({ type: "state", state } as Message);
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

      // safety timeout
      setTimeout(() => {
        if (!resolved) reject(new Error("Could not connect to host"));
      }, 10000);
    });

    peer.on("error", (err) => {
      if (!resolved) reject(err);
    });
  });
}
