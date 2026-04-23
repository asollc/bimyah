export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export type Card = {
  id: string; // unique per card
  rank: Rank;
  suit: Suit;
};

export type PlayerColor = "red" | "blue" | "yellow" | "green";

export type Player = {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  ready: boolean;
  // piles[i] is array of cards still face-down. If completed (4-of-a-kind set), it's locked.
  piles: Card[][];
  // pileLocked[i] true once the player has SET that pile.
  pileLocked: boolean[];
  // hand: cards currently being examined from openPileIndex (max 5)
  hand: Card[];
  openPileIndex: number | null;
};

export type CenterSlot = {
  card: Card | null;
  // playerId currently holding (after picking up)
  heldBy: string | null;
  heldUntil: number | null; // ms timestamp when 5s expires
};

export type GameStatus = "lobby" | "countdown" | "playing" | "won";

export type GameState = {
  id: string;
  status: GameStatus;
  players: Player[];
  center: CenterSlot[]; // length 4
  countdownEndsAt: number | null;
  winnerId: string | null;
  startedAt: number | null;
};
