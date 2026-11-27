import { createInitialGame, beginCountdown } from "./engine";
import type { Card, GameState, Rank, Suit } from "./types";

/**
 * Scripted states for the Guided Tutorial (Ronya 2026-11-17).
 *
 * The standard room deal is fully scripted so the guided path always
 * works: the player's first set (Kings) can be built entirely from
 * their own piles through the center, and the Free Cards set (Queens)
 * is completed with the Queen in the bot's last pile. The bot stays frozen
 * until the Free Play chapter, so none of these cards can move early.
 *
 * The tournament deal is scripted too (Ronya 2026-11-18): a random
 * deal made the live free-play match drag, so the player's piles hold
 * two full sets (Kings and Queens) mixed between them, plus three 9s
 * whose fourth sits on the table. Every pile can be completed fast
 * from the player's own cards and the table; the bots get mixed junk
 * with no three of a kind anywhere.
 */

export const TUT_ME_ID = "tut_me";
export const TUT_BOT_ID = "tut_bot";

function C(rank: Rank, suit: Suit): Card {
  return { id: `tut_${rank}${suit}`, rank, suit };
}

function slot(card: Card) {
  return { card, heldBy: null, heldUntil: null, placedAt: Date.now() };
}

export function buildStandardTutorialState(playerName: string): GameState {
  const base = createInitialGame(
    "tutorial",
    [
      { id: TUT_ME_ID, name: playerName, isBot: false },
      { id: TUT_BOT_ID, name: "Bot", isBot: true },
    ],
    { mode: "standard", maxSeats: 2 },
  );
  const mePiles: Card[][] = [
    [C("K", "♠"), C("K", "♥"), C("K", "♦"), C("7", "♣")],
    [C("K", "♣"), C("3", "♠"), C("5", "♦"), C("9", "♥")],
    [C("Q", "♠"), C("Q", "♥"), C("Q", "♣"), C("8", "♦")],
    [C("J", "♠"), C("J", "♥"), C("J", "♦"), C("5", "♣")],
    [C("9", "♠"), C("9", "♦"), C("9", "♣"), C("2", "♥")],
    [C("A", "♠"), C("A", "♥"), C("A", "♦"), C("10", "♣")],
  ];
  const botPiles: Card[][] = [
    [C("4", "♠"), C("6", "♥"), C("8", "♣"), C("10", "♦")],
    [C("3", "♦"), C("4", "♣"), C("6", "♣"), C("7", "♦")],
    [C("2", "♠"), C("7", "♥"), C("10", "♠"), C("J", "♣")],
    [C("8", "♥"), C("5", "♠"), C("3", "♥"), C("6", "♦")],
    [C("A", "♣"), C("2", "♦"), C("7", "♠"), C("10", "♥")],
    // The Queen lives in the LAST pile on purpose: free piles render
    // as rows in pile order above the table, so the last pile is the
    // row closest to the table and never gets cut off at the top of
    // the screen during the Free Cards lesson (Ronya 2026-11-18).
    [C("Q", "♦"), C("3", "♣"), C("6", "♠"), C("4", "♥")],
  ];
  const players = base.players.map((p) => {
    const piles = p.isBot ? botPiles : mePiles;
    return {
      ...p,
      ready: true,
      piles,
      pileLocked: piles.map(() => false),
      hand: [],
      openPileIndex: null,
      lastActiveAt: Date.now(),
    };
  });
  return {
    ...base,
    status: "playing",
    startedAt: Date.now(),
    players,
    center: [slot(C("4", "♦")), slot(C("8", "♠")), slot(C("5", "♥")), slot(C("2", "♣"))],
    inactivityDisabled: true,
  };
}

/**
 * Intro example states (Ronya 2026-11-18): while the intro explains
 * the objective, the room itself shows the example. "set4" opens the
 * player's first pile with four Kings in hand (the SET and SORT
 * buttons appear under the piles, exactly as in a real game); the
 * King of Clubs comes out of the second pile and the 7 of Clubs
 * parks at the bottom of it. "allSet" locks every one of the
 * player's piles with a genuine four of a kind, so the BIMYAH!
 * button lights up enabled.
 */
export function buildIntroSetState(playerName: string): GameState {
  const s = buildStandardTutorialState(playerName);
  const players = s.players.map((p) => {
    if (p.isBot) return p;
    const piles = p.piles.map((pile, i) => {
      if (i === 0) return [];
      if (i === 1) return [C("3", "♠"), C("5", "♦"), C("9", "♥"), C("7", "♣")];
      return pile;
    });
    return {
      ...p,
      piles,
      hand: [C("K", "♠"), C("K", "♥"), C("K", "♦"), C("K", "♣")],
      openPileIndex: 0,
    };
  });
  return { ...s, players };
}

