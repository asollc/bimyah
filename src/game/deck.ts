import type { Card, Rank, Suit } from "./types";

const RANKS: Rank[] = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const SUITS: Suit[] = ["♠", "♥", "♦", "♣"];

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      deck.push({ id: `${r}${s}`, rank: r, suit: s });
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
  center: Card[]; // 4 leftover
};

export function pilesPerPlayer(playerCount: number): number {
  if (playerCount === 2) return 6;
  if (playerCount === 3) return 4;
  return 3; // 4 players
}

export function deal(playerCount: number): DealResult {
  const deck = shuffle(buildDeck());
  const ppp = pilesPerPlayer(playerCount);

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

  // Remaining cards become the center. We need exactly 4 face up.
  const remainder = deck.slice(idx);
  // Spec: 4 leftover. For 3-player (16/player ×3 = 48), 4 left. For 2-player (24×2=48), 4 left. For 4-player (12×4=48), 4 left.
  const center = remainder.slice(0, 4);

  return { piles, center };
}

export function isFourOfAKind(cards: Card[]): boolean {
  if (cards.length !== 4) return false;
  return cards.every((c) => c.rank === cards[0].rank);
}
