import type { GameState, Player, PlayerColor, Card, Rank, GameMode, MatchRecord } from "./types";
import { deal, isFourOfAKind, pilesPerPlayer } from "./deck";

export const PLAYER_COLORS: PlayerColor[] = [
  "green",
  "red",
  "blue",
  "yellow",
  "purple",
  "orange",
  "cyan",
  "pink",
];
export const HOLD_DURATION_MS = 5000;
export const COUNTDOWN_MS = 3000;
export const MAX_HAND = 5;

/** Generate a unique 4-digit reentry code, avoiding any provided existing codes. */
export function generateReentryCode(existing: Iterable<string> = []): string {
  const used = new Set(existing);
  for (let i = 0; i < 200; i++) {
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    if (!used.has(code)) return code;
  }
  return Math.floor(1000 + Math.random() * 9000).toString();
}

/** Point value per card rank. Aces = 1, face cards = 11/12/13. */
export const RANK_POINTS: Record<Rank, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7,
  "8": 8, "9": 9, "10": 10, J: 11, Q: 12, K: 13,
};

export type CreateGameOptions = {
  mode?: GameMode;
  pointLimit?: number | null;
  maxSeats?: number;
};

export function createInitialGame(
  id: string,
  playerSpecs: Array<{
    id: string;
    name: string;
    isBot: boolean;
    avatarUrl?: string | null;
    cardBackUrl?: string | null;
  }>,
  opts: CreateGameOptions = {},
): GameState {
  const players: Player[] = playerSpecs.map((p, i) => ({
    id: p.id,
    name: p.name,
    color: PLAYER_COLORS[i],
    isBot: p.isBot,
    ready: false,
    avatarUrl: p.avatarUrl ?? null,
    cardBackUrl: p.cardBackUrl ?? null,
    reentryCode: p.isBot ? undefined : generateReentryCode(),
    piles: [],
    pileLocked: [],
    hand: [],
    openPileIndex: null,
  }));
  const mode: GameMode = opts.mode ?? "standard";
  return {
    id,
    status: "lobby",
    players,
    center: [],
    countdownEndsAt: null,
    winnerId: null,
    startedAt: null,
    mode,
    pointLimit: mode === "tournament" ? (opts.pointLimit ?? null) : null,
    matchNumber: 1,
    scores: Object.fromEntries(players.map((p) => [p.id, 0])),
    matchHistory: [],
    lastMatchPoints: null,
    championId: null,
    maxSeats: opts.maxSeats ?? 4,
    hostId: players.find((p) => !p.isBot)?.id ?? players[0]?.id,
    wonAt: null,
  };
}

export function setReady(state: GameState, playerId: string, ready: boolean): GameState {
  // Ready toggles only apply in the lobby. Any stray "ready" intent that
  // arrives mid-match (e.g. duplicate broadcast, late reconnect) must NOT
  // re-deal cards or restart the match.
  if (state.status !== "lobby") return state;
  const players = state.players.map((p) => (p.id === playerId ? { ...p, ready } : p));
  const allReady = players.length >= 2 && players.every((p) => p.ready);
  if (!allReady) return { ...state, players };
  // begin countdown + deal
  const dealt = deal(players.length);
  const ppp = pilesPerPlayer(players.length);
  const playersDealt = players.map((p, i) => ({
    ...p,
    piles: dealt.piles[i],
    pileLocked: new Array(ppp).fill(false),
    hand: [],
    openPileIndex: null,
  }));
  return {
    ...state,
    players: playersDealt,
    center: dealt.center.map((c) => ({ card: c, heldBy: null, heldUntil: null, placedAt: Date.now() })),
    status: "countdown",
    countdownEndsAt: Date.now() + COUNTDOWN_MS,
  };
}

export function tickCountdown(state: GameState): GameState {
  if (state.status !== "countdown") return state;
  if (state.countdownEndsAt && Date.now() >= state.countdownEndsAt) {
    const now = Date.now();
    return {
      ...state,
      status: "playing",
      startedAt: now,
      countdownEndsAt: null,
      // Seed activity timestamps so idle detection has a baseline.
      players: state.players.map((p) => ({ ...p, lastActiveAt: now })),
    };
  }
  return state;
}

