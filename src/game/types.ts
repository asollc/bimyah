export type Suit = "♠" | "♥" | "♦" | "♣";
export type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";

export type Card = {
  id: string; // unique per card
  rank: Rank;
  suit: Suit;
};

export type PlayerColor =
  | "red"
  | "blue"
  | "yellow"
  | "green"
  | "purple"
  | "orange"
  | "cyan"
  | "pink";

export type Player = {
  id: string;
  name: string;
  color: PlayerColor;
  isBot: boolean;
  ready: boolean;
  /** Optional avatar image URL (Bimyah!+ only). */
  avatarUrl?: string | null;
  /** Optional custom card-back image URL (Bimyah!+ only). */
  cardBackUrl?: string | null;
  /** Optional per-pile card-back image URLs from the player's equipped
   *  "active card slots" (length up to 6). Index i maps to pile i; if a
   *  slot is null/missing, the renderer falls back to `cardBackUrl` and
   *  then the default image. */
  cardBackUrls?: (string | null)[] | null;
  /** Equipped decor URLs (resolved at game creation time). Title and badge
   *  render next to the player's name everywhere; victory FX overlays the
   *  win screen for the winning player only; background, tabletop and table
   *  art only render in-game when this player is the host. */
  titleUrl?: string | null;
  badgeUrl?: string | null;
  /** Optional extra badge rendered to the right of `badgeUrl` (e.g. founding member icon). */
  specialBadgeUrl?: string | null;
  victoryUrl?: string | null;
  backgroundUrl?: string | null;
  tabletopUrl?: string | null;
  tableArtUrl?: string | null;
  /** 4-digit personal reentry code, used to rejoin this seat after disconnect. */
  reentryCode?: string;
  // piles[i] is array of cards still face-down. If completed (4-of-a-kind set), it's locked.
  piles: Card[][];
  // pileLocked[i] true once the player has SET that pile.
  pileLocked: boolean[];
  // hand: cards currently being examined from openPileIndex (max 5)
  hand: Card[];
  openPileIndex: number | null;
  /** True when this player has tapped "ready" on the post-match win screen.
   *  Used by the host to decide who to keep when starting the next match. */
  readyForNext?: boolean;
  /** Host-tracked: ms timestamp of last disconnect, null if currently connected. */
  disconnectedAt?: number | null;
  /** Host-tracked: true once the player has been disconnected past the grace
   *  period. Their piles become public for swapping. */
  freeCards?: boolean;
  /** Per-pile hold state for free-card swaps (only used when freeCards = true).
   *  null entry means no card held in that pile. */
  freePileHolds?: Array<{ cardId: string; heldBy: string; heldUntil: number } | null>;
  /** Host-tracked: ms timestamp of this player's last gameplay action.
   *  Used to detect idle players (10s no action → disconnected). */
  lastActiveAt?: number | null;
};

export type CenterSlot = {
  card: Card | null;
  heldBy: string | null;
  heldUntil: number | null;
  /** Timestamp (ms) when the current card was placed in this slot. */
  placedAt: number | null;
};

export type GameStatus = "lobby" | "countdown" | "playing" | "won";

/** A non-playing observer of a room. Stays through every match until they
 *  leave. Limited to MAX_SPECTATORS per room. */
export type Spectator = {
  id: string;
  name: string;
  avatarUrl?: string | null;
};

export type ChatChannel = "match" | "spectator";

export type ChatMessage = {
  id: string;
  channel: ChatChannel;
  authorId: string;
  authorName: string;
  avatarUrl?: string | null;
  color?: PlayerColor | null;
  isSpectator: boolean;
  text: string;
  ts: number;
};

export type GameMode = "standard" | "tournament" | "training";

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
  /** Maximum number of seats this lobby allows (2-8). Defaults to 4. */
  maxSeats?: number;
  /** Player id of the host. Only the host may start the next match. */
  hostId?: string;
  /** Timestamp (ms) when the current match was won. Used to gate restarts. */
  wonAt?: number | null;
  /** Non-playing observers currently watching the room. */
  spectators?: Spectator[];
  /** Chat messages (both match and spectator channels). Capped to last 200. */
  chat?: ChatMessage[];
  /** Host toggle: when true, idle/inactivity timers do not promote players
   *  to disconnected or free-cards. Defaults to false (timers enabled). */
  inactivityDisabled?: boolean;
};
