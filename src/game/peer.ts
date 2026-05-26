import Peer, { type DataConnection } from "peerjs";
import type { GameState, Player } from "./types";
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
  /** Host-only: connection lifecycle. Never accept from remote. */
  | { kind: "markDisconnected"; playerId: string }
  | { kind: "markReconnected"; playerId: string }
  /** Spectator lifecycle. addSpectator may come from a joining viewer;
   *  removeSpectator is sent by the spectator on leave OR by the host when
   *  the spectator's transport closes. */
  | { kind: "addSpectator"; spectator: { id: string; name: string; avatarUrl?: string | null } }
  | { kind: "removeSpectator"; spectatorId: string }
  | { kind: "chat"; message: import("./types").ChatMessage }
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
    case "removeBot": {
      if (state.status !== "lobby") return state;
      const botIndex = state.players.map((p) => p.isBot).lastIndexOf(true);
      if (botIndex === -1) return state;
      const botId = state.players[botIndex].id;
      const newPlayers = state.players.filter((_, i) => i !== botIndex);
      const { [botId]: _, ...remainingScores } = state.scores;
      return {
        ...state,
        players: newPlayers,
        scores: remainingScores,
      };
    }
    case "ready":
      return setReady(state, intent.playerId, intent.ready);
    case "openPile":
      return markActive(openPile(state, intent.playerId, intent.stackIndex), intent.playerId);
    case "closePile":
      return markActive(closePile(state, intent.playerId), intent.playerId);
    case "holdCenter":
      return markActive(holdCenterCard(state, intent.playerId, intent.centerIndex), intent.playerId);
    case "swap":
      return markActive(swapCard(state, intent.playerId, intent.cardId), intent.playerId);
    case "holdFreeCard":
      return markActive(holdFreeCard(state, intent.viewerId, intent.ownerId, intent.pileIndex, intent.cardId), intent.viewerId);
    case "swapFreeCard":
      return markActive(swapFreeCard(state, intent.viewerId, intent.cardId), intent.viewerId);
    case "markDisconnected":
      return markDisconnected(state, intent.playerId);
    case "markReconnected":
      return markReconnected(state, intent.playerId);
    case "declareSet":
      return markActive(declareSet(state, intent.playerId), intent.playerId);
    case "declareBimyah":
      return markActive(declareBimyah(state, intent.playerId), intent.playerId);
    case "playAgain":
      return resetToLobby(state);
    case "nextMatch":
      return nextMatch(state);
    case "newTournament":
      return newTournament(state, intent.pointLimit);
    case "readyForNext":
      return setReadyForNext(state, intent.playerId, intent.ready);
    case "addSpectator": {
      const cur = state.spectators ?? [];
      if (cur.some((s) => s.id === intent.spectator.id)) return state;
      if (cur.length >= MAX_SPECTATORS) return state;
      return { ...state, spectators: [...cur, intent.spectator] };
    }
    case "removeSpectator": {
      const cur = state.spectators ?? [];
      if (!cur.some((s) => s.id === intent.spectatorId)) return state;
      return { ...state, spectators: cur.filter((s) => s.id !== intent.spectatorId) };
    }
    case "chat": {
      const m = intent.message;
      const text = (m.text ?? "").trim();
      if (!text) return state;
      const safeText = text.slice(0, 500);
      const isPlayer = state.players.some((p) => p.id === m.authorId);
      const isSpec = (state.spectators ?? []).some((s) => s.id === m.authorId);
      if (!isPlayer && !isSpec) return state;
      // Only seated players may post in match chat.
      if (m.channel === "match" && !isPlayer) return state;
      // Spectator channel: any present participant may post.
      if (m.channel !== "match" && m.channel !== "spectator") return state;
      const chat = state.chat ?? [];
      const next = [...chat, { ...m, text: safeText }];
      const trimmed = next.length > 200 ? next.slice(next.length - 200) : next;
      return { ...state, chat: trimmed };
    }
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
  | { type: "hello"; name: string; playerId?: string; spectatorId?: string }
  | { type: "ping"; playerId: string };

/** Heartbeat: joiners ping host every PING_INTERVAL_MS; host marks
 *  disconnected after PING_TIMEOUT_MS of silence. PeerJS DataConnection
 *  "close" does NOT fire reliably when a remote tab is killed, so we cannot
 *  rely on it alone. */