export function openPile(state: GameState, playerId: string, pileIndex: number): GameState {
  if (state.status !== "playing") return state;
  const players = state.players.map((p) => {
    if (p.id !== playerId) return p;
    if (p.pileLocked[pileIndex]) return p;
    let next = p;
    if (next.openPileIndex !== null && next.openPileIndex !== pileIndex) {
      const newPiles = next.piles.map((pile, i) =>
        i === next.openPileIndex ? [...next.hand] : pile,
      );
      next = { ...next, piles: newPiles, hand: [], openPileIndex: null };
    }
    if (next.openPileIndex === pileIndex) return next;
    const taken = next.piles[pileIndex];
    if (!taken || taken.length === 0) return next;
    const newPiles = next.piles.map((pile, i) => (i === pileIndex ? [] : pile));
    return { ...next, piles: newPiles, hand: taken, openPileIndex: pileIndex };
  });
  return { ...state, players };
}

export function closePile(state: GameState, playerId: string): GameState {
  const players = state.players.map((p) => {
    if (p.id !== playerId) return p;
    if (p.openPileIndex === null) return p;
    const newPiles = p.piles.map((pile, i) => (i === p.openPileIndex ? [...p.hand] : pile));
    return { ...p, piles: newPiles, hand: [], openPileIndex: null };
  });
  return { ...state, players };
}

export function holdCenterCard(
  state: GameState,
  playerId: string,
  centerIndex: number,
): GameState {
  if (state.status !== "playing") return state;
  const slot = state.center[centerIndex];
  if (!slot || !slot.card || slot.heldBy) return state;
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.openPileIndex === null) return state;
  if (player.hand.length === 0) return state;
  if (player.hand.length > MAX_HAND) return state;
  const holdsByPlayer = state.center.some((s) => s.heldBy === playerId);
  if (holdsByPlayer) return state;
  const center = state.center.map((s, i) =>
    i === centerIndex
      ? { ...s, heldBy: playerId, heldUntil: Date.now() + HOLD_DURATION_MS }
      : s,
  );
  return { ...state, center };
}

export function swapCard(
  state: GameState,
  playerId: string,
  cardId: string,
): GameState {
  const heldIdx = state.center.findIndex((s) => s.heldBy === playerId);
  if (heldIdx === -1) return state;
  const slot = state.center[heldIdx];
  if (!slot.card) return state;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const handCard = player.hand.find((c) => c.id === cardId);
  if (!handCard) return state;
  const centerCard = slot.card;
  const newHand = player.hand.map((c) => (c.id === cardId ? centerCard : c));
  const players = state.players.map((p) => (p.id === playerId ? { ...p, hand: newHand } : p));
  const center = state.center.map((s, i) =>
    i === heldIdx ? { card: handCard, heldBy: null, heldUntil: null, placedAt: Date.now() } : s,
  );
  return { ...state, players, center };
}

export function releaseHold(state: GameState, centerIndex: number): GameState {
  const slot = state.center[centerIndex];
  if (!slot.heldBy) return state;
  const center = state.center.map((s, i) =>
    i === centerIndex ? { ...s, heldBy: null, heldUntil: null } : s,
  );
  return { ...state, center };
}

export function tickHolds(state: GameState): GameState {
  let next = state;
  const now = Date.now();
  for (let i = 0; i < next.center.length; i++) {
    const slot = next.center[i];
    if (slot.heldBy && slot.heldUntil && now >= slot.heldUntil) {
      next = releaseHold(next, i);
    }
  }
  return next;
}

export function declareSet(state: GameState, playerId: string): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  if (player.openPileIndex === null) return state;
  if (player.hand.length !== 4) return state;
  if (!isFourOfAKind(player.hand)) return state;
  const idx = player.openPileIndex;
  const newPiles = player.piles.map((pile, i) => (i === idx ? [...player.hand] : pile));
  const newLocked = player.pileLocked.map((v, i) => (i === idx ? true : v));
  const players = state.players.map((p) =>
    p.id === playerId
      ? { ...p, piles: newPiles, pileLocked: newLocked, hand: [], openPileIndex: null }
      : p,
  );
  return { ...state, players };
}

