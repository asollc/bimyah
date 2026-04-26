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
  // The card currently resting face-up in the center slot. While a player has
  // tapped it ("holding"), the card stays here visually — it is NOT moved into
  // their hand until they complete the swap by picking a hand card.
  card: Card | null;
  // playerId currently holding (after tapping). The slot's `card` is still the
  // held card; we just block other players from grabbing it.
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
