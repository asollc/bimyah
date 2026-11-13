import type { Card, Rank, Suit } from "./types";

const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];

/**
 * Build one or more standard 52-card decks. Card IDs are tagged with the
 * deck index (e.g. `A♠#0`, `A♠#1`) so duplicates from a second deck remain
 * unique. Four-of-a-kind detection is rank-based and unaffected.
 */
export function buildDeck(deckCount: number = 1): Card[] {
  const deck: Card[] = [];
  for (let d = 0; d < deckCount; d++) {
    for (const r of RANKS) {
      for (const s of SUITS) {
        deck.push({ id: `${r}${s}#${d}`, rank: r, suit: s });
      }
    }
  }
  return deck;
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type DealResult = {
  piles: Card[][][]; // per player → array of piles → array of 4 cards
  center: Card[];
};

/** How many decks (52 cards each) to use for a given player count. */
export function deckCountFor(playerCount: number): number {
  return playerCount >= 5 ? 2 : 1;
}

/** Cards in the center face-up at game start. */
export function centerCountFor(playerCount: number): number {
  // 1-deck modes already use 4. With two decks (5-8P) we use 8 except 5P.
  if (playerCount <= 4) return 4;
  if (playerCount === 5) return 4;
  return 8;
}

export function pilesPerPlayer(playerCount: number): number {
  if (playerCount === 2) return 6;
  if (playerCount === 3) return 4;
  if (playerCount === 4) return 3;
  // 5-8 player layouts (per plan):
  // 5P → 5 piles each (100 cards) + 4 center
  // 6P → 4 piles each (96)        + 8 center
  // 7P → 4 piles each (112) — uses extras
  // 8P → 3 piles each (96)        + 8 center
  if (playerCount === 5) return 5;
  if (playerCount === 6) return 4;
  if (playerCount === 7) return 4;
  return 3; // 8
}

export function deal(playerCount: number): DealResult {
  const baseDeck = buildDeck(deckCountFor(playerCount));
  // 7P needs 7×4×4 + 8 center = 120 cards; two decks only give 104.
  // Per plan, add a 3rd-deck copy of A/J/Q/K (16 extra cards = 120 total).
  if (playerCount === 7) {
    const extras: Card[] = [];
    const extraRanks: Rank[] = ["A", "J", "Q", "K"];
    for (const r of extraRanks) {
      for (const s of SUITS) {
        extras.push({ id: `${r}${s}#2`, rank: r, suit: s });
      }
    }
    baseDeck.push(...extras);
  }
  const deck = shuffle(baseDeck);
  const ppp = pilesPerPlayer(playerCount);
  const centerCount = centerCountFor(playerCount);

  const piles: Card[][][] = [];
  let idx = 0;
  for (let p = 0; p < playerCount; p++) {
    const playerPiles: Card[][] = [];
    for (let i = 0; i < ppp; i++) {
      playerPiles.push(deck.slice(idx, idx + 4));
      idx += 4;
    }
    piles.push(playerPiles);
  }

  const remainder = deck.slice(idx);
  const center = remainder.slice(0, centerCount);

  return { piles, center };
}

export function isFourOfAKind(cards: Card[]): boolean {
  if (cards.length !== 4) return false;
  return cards.every((c) => c.rank === cards[0].rank);
}