export function canDeclareBimyah(state: GameState, playerId: string): boolean {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return false;
  return player.pileLocked.length > 0 && player.pileLocked.every((v) => v);
}

/**
 * Compute the tournament points earned by a player at the end of a match.
 * One rank-value award per locked four-of-a-kind set (NOT per card).
 */
export function computeMatchPoints(player: Player): number {
  let total = 0;
  player.piles.forEach((pile, i) => {
    if (!player.pileLocked[i]) return;
    const card = pile[0];
    if (!card) return;
    total += RANK_POINTS[card.rank] ?? 0;
  });
  return total;
}

export function declareBimyah(state: GameState, playerId: string): GameState {
  if (!canDeclareBimyah(state, playerId)) return state;
  const winner = state.players.find((p) => p.id === playerId);
  if (!winner) return state;

  if (state.mode !== "tournament") {
    return { ...state, status: "won", winnerId: playerId, wonAt: Date.now() };
  }

  const earned = computeMatchPoints(winner);
  const newTotal = (state.scores[playerId] ?? 0) + earned;
  const scores = { ...state.scores, [playerId]: newTotal };
  const perPlayer: Record<string, number> = Object.fromEntries(
    state.players.map((p) => [p.id, p.id === playerId ? earned : 0]),
  );
  const record: MatchRecord = {
    matchNumber: state.matchNumber,
    winnerId: playerId,
    winnerName: winner.name,
    points: earned,
    perPlayer,
  };
  const limitReached =
    state.pointLimit !== null && newTotal >= state.pointLimit;
  return {
    ...state,
    status: "won",
    winnerId: playerId,
    wonAt: Date.now(),
    scores,
    matchHistory: [...state.matchHistory, record],
    lastMatchPoints: earned,
    championId: limitReached ? playerId : null,
  };
}

/** Toggle a player's "ready for the next match" flag on the win screen. */
export function setReadyForNext(
  state: GameState,
  playerId: string,
  ready: boolean,
): GameState {
  if (state.status !== "won") return state;
  const players = state.players.map((p) =>
    p.id === playerId ? { ...p, readyForNext: ready } : p,
  );
  return { ...state, players };
}

/**
 * Standard mode "Play Again" — wipes scores too (they were never used).
 * Resets to lobby with the same players.
 */
/** Filter players for the next match: keep host, bots, and anyone who readied
 *  up. Drops players who are flagged as inactive (free-cards) so they're
 *  permanently removed from the lobby when starting a new match. */
function keepReadyPlayers(state: GameState): Player[] {
  return state.players.filter(
    (p) =>
      !p.freeCards &&
      !p.disconnectedAt &&
      (p.isBot || p.id === state.hostId || p.readyForNext),
  );
}

export function resetToLobby(state: GameState): GameState {
  const kept = keepReadyPlayers(state);
  return {
    ...state,
    status: "lobby",
    winnerId: null,
    countdownEndsAt: null,
    wonAt: null,
    center: [],
    matchNumber: 1,
    scores: Object.fromEntries(kept.map((p) => [p.id, 0])),
    matchHistory: [],
    lastMatchPoints: null,
    championId: null,
    players: kept.map((p) => ({
      ...p,
      ready: p.isBot,
      readyForNext: false,
      piles: [],
      pileLocked: [],
      hand: [],
      openPileIndex: null,
      disconnectedAt: null,
      freeCards: false,
      freePileHolds: undefined,
    })),
  };
}

/**
 * Tournament "Next Match" — preserves scores, history, mode, pointLimit.
 * Increments match number; players must ready up again.
 */
export function nextMatch(state: GameState): GameState {
  const kept = keepReadyPlayers(state);
  const keptIds = new Set(kept.map((p) => p.id));
  return {
    ...state,
    status: "lobby",
    winnerId: null,
    countdownEndsAt: null,
    wonAt: null,
    center: [],
    matchNumber: state.matchNumber + 1,
    lastMatchPoints: null,
    scores: Object.fromEntries(
      Object.entries(state.scores).filter(([id]) => keptIds.has(id)),
    ),
    players: kept.map((p) => ({
      ...p,
      ready: p.isBot,
      readyForNext: false,
      piles: [],
      pileLocked: [],
      hand: [],
      openPileIndex: null,
      disconnectedAt: null,
      freeCards: false,
      freePileHolds: undefined,
    })),
  };
}

