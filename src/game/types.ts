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
  /** 4-digit personal reentry code, used to rejoin this seat after disconnect. */
  reentryCode?: string;
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
  heldBy: string | null;
  heldUntil: number | null;
};

export type GameStatus = "lobby" | "countdown" | "playing" | "won";

export type GameMode = "standard" | "tournament";

/** A single completed match within a tournament. */
export type MatchRecord = {
  matchNumber: number;
  winnerId: string;
  winnerName: string;
  points: number;
  /** Map of playerId → points awarded this match (only winner > 0). */
  perPlayer: Record<string, number>;
};

export type GameState = {
  id: string;
  status: GameStatus;
  players: Player[];
  center: CenterSlot[]; // length 4
  countdownEndsAt: number | null;
  winnerId: string | null;
  startedAt: number | null;

  // ===== Tournament fields (always present; ignored in standard mode) =====
  mode: GameMode;
  /** Points needed to be declared champion. Null in standard mode. */
  pointLimit: number | null;
  /** 1-based current match number. */
  matchNumber: number;
  /** Total cumulative points per playerId across the tournament. */
  scores: Record<string, number>;
  /** Completed match results, oldest first. */
  matchHistory: MatchRecord[];
  /** Points the most recent match's winner earned (for the win overlay). */
  lastMatchPoints: number | null;
  /** PlayerId of tournament champion once pointLimit is reached. */
  championId: string | null;
};