export function buildIntroAllSetState(playerName: string): GameState {
  const s = buildStandardTutorialState(playerName);
  const sets: Card[][] = [
    [C("K", "♠"), C("K", "♥"), C("K", "♦"), C("K", "♣")],
    [C("Q", "♠"), C("Q", "♥"), C("Q", "♦"), C("Q", "♣")],
    [C("J", "♠"), C("J", "♥"), C("J", "♦"), C("J", "♣")],
    [C("9", "♠"), C("9", "♥"), C("9", "♦"), C("9", "♣")],
    [C("A", "♠"), C("A", "♥"), C("A", "♦"), C("A", "♣")],
    [C("3", "♠"), C("3", "♥"), C("3", "♦"), C("3", "♣")],
  ];
  const players = s.players.map((p) => {
    if (p.isBot) return p;
    return {
      ...p,
      piles: sets,
      pileLocked: sets.map(() => true),
      hand: [],
      openPileIndex: null,
    };
  });
  return { ...s, players };
}

/**
 * Demo rooms for the Setup topic (Ronya 2026-11-18): as the voice
 * gives the pile and table counts for each table size, the room
 * itself rebuilds at that size. The deal comes from the engine's own
 * createInitialGame + beginCountdown, so the pile counts and center
 * counts shown are the real rules, not a mock: 2 players get 6 piles
 * each, 3/6/7 get 4, 5 gets 5, 4/8 get 3; the center holds 4 cards
 * up to 5 players and 8 cards at 6 to 8 players. Bots stay frozen.
 */
export function buildDemoRoomState(playerName: string, seats: number): GameState {
  const specs = [
    { id: TUT_ME_ID, name: playerName, isBot: false },
    ...Array.from({ length: seats - 1 }, (_, i) => ({
      id: `tut_demo_bot${i + 1}`,
      name: `Bot ${i + 1}`,
      isBot: true,
    })),
  ];
  const base = createInitialGame("tutorial-demo", specs, {
    mode: "standard",
    maxSeats: seats,
  });
  const ready = {
    ...base,
    players: base.players.map((p) => ({ ...p, ready: true })),
  };
  const dealt = beginCountdown(ready);
  return {
    ...dealt,
    status: "playing",
    startedAt: Date.now(),
    inactivityDisabled: true,
  };
}

export function buildTournamentTutorialState(playerName: string): GameState {
  const base = createInitialGame(
    "tutorial-tournament",
    [
      { id: TUT_ME_ID, name: playerName, isBot: false },
      { id: TUT_BOT_ID, name: "Bot 1", isBot: true },
      { id: "tut_bot2", name: "Bot 2", isBot: true },
      { id: "tut_bot3", name: "Bot 3", isBot: true },
    ],
    { mode: "tournament", pointLimit: 5, maxSeats: 4 },
  );
  const ready = {
    ...base,
    players: base.players.map((p) => ({ ...p, ready: true })),
  };
  const dealt = beginCountdown(ready);
  const pilesById: Record<string, Card[][]> = {
    [TUT_ME_ID]: [
      [C("K", "♠"), C("K", "♥"), C("Q", "♠"), C("Q", "♥")],
      [C("K", "♦"), C("Q", "♦"), C("9", "♠"), C("3", "♦")],
      [C("K", "♣"), C("Q", "♣"), C("9", "♦"), C("9", "♣")],
    ],
    [TUT_BOT_ID]: [
      [C("A", "♠"), C("2", "♠"), C("5", "♠"), C("7", "♠")],
      [C("A", "♥"), C("3", "♠"), C("6", "♥"), C("10", "♠")],
      [C("J", "♠"), C("4", "♠"), C("8", "♠"), C("5", "♥")],
    ],
    tut_bot2: [
      [C("A", "♦"), C("2", "♥"), C("5", "♦"), C("7", "♥")],
      [C("3", "♥"), C("6", "♦"), C("10", "♥"), C("J", "♥")],
      [C("4", "♦"), C("8", "♥"), C("5", "♣"), C("A", "♣")],
    ],
    tut_bot3: [
      [C("2", "♦"), C("3", "♣"), C("4", "♣"), C("7", "♦")],
      [C("6", "♣"), C("8", "♣"), C("10", "♦"), C("J", "♦")],
      [C("7", "♣"), C("8", "♦"), C("10", "♣"), C("J", "♣")],
    ],
  };
  const players = dealt.players.map((p) => {
    const piles = pilesById[p.id];
    return piles
      ? {
          ...p,
          piles,
          pileLocked: piles.map(() => false),
          hand: [],
          openPileIndex: null,
        }
      : p;
  });
  return {
    ...dealt,
    players,
    center: [slot(C("9", "♥")), slot(C("2", "♣")), slot(C("4", "♥")), slot(C("6", "♠"))],
    inactivityDisabled: true,
  };
}