/**
 * Tournament "New Tournament" — wipes scores/history but keeps players,
 * mode, and (optionally) updates the point limit.
 */
export function newTournament(state: GameState, pointLimit: number | null): GameState {
  const kept = keepReadyPlayers(state);
  return {
    ...state,
    status: "lobby",
    winnerId: null,
    countdownEndsAt: null,
    wonAt: null,
    center: [],
    matchNumber: 1,
    pointLimit,
    scores: Object.fromEntries(kept.map((p) => [p.id, 0])),
    matchHistory: [],
    lastMatchPoints: null,
    championId: null,
    players: kept.map((p) => ({
      ...p,
      ready: p.isBot,
      readyForNext: false,
      piles: [],
      pileLocked: [],
      hand: [],
      openPileIndex: null,
      disconnectedAt: null,
      freeCards: false,
      freePileHolds: undefined,
    })),
  };
}

/* ============================ Inactive / Free Cards ============================ */

/** Grace window after disconnect before a player's piles become public. */
export const INACTIVE_GRACE_MS = 10_000;
/** Idle window: human player makes no gameplay action → marked disconnected. */
export const IDLE_BEFORE_DISCONNECT_MS = 10_000;
/** How long a free-card hold lasts before auto-releasing (mirrors center). */
export const FREE_CARD_HOLD_MS = 5_000;

/** Mark a player as currently disconnected. No-op if already inactive. */
export function markDisconnected(state: GameState, playerId: string): GameState {
  const players = state.players.map((p) => {
    if (p.id !== playerId) return p;
    if (p.disconnectedAt) return p;
    return { ...p, disconnectedAt: Date.now() };
  });
  return { ...state, players };
}

/** Clear the disconnected flag (player came back). Has no effect once the
 *  player has already been promoted to free-cards. */
export function markReconnected(state: GameState, playerId: string): GameState {
  const players = state.players.map((p) => {
    if (p.id !== playerId) return p;
    if (p.freeCards) return p;
    if (!p.disconnectedAt) return p;
    return { ...p, disconnectedAt: null };
  });
  return { ...state, players };
}

/** Stamp a player's last-active time. Also clears any idle-disconnected
 *  flag (returning to play before free-cards promotion). No-op once the
 *  player has been promoted to free-cards. */
export function markActive(state: GameState, playerId: string): GameState {
  const players = state.players.map((p) => {
    if (p.id !== playerId) return p;
    if (p.freeCards) return p;
    return { ...p, lastActiveAt: Date.now(), disconnectedAt: null };
  });
  return { ...state, players };
}

/** Promote idle players (no gameplay action for IDLE_BEFORE_DISCONNECT_MS)
 *  to disconnected. Skips bots, free-cards players, and already-disconnected
 *  players. Only runs while a match is in progress. */
export function tickIdle(state: GameState): GameState {
  if (state.status !== "playing") return state;
  const now = Date.now();
  let changed = false;
  const players = state.players.map((p) => {
    if (p.isBot) return p;
    if (p.freeCards) return p;
    if (p.disconnectedAt) return p;
    if (!p.lastActiveAt) return p;
    if (now - p.lastActiveAt < IDLE_BEFORE_DISCONNECT_MS) return p;
    changed = true;
    return { ...p, disconnectedAt: now };
  });
  if (!changed) return state;
  return { ...state, players };
}
 *  their open pile so all their cards live in piles. */
export function tickInactive(state: GameState): GameState {
  const now = Date.now();
  let changed = false;
  const players = state.players.map((p) => {
    if (p.freeCards) return p;
    if (!p.disconnectedAt) return p;
    if (now - p.disconnectedAt < INACTIVE_GRACE_MS) return p;
    changed = true;
    // Close any open pile so cards return to piles.
    let next = p;
    if (next.openPileIndex !== null) {
      const idx = next.openPileIndex;
      const newPiles = next.piles.map((pile, i) => (i === idx ? [...next.hand] : pile));
      next = { ...next, piles: newPiles, hand: [], openPileIndex: null };
    }
    return {
      ...next,
      freeCards: true,
      freePileHolds: new Array(next.piles.length).fill(null),
    };
  });
  if (!changed) return state;
  return { ...state, players };
}

