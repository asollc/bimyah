import type { GameState, Player, PlayerColor, Card } from "./types";
import { deal, isFourOfAKind, pilesPerPlayer } from "./deck";

export const PLAYER_COLORS: PlayerColor[] = ["green", "red", "blue", "yellow"];
export const HOLD_DURATION_MS = 5000;
export const COUNTDOWN_MS = 3000;
export const MAX_HAND = 5;

export function createInitialGame(
  id: string,
  playerSpecs: Array<{ id: string; name: string; isBot: boolean }>,
): GameState {
  const players: Player[] = playerSpecs.map((p, i) => ({
    id: p.id,
    name: p.name,
    color: PLAYER_COLORS[i],
    isBot: p.isBot,
    ready: false,
    piles: [],
    pileLocked: [],
    hand: [],
    openPileIndex: null,
  }));
  return {
    id,
    status: "lobby",
    players,
    center: [],
    countdownEndsAt: null,
    winnerId: null,
    startedAt: null,
  };
}

export function setReady(state: GameState, playerId: string, ready: boolean): GameState {
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
    center: dealt.center.map((c) => ({ card: c, heldBy: null, heldUntil: null })),
    status: "countdown",
    countdownEndsAt: Date.now() + COUNTDOWN_MS,
  };
}

export function tickCountdown(state: GameState): GameState {
  if (state.status !== "countdown") return state;
  if (state.countdownEndsAt && Date.now() >= state.countdownEndsAt) {
    return { ...state, status: "playing", startedAt: Date.now(), countdownEndsAt: null };
  }
  return state;
}

/**
 * Open a pile: cards from pile go into hand, pile becomes empty (still face-down slot).
 * If another pile is open, close it first.
 */
export function openPile(state: GameState, playerId: string, pileIndex: number): GameState {
  if (state.status !== "playing") return state;
  const players = state.players.map((p) => {
    if (p.id !== playerId) return p;
    if (p.pileLocked[pileIndex]) return p;
    let next = p;
    // close any currently open pile
    if (next.openPileIndex !== null && next.openPileIndex !== pileIndex) {
      const newPiles = next.piles.map((pile, i) =>
        i === next.openPileIndex ? [...next.hand] : pile,
      );
      next = { ...next, piles: newPiles, hand: [], openPileIndex: null };
    }
    if (next.openPileIndex === pileIndex) return next; // already open
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

/**
 * Player picks up a center card. The card stays "in" the slot conceptually; we mark heldBy + heldUntil
 * and the player's hand temporarily gets the card. They MUST swap one of their hand cards to fulfill.
 * Constraint: hand can hold up to 5 cards.
 */
export function holdCenterCard(
  state: GameState,
  playerId: string,
  centerIndex: number,
): GameState {
  if (state.status !== "playing") return state;
  const slot = state.center[centerIndex];
  if (!slot || !slot.card || slot.heldBy) return state;
  // player must be examining a pile (have hand)
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.openPileIndex === null) return state;
  if (player.hand.length >= MAX_HAND) return state;
  // also one hold at a time per player
  const holdsByPlayer = state.center.some((s) => s.heldBy === playerId);
  if (holdsByPlayer) return state;
  // Move card from center to player's hand
  const newHand = [...player.hand, slot.card];
  const players = state.players.map((p) => (p.id === playerId ? { ...p, hand: newHand } : p));
  const center = state.center.map((s, i) =>
    i === centerIndex
      ? { card: null, heldBy: playerId, heldUntil: Date.now() + HOLD_DURATION_MS }
      : s,
  );
  return { ...state, players, center };
}

/**
 * Player swaps: returns one of their hand cards into the held center slot.
 * If the player gave back the same card they picked up, that's also valid.
 */
export function swapCard(
  state: GameState,
  playerId: string,
  cardId: string,
): GameState {
  const heldIdx = state.center.findIndex((s) => s.heldBy === playerId);
  if (heldIdx === -1) return state;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const card = player.hand.find((c) => c.id === cardId);
  if (!card) return state;
  // remove card from hand
  const newHand = player.hand.filter((c) => c.id !== cardId);
  // The hand must remain valid (<= openPile original size; max 5 anyway)
  const players = state.players.map((p) => (p.id === playerId ? { ...p, hand: newHand } : p));
  const center = state.center.map((s, i) =>
    i === heldIdx ? { card, heldBy: null, heldUntil: null } : s,
  );
  return { ...state, players, center };
}

/**
 * Release a hold (timeout): return the previously-held card from player's hand back to center.
 * The "previously held" card is the LAST one they added — but we don't track that explicitly;
 * we track via heldBy: when a hold expires, return ONE arbitrary held card. We approximate by
 * checking the hand for cards that aren't part of the originally opened pile.
 */
export function releaseHold(state: GameState, centerIndex: number): GameState {
  const slot = state.center[centerIndex];
  if (!slot.heldBy) return state;
  const playerId = slot.heldBy;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;

  // The held card is the last card added to hand (we always append on holdCenterCard).
  const heldCard = player.hand[player.hand.length - 1];
  if (!heldCard) {
    // Just clear the hold marker
    const center = state.center.map((s, i) =>
      i === centerIndex ? { ...s, heldBy: null, heldUntil: null } : s,
    );
    return { ...state, center };
  }
  const newHand = player.hand.slice(0, -1);
  const players = state.players.map((p) => (p.id === playerId ? { ...p, hand: newHand } : p));
  const center = state.center.map((s, i) =>
    i === centerIndex
      ? { card: heldCard, heldBy: null, heldUntil: null }
      : s,
  );
  return { ...state, players, center };
}

/**
 * Tick: process expired holds.
 */
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

/**
 * SET: lock the currently open pile if hand has 4-of-a-kind.
 */
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

export function declareBimyah(state: GameState, playerId: string): GameState {
  if (!canDeclareBimyah(state, playerId)) return state;
  return { ...state, status: "won", winnerId: playerId };
}