const PING_INTERVAL_MS = 2500;
const PING_TIMEOUT_MS = 6000;

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
    /** Maps PeerJS conn.peer → game playerId (learned from the joiner's hello). */
    const peerToPlayer = new Map<string, string>();
    /** Maps playerId → ms timestamp of last ping/hello/intent received. */
    const lastSeen = new Map<string, number>();
    const listeners = new Set<(s: GameState) => void>();
    let state: GameState = { ...initialState, id: code };

    /** Maps PeerJS conn.peer → spectator id (learned from hello). */
    const peerToSpectator = new Map<string, string>();

    function touch(playerId: string) {
      lastSeen.set(playerId, Date.now());
    }

    // Liveness check: mark stale players disconnected.
    const livenessTimer = setInterval(() => {
      const now = Date.now();
      for (const [pid, ts] of lastSeen) {
        if (now - ts > PING_TIMEOUT_MS) {
          applyAndBroadcast((s) => markDisconnected(s, pid));
        }
      }
    }, 1000);

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
          clearInterval(livenessTimer);
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
        if (msg.type === "hello") {
          if (msg.playerId) {
            peerToPlayer.set(conn.peer, msg.playerId);
            touch(msg.playerId);
            applyAndBroadcast((s) => markReconnected(s, msg.playerId!));
          }
          if (msg.spectatorId) {
            peerToSpectator.set(conn.peer, msg.spectatorId);
          }
          return;
        }
        if (msg.type === "ping") {
          touch(msg.playerId);
          // NOTE: ping no longer clears disconnectedAt. Only true
          // reconnection (hello) or actual gameplay activity (intent +
          // markActive) clears it. This preserves the 10s idle → inactive
          // → free-cards promotion for players whose tab is open but who
          // aren't taking any actions.
          return;
        }
        if (msg.type === "intent") {
          // Reject host-only / local-only intents from remotes.
          if (
            msg.intent.kind === "replaceState" ||
            msg.intent.kind === "markDisconnected" ||
            msg.intent.kind === "markReconnected"
          ) {
            return;
          }
          const pid = peerToPlayer.get(conn.peer);
          if (pid) touch(pid);
          applyAndBroadcast((s) => applyIntent(s, msg.intent));
        }
      });
      conn.on("close", () => {
        conns.delete(conn.peer);
        const playerId = peerToPlayer.get(conn.peer);
        peerToPlayer.delete(conn.peer);
        if (playerId) {
          applyAndBroadcast((s) => markDisconnected(s, playerId));
        }
        const spectatorId = peerToSpectator.get(conn.peer);
        peerToSpectator.delete(conn.peer);
        if (spectatorId) {
          applyAndBroadcast((s) => applyIntent(s, { kind: "removeSpectator", spectatorId }));
        }
      });
    });

    peer.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * PeerJS error type classification.
 *
 * Fatal (give up immediately):
 *   - peer-unavailable: the host id doesn't exist (wrong code OR host not yet online)
 *     We treat this as RETRYABLE for the initial join because the host may still be
 *     coming online or the broker hasn't propagated the registration yet.
 *   - invalid-id / invalid-key / browser-incompatible / ssl-unavailable: unrecoverable.
 *
 * Transient (retry):
 *   - network, disconnected, socket-error, socket-closed, server-error, webrtc
 */
function isFatalPeerError(err: unknown): boolean {
  const type = (err as { type?: string } | null)?.type;
  if (!type) return false;
  return (
    type === "invalid-id" ||
    type === "invalid-key" ||
    type === "browser-incompatible" ||
    type === "ssl-unavailable"
  );
}

export async function joinGame(
  code: string,
  myId: string,
  opts: { asSpectator?: boolean } = {},
): Promise<PeerSession> {
  const MAX_ATTEMPTS = 5;
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await tryJoinOnce(code, myId, opts.asSpectator ?? false);
    } catch (err) {
      lastErr = err;
      if (isFatalPeerError(err)) break;
      await new Promise((r) => setTimeout(r, 600 + attempt * 400));
    }
  }
  throw lastErr ?? new Error("Could not connect to host");
}

function tryJoinOnce(code: string, myId: string, asSpectator: boolean): Promise<PeerSession> {
  return new Promise((resolve, reject) => {
    let peer: Peer = new Peer(PEER_OPTS);
    let conn: DataConnection | null = null;
    let resolved = false;
    let settled = false;
    let destroyed = false;
    let state: GameState | null = null;
    const listeners = new Set<(s: GameState) => void>();
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let initialTimer: ReturnType<typeof setTimeout> | null = null;
    const pingTimer: ReturnType<typeof setInterval> = setInterval(() => {
      if (conn && conn.open && !asSpectator) {
        try { conn.send({ type: "ping", playerId: myId } satisfies Message); } catch { /* ignore */ }
      }
    }, PING_INTERVAL_MS);

    function settleResolve() {
      if (settled) return;
      settled = true;
      if (initialTimer) {
        clearTimeout(initialTimer);
        initialTimer = null;
      }
      resolved = true;
      resolve(session);
    }

    function settleReject(err: unknown) {
      if (settled) return;
      settled = true;
      if (initialTimer) {
        clearTimeout(initialTimer);
        initialTimer = null;
      }
      try {
        peer.destroy();
      } catch {
        // ignore
      }
      reject(err);
    }

    function notify() {
      if (state) for (const cb of listeners) cb(state);
    }

    function send(m: Message) {
      if (conn && conn.open) conn.send(m);
    }

    function attachConn(c: DataConnection) {
      conn = c;
      c.on("open", () => {
        // Identify ourselves so the host can map this connection to our playerId.
        try {
          const hello: Message = asSpectator
            ? { type: "hello", name: "", spectatorId: myId }
            : { type: "hello", name: "", playerId: myId };
          c.send(hello);
        } catch { /* ignore */ }
      });
      c.on("data", (raw) => {
        const msg = raw as Message;
        if (msg.type === "state") {
          state = msg.state;
          notify();
          settleResolve();
        }
      });
      c.on("close", () => {
        if (destroyed) return;
        scheduleReconnect();
      });
      c.on("error", () => {
        // Connection-level errors after we're resolved → reconnect.
        // Before resolution, the outer initial timer / peer error handles it.
        if (!resolved) return;
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
        // Only reject the initial promise on FATAL errors. Transient errors
        // (peer-unavailable, network, socket-*, server-error, disconnected)
        // are common and recover on retry — let the initial timer or the
        // outer joinGame() retry loop handle them.
        if (!resolved) {
          if (isFatalPeerError(err)) {
            settleReject(err);
          }
          // else: swallow; initialTimer will reject if we never connect.
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
        clearInterval(pingTimer);
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

    // Per-attempt timeout. joinGame() retries on failure, so this can be
    // tighter than the previous 10s single-shot.
    initialTimer = setTimeout(() => {
      if (!settled) settleReject(new Error("Could not connect to host"));
    }, 6000);
  });
}