function viewerHasAnyHold(state: GameState, viewerId: string): boolean {
  if (state.center.some((s) => s.heldBy === viewerId)) return true;
  for (const p of state.players) {
    if (!p.freePileHolds) continue;
    if (p.freePileHolds.some((h) => h?.heldBy === viewerId)) return true;
  }
  return false;
}

/** Hold a card from an inactive player's pile. The card stays in the pile
 *  but is marked as held with a 5s timer. Only one hold per viewer (across
 *  center + free-cards), and only one held card per pile. */
export function holdFreeCard(
  state: GameState,
  viewerId: string,
  ownerId: string,
  pileIndex: number,
  cardId: string,
): GameState {
  if (state.status !== "playing") return state;
  const viewer = state.players.find((p) => p.id === viewerId);
  if (!viewer || viewer.freeCards) return state;
  if (viewer.openPileIndex === null) return state;
  if (viewer.hand.length === 0) return state;
  if (viewer.hand.length > MAX_HAND) return state;
  if (viewerHasAnyHold(state, viewerId)) return state;
  const owner = state.players.find((p) => p.id === ownerId);
  if (!owner || !owner.freeCards) return state;
  const pile = owner.piles[pileIndex];
  if (!pile || !pile.some((c) => c.id === cardId)) return state;
  const holds = owner.freePileHolds ?? new Array(owner.piles.length).fill(null);
  if (holds[pileIndex]) return state;
  const newHolds = holds.slice();
  newHolds[pileIndex] = { cardId, heldBy: viewerId, heldUntil: Date.now() + FREE_CARD_HOLD_MS };
  const players = state.players.map((p) =>
    p.id === ownerId ? { ...p, freePileHolds: newHolds } : p,
  );
  return { ...state, players };
}

/** Complete a swap of the viewer's currently-held free card with one of
 *  their own hand cards. */
export function swapFreeCard(
  state: GameState,
  viewerId: string,
  handCardId: string,
): GameState {
  // Find the held free card
  let ownerId: string | null = null;
  let pileIndex = -1;
  let heldCardId: string | null = null;
  for (const p of state.players) {
    if (!p.freePileHolds) continue;
    const idx = p.freePileHolds.findIndex((h) => h?.heldBy === viewerId);
    if (idx !== -1) {
      ownerId = p.id;
      pileIndex = idx;
      heldCardId = p.freePileHolds[idx]!.cardId;
      break;
    }
  }
  if (!ownerId || !heldCardId) return state;
  const viewer = state.players.find((p) => p.id === viewerId);
  if (!viewer) return state;
  const handCard = viewer.hand.find((c) => c.id === handCardId);
  if (!handCard) return state;
  const owner = state.players.find((p) => p.id === ownerId)!;
  const pile = owner.piles[pileIndex];
  const heldCard = pile.find((c) => c.id === heldCardId);
  if (!heldCard) return state;
  const newOwnerPile = pile.map((c) => (c.id === heldCardId ? handCard : c));
  const newOwnerPiles = owner.piles.map((pl, i) => (i === pileIndex ? newOwnerPile : pl));
  const newHolds = (owner.freePileHolds ?? []).map((h, i) => (i === pileIndex ? null : h));
  const newViewerHand = viewer.hand.map((c) => (c.id === handCardId ? heldCard : c));
  const players = state.players.map((p) => {
    if (p.id === ownerId) return { ...p, piles: newOwnerPiles, freePileHolds: newHolds };
    if (p.id === viewerId) return { ...p, hand: newViewerHand };
    return p;
  });
  return { ...state, players };
}

/** Release any expired free-card holds. */
export function tickFreeCardHolds(state: GameState): GameState {
  const now = Date.now();
  let changed = false;
  const players = state.players.map((p) => {
    if (!p.freePileHolds) return p;
    let mutated = false;
    const newHolds = p.freePileHolds.map((h) => {
      if (h && h.heldUntil <= now) { mutated = true; return null; }
      return h;
    });
    if (!mutated) return p;
    changed = true;
    return { ...p, freePileHolds: newHolds };
  });
  if (!changed) return state;
  return { ...state, players };
}
