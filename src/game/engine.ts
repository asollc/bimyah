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
 * Player taps a center card to "hold" it. The card visually stays in the
 * center slot — it is NOT added to the hand. The slot is marked with the
 * player's id and a 5s expiry. The player must complete the swap by tapping
 * one of their hand cards before the timer expires.
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
  if (player.hand.length === 0) return state; // need at least one card to swap with
  if (player.hand.length > MAX_HAND) return state;
  // also one hold at a time per player
  const holdsByPlayer = state.center.some((s) => s.heldBy === playerId);
  if (holdsByPlayer) return state;
  const center = state.center.map((s, i) =>
    i === centerIndex
      ? { ...s, heldBy: playerId, heldUntil: Date.now() + HOLD_DURATION_MS }
      : s,
  );
  return { ...state, center };
}

/**
 * Player completes the swap: their chosen hand card replaces the held center
 * card, and the previously-held center card is added to their hand.
 */
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
  // Replace the chosen hand card with the previously-held center card,
  // preserving the slot order in the hand.
  const newHand = player.hand.map((c) => (c.id === cardId ? centerCard : c));
  const players = state.players.map((p) => (p.id === playerId ? { ...p, hand: newHand } : p));
  const center = state.center.map((s, i) =>
    i === heldIdx ? { card: handCard, heldBy: null, heldUntil: null } : s,
  );
  return { ...state, players, center };
}

/**
 * Release a hold (timeout): the card never left the slot, so we just clear
 * the hold markers and let anyone tap it again.
 */
export function releaseHold(state: GameState, centerIndex: number): GameState {
  const slot = state.center[centerIndex];
  if (!slot.heldBy) return state;
  const center = state.center.map((s, i) =>
    i === centerIndex ? { ...s, heldBy: null, heldUntil: null } : s,
  );
  return { ...state, center };
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
