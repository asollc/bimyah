import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameState } from "@/game/types";
import { TUT_BOT_ID, TUT_ME_ID } from "@/game/tutorialState";
import { sfx, sharedAudioContext } from "@/game/sfx";
import { tutVoiceUrl } from "@/game/tutorialVoice";
import iconSpeaker from "@/assets/icons3d/speaker-3d-v2.webp";
import iconSpeakerMuted from "@/assets/icons3d/speaker-muted-3d-v2.webp";
import iconNext from "@/assets/icons3d/next-3d-v2.webp";

/**
 * Guided Tutorial overlay (Ronya 2026-11-17, revised same night).
 *
 * A text panel walks the player through five topics inside a scripted
 * room. The overlay never owns game state: it reads the room state to
 * know when an instructed action is done, publishes an input gate plus
 * the current step's move permit to the route (which enforces them in
 * the state setter), and highlights exactly the element each step talks
 * about with a green rectangular outline.
 */

export type TutGate = "locked" | "cog" | "settings" | "table" | "free" | "scoreboard";
export type TutTopicId =
  | "setup"
  | "gameplay"
  | "tournament"
  | "hosting"
  | "controls";
/** May this state change happen during the guided Gameplay steps? */
export type TutPermit = (next: GameState) => boolean;

export const TUT_TOPICS: Array<{ id: TutTopicId; label: string }> = [
  { id: "setup", label: "Setup" },
  { id: "gameplay", label: "Gameplay" },
  { id: "tournament", label: "Tournament" },
  { id: "hosting", label: "Hosting" },
  { id: "controls", label: "Controls" },
];

/* ---------- element selectors for highlights and gestures ---------- */

const SEL = {
  cog: 'button[aria-label="Settings"]',
  mypiles: '[data-seat-me="1"] [data-piles="1"]',
  myhand: '[data-seat-me="1"] [data-hand="1"]',
  myset: '[data-seat-me="1"] [data-action="set"]',
  bimyah: '[data-action="bimyah"]',
  mysort: '[data-seat-me="1"] [aria-label="Sort hand by rank"]',
  // The visible wooden disc itself, NOT the [data-center-table]
  // wrapper: the wrapper's layout box stays screen-centered while the
  // disc renders shifted by the center offset, so outlining the
  // wrapper framed empty space below the table (Ronya 2026-11-18).
  table: '[data-table-disc="1"]',
  botSeat: `[data-seat-id="${TUT_BOT_ID}"]`,
  mySeat: '[data-seat-me="1"]',
  scoreboard: '[data-scoreboard="1"]',
  scoreboardClose: '[data-scoreboard-overlay="1"] [data-scoreboard-close="1"]',
  setHome: '[data-settings-overlay] button[aria-label="End match"]',
  setMute: '[data-settings-overlay] button[aria-label="Mute"]',
  setAutosort: '[data-settings-overlay] [data-settings-autosort="1"]',
  setKeybinds: '[data-settings-overlay] [data-settings-keybinds="1"]',
  setInactivity: '[data-settings-overlay] [data-settings-inactivity="1"]',
  setClose: '[data-settings-overlay] button[aria-label="Close settings"]',
  centerSlot: (i: number) => `[data-center-slot="${i}"]`,
  pile: (i: number) =>
    `[data-seat-me="1"] [data-piles="1"] > :nth-child(${i + 1})`,
  handCard: (label: string) =>
    `[data-seat-me="1"] [data-hand="1"] button[aria-label="${label}"]`,
  freeCard: (label: string) =>
    `[data-center-table="1"] button[aria-label="${label}"]`,
};

/* ---------- the scripted journey (mirrors tutorialState.ts) ---------- */

const ME_PILES: string[][] = [
  ["tut_K♠", "tut_K♥", "tut_K♦", "tut_7♣"],
  ["tut_K♣", "tut_3♠", "tut_5♦", "tut_9♥"],
  ["tut_Q♠", "tut_Q♥", "tut_Q♣", "tut_8♦"],
  ["tut_J♠", "tut_J♥", "tut_J♦", "tut_5♣"],
  ["tut_9♠", "tut_9♦", "tut_9♣", "tut_2♥"],
  ["tut_A♠", "tut_A♥", "tut_A♦", "tut_10♣"],
];
const BOT_PILES: string[][] = [
  ["tut_4♠", "tut_6♥", "tut_8♣", "tut_10♦"],
  ["tut_3♦", "tut_4♣", "tut_6♣", "tut_7♦"],
  ["tut_2♠", "tut_7♥", "tut_10♠", "tut_J♣"],
  ["tut_8♥", "tut_5♠", "tut_3♥", "tut_6♦"],
  ["tut_A♣", "tut_2♦", "tut_7♠", "tut_10♥"],
  ["tut_Q♦", "tut_3♣", "tut_6♠", "tut_4♥"],
];
const CENTER_TAIL = ["tut_8♠", "tut_5♥", "tut_2♣"];
const KINGS_OPEN = ["tut_K♠", "tut_K♥", "tut_K♦", "tut_4♦"];
const KINGS_FULL = ["tut_K♠", "tut_K♥", "tut_K♦", "tut_K♣"];
const PILE1_AFTER = ["tut_7♣", "tut_3♠", "tut_5♦", "tut_9♥"];
const QUEENS_FULL = ["tut_Q♠", "tut_Q♥", "tut_Q♣", "tut_Q♦"];

type JourneyStage = {
  p0: string[];
  c0: string;
  p1: string[];
  p2: string[];
  lock0: boolean;
  lock2: boolean;
  botFree: boolean;
  /* Which of my piles is open at this stage (null = none). The
   * matcher used to ignore this, so at the first step any of the
   * first three piles could be opened and still count as "on the
   * journey" (Ronya 2026-11-18: he opened the third pile when told
   * to open the first). Every guided state now pins the open pile,
   * including the intermediate "pile opened, not yet swapped"
   * stages, so opening the wrong pile matches no stage and the
   * route guard rejects it. */
  open: number | null;
};
const JOURNEY: JourneyStage[] = [
  { p0: ME_PILES[0], c0: "tut_4♦", p1: ME_PILES[1], p2: ME_PILES[2], lock0: false, lock2: false, botFree: false, open: null },
  { p0: ME_PILES[0], c0: "tut_4♦", p1: ME_PILES[1], p2: ME_PILES[2], lock0: false, lock2: false, botFree: false, open: 0 },
  { p0: KINGS_OPEN, c0: "tut_7♣", p1: ME_PILES[1], p2: ME_PILES[2], lock0: false, lock2: false, botFree: false, open: 0 },
  { p0: KINGS_OPEN, c0: "tut_7♣", p1: ME_PILES[1], p2: ME_PILES[2], lock0: false, lock2: false, botFree: false, open: 1 },
  { p0: KINGS_OPEN, c0: "tut_K♣", p1: PILE1_AFTER, p2: ME_PILES[2], lock0: false, lock2: false, botFree: false, open: 1 },
  { p0: KINGS_OPEN, c0: "tut_K♣", p1: PILE1_AFTER, p2: ME_PILES[2], lock0: false, lock2: false, botFree: false, open: 0 },
  { p0: KINGS_FULL, c0: "tut_4♦", p1: PILE1_AFTER, p2: ME_PILES[2], lock0: false, lock2: false, botFree: false, open: 0 },
  { p0: KINGS_FULL, c0: "tut_4♦", p1: PILE1_AFTER, p2: ME_PILES[2], lock0: true, lock2: false, botFree: false, open: null },
  { p0: KINGS_FULL, c0: "tut_4♦", p1: PILE1_AFTER, p2: ME_PILES[2], lock0: true, lock2: false, botFree: true, open: null },
  { p0: KINGS_FULL, c0: "tut_4♦", p1: PILE1_AFTER, p2: ME_PILES[2], lock0: true, lock2: false, botFree: true, open: 2 },
  { p0: KINGS_FULL, c0: "tut_4♦", p1: PILE1_AFTER, p2: QUEENS_FULL, lock0: true, lock2: false, botFree: true, open: 2 },
  { p0: KINGS_FULL, c0: "tut_4♦", p1: PILE1_AFTER, p2: QUEENS_FULL, lock0: true, lock2: true, botFree: true, open: null },
];

const meOf = (s: GameState) => s.players.find((p) => p.id === TUT_ME_ID);
const botOf = (s: GameState) => s.players.find((p) => p.id === TUT_BOT_ID);
function sameSet(a: string[], b: string[]) {
  if (a.length !== b.length) return false;
  return [...a].sort().join("|") === [...b].sort().join("|");
}
function eqIds(a: string[], b: string[]) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

function stageMatches(s: GameState, j: JourneyStage): boolean {
  const m = meOf(s);
  const b = botOf(s);
  if (!m || !b) return false;
  if (s.status !== "playing") return false;
  // My piles 0-2, counting the open pile's cards (they sit in my hand).
  const mine = m.piles.map((pile) => pile.map((c) => c.id));
  const handIds = m.hand.map((c) => c.id);
  const withHand = [0, 1, 2].map((i) =>
    m.openPileIndex === i ? [...mine[i], ...handIds] : mine[i],
  );
  if (m.openPileIndex !== null && m.openPileIndex > 2) return false;
  if (m.openPileIndex !== j.open) return false;
  if (!sameSet(withHand[0], j.p0)) return false;
  if (!sameSet(withHand[1], j.p1)) return false;
  if (!sameSet(withHand[2], j.p2)) return false;
  for (let i = 3; i < 6; i++) if (!eqIds(mine[i], ME_PILES[i])) return false;
  if (m.pileLocked[0] !== j.lock0 || m.pileLocked[2] !== j.lock2) return false;
  if (m.pileLocked.some((l, i) => l && i !== 0 && i !== 2)) return false;
  // The table: slot 0 follows the journey, the rest never change.
  if (s.center[0]?.card?.id !== j.c0) return false;
  for (let i = 1; i < 4; i++) if (s.center[i]?.card?.id !== CENTER_TAIL[i - 1]) return false;
  // The bot: frozen and scripted until it goes free on cue.
  if (b.hand.length > 0) return false;
  if (!!b.freeCards !== j.botFree) return false;
  const botPiles = b.piles.map((pile) => pile.map((c) => c.id));
  return botPiles.every((ids, i) => {
    if (eqIds(ids, BOT_PILES[i])) return true;
    // After the Free Cards swap, the player's 8 sits where the Queen was.
    return j.botFree && i === 5 && eqIds(ids, ["tut_8♦", ...BOT_PILES[5].slice(1)]);
  });
}

/** Highest journey stage the state matches, or -1 when off the path. */
export function stageOf(s: GameState): number {
  for (let k = JOURNEY.length - 1; k >= 0; k--) {
    if (stageMatches(s, JOURNEY[k])) return k;
  }
  return -1;
}
/** Permit: the state is on the guided path, at or before this stage. */
/* Cheap fingerprint of the parts of the game state a guided action
 * can change (holds excluded, they expire on their own). Used to
 * tell "the player just did something on this card" apart from
 * "this card was already complete when the player arrived". */
export function stateSig(s: GameState): string {
  return JSON.stringify({
    st: s.status,
    ch: s.championId ?? null,
    c: s.center.map((slot) => slot.card?.id ?? null),
    p: s.players.map((p) => [
      p.piles,
      p.hand,
      p.openPileIndex,
      p.pileLocked,
      p.freeCards,
    ]),
  });
}

export function onJourney(maxStage: number): TutPermit {
  return (next) => {
    const k = stageOf(next);
    return k >= 0 && k <= maxStage;
  };
}

/* ---------- steps ---------- */

type Step = {
  ch: string;
  body: string;
  gate: TutGate;
  hl?: string | ((s: GameState) => string | undefined);
  kind?: "still" | "drag" | "pinch" | "freeplay";
  /* Setup demos: rebuild the room at this seat count while the card
   * is up (pile/table counts follow the real dealing rules). No demo
   * = the pristine scripted room. */
  demo?: number;
  still?: string;
  hlBox?: { x: number; y: number; w: number; h: number };
  done?: (s: GameState) => boolean;
  doneKey?: "settingsOpen" | "settingsClosed" | "scoreboardCycled";
  permit?: TutPermit;
  fx?: "forceFreeCards";
  dragTarget?: string;
  dragDest?: "zone" | "origin";
  zoneLabel?: string;
};

const holdingCenter0 = (s: GameState) => s.center[0]?.heldBy === TUT_ME_ID;

export function buildSteps(
  topicId: TutTopicId,
  opts: { hasTouch: boolean; hasKeyboard: boolean },
): Step[] {
  switch (topicId) {
    case "setup":
      return [
        {
          ch: "The Setup",
          gate: "cog",
          body: "Every match begins in a lobby. The host picks the mode, Standard or Tournament, and how many seats the table has: 2 to 8 players. 2-4 players can play for free; tables of 5 to 8 need Bimyah!+.",
        },
        {
          ch: "The Setup",
          gate: "cog",
          hl: SEL.mypiles,
          body: "One deck of 52 cards is used for 2 to 4 players, and two decks for 5 to 8. Cards are dealt into face-down piles of 4. With 2 players, each player gets 6 piles, like the room in front of you now.",
        },
        {
          ch: "The Setup",
          gate: "cog",
          hl: SEL.mypiles,
          demo: 3,
          body: "With 3, 6, or 7 players, each player gets 4 piles. This table has 3 players, so count the piles at any seat: 4 each.",
        },
        {
          ch: "The Setup",
          gate: "cog",
          hl: SEL.mypiles,
          demo: 5,
          body: "With 5 players, each player gets 5 piles. The table grows, and so do the piles in front of you.",
        },
        {
          ch: "The Setup",
          gate: "cog",
          hl: SEL.mypiles,
          demo: 4,
          body: "With 4 or 8 players, each player gets 3 piles. This table has 4 players: 3 piles each.",
        },
        {
          ch: "The Setup",
          gate: "cog",
          hl: SEL.table,
          body: "The table starts with shared face-up cards: 4 in 2 to 5 player games. The table in front of you now holds 4, highlighted here in the middle.",
        },
        {
          ch: "The Setup",
          gate: "cog",
          hl: SEL.table,
          demo: 6,
          body: "In 6 to 8 player games, the table starts with 8 shared face-up cards. This table has 6 players, so count the cards in the middle: 8.",
        },
        {
          ch: "The Setup",
          gate: "cog",
          body: "Everyone taps Ready, a 3 second countdown runs, and then play begins with no turns.",
        },
        {
          ch: "The Room",
          gate: "cog",
          hl: SEL.mypiles,
          body: "This is a live room, set up exactly like a real match. These are your piles, at your seat. In this room you have 6 piles of 4 cards, all face down.",
        },
        {
          ch: "The Room",
          gate: "cog",
          hl: SEL.table,
          body: "This is the table. The shared face-up cards live here, and this is also where Free Cards appear later. Cards travel between your piles through the table.",
        },
        {
          ch: "The Room",
          gate: "cog",
          hl: SEL.botSeat,
          body: "That is your opponent's seat. In a real game, every player races at the same time. This bot will stay frozen until the Free Play chapter, so you can learn at your own pace.",
        },
        {
          ch: "Settings",
          gate: "cog",
          hl: SEL.cog,
          doneKey: "settingsOpen",
          body: "Every room has the same Settings. Tap the settings cog, highlighted at the top left, to open them. The next steps walk through each setting in place.",
        },
        {
          ch: "Settings",
          gate: "settings",
          hl: SEL.setHome,
          body: "End match (the home button): this leaves the room and ends the match for you. In this tutorial it would also end the tutorial, so do not tap it now.",
        },
        {
          ch: "Settings",
          gate: "settings",
          hl: SEL.setMute,
          body: "Mute silences the game's sound effects. It only affects your own device.",
        },
        {
          ch: "Settings",
          gate: "settings",
          hl: SEL.setAutosort,
          body: "Auto-sort hand keeps the cards in your open hand grouped by rank automatically. It is off here so you can arrange cards yourself; many players turn it on.",
        },
        {
          ch: "Settings",
          gate: "settings",
          hl: SEL.setKeybinds,
          body: "Keyboard controls opens the keybind editor, where every action key can be remapped. The Controls topic covers what the keys do.",
        },
        {
          ch: "Settings",
          gate: "settings",
          hl: SEL.setInactivity,
          body: "Inactivity timers (Free Cards): a host-only setting. When it is on, a player who stops playing for about a minute has their piles turned face up on the table as Free Cards, open to everyone. The tutorial keeps it off; you will still meet Free Cards in the Gameplay topic.",
        },
        {
          ch: "Settings",
          gate: "settings",
          hl: SEL.setClose,
          doneKey: "settingsClosed",
          body: "That is every setting. Close the Settings with the X at the top right of the Settings panel, then tap Continue.",
        },
      ];
    case "gameplay":
      return [
        {
          ch: "The Basics",
          gate: "cog",
          body: "There are NO turns in Bimyah: everyone plays at the same time, racing to finish their sets. Cards move between your piles through the table: swap a card out of one pile into the table, open another pile, and swap it in.",
        },
        {
          ch: "The Basics",
          gate: "table",
          hl: SEL.pile(0),
          done: (s) => stageOf(s) >= 1,
          permit: onJourney(1),
          body: "Start by opening a pile. Tap your first pile, highlighted here. Its 4 cards become your hand.",
        },
        {
          ch: "The Basics",
          gate: "cog",
          hl: SEL.myhand,
          body: "Your hand is the 4 cards of the pile you opened: three Kings and a 7 of Clubs. A pile becomes a set when all 4 cards are the same rank. The fourth King is hiding in another of your piles; first, learn the swap.",
        },
        {
          ch: "The Basics",
          gate: "table",
          hl: (s) => (holdingCenter0(s) ? SEL.handCard("7♣") : SEL.centerSlot(0)),
          done: (s) => stageOf(s) >= 2,
          permit: onJourney(2),
          body: "Swap like this: tap the 4 of Diamonds on the table to hold it. Your color outlines the empty slot, and you have 5 seconds to tap the 7 of Clubs in your hand to swap it in.\n\nThere is a second way, with no time limit: tap the 7 in your hand first to select it, then tap the 4 on the table, and they swap at once.",
        },
        {
          ch: "The Basics",
          gate: "cog",
          hl: SEL.mysort,
          body: "Two buttons sit under your piles. SET locks the pile when your hand is four of a kind; it lights up when it is ready. SORT, highlighted here, groups the cards in your hand by rank.",
        },
        {
          ch: "Build a Set",
          gate: "cog",
          body: "Now build the Kings. The fourth King, the King of Clubs, is in your second pile. The plan: swap the 7 of Clubs out of that pile into the table, then swap it into your first pile. The table is the bridge between your own piles.",
        },
        {
          ch: "Build a Set",
          gate: "table",
          hl: (s) => {
            const m = meOf(s);
            if (!m || m.openPileIndex !== 1) return SEL.pile(1);
            return holdingCenter0(s) ? SEL.handCard("K♣") : SEL.centerSlot(0);
          },
          done: (s) => stageOf(s) >= 4,
          permit: onJourney(4),
          body: "Open your second pile. Then hold the 7 of Clubs on the table and swap the King of Clubs from your hand into the table. Same two ways as before: hold first and swap within 5 seconds, or select the King in your hand first with no time limit.",
        },
        {
          ch: "Build a Set",
          gate: "table",
          hl: (s) => {
            const m = meOf(s);
            if (!m || m.openPileIndex !== 0) return SEL.pile(0);
            return holdingCenter0(s) ? SEL.handCard("4♦") : SEL.centerSlot(0);
          },
          done: (s) => stageOf(s) >= 6,
          permit: onJourney(6),
          body: "Open your first pile again. Hold the King of Clubs on the table and swap the 4 of Diamonds out of your hand. Your hand becomes four Kings.",
        },
        {
          ch: "Build a Set",
          gate: "table",
          hl: SEL.myset,
          done: (s) => stageOf(s) >= 7,
          permit: onJourney(7),
          body: "Four Kings: a full set. Tap SET, highlighted under your piles, to lock this pile in.",
        },
        {
          ch: "Build a Set",
          gate: "cog",
          body: "That is how a set is built: swap through the table until a pile is four of a kind, then lock it with SET. Keep going until every pile is a locked set. Then tap the BIMYAH! button to declare victory.",
        },
        {
          ch: "Free Cards",
          gate: "cog",
          body: "Free Cards are in play when a host turns on Inactivity Timers in the settings of the match. If a player stops playing for about 45 seconds, a warning appears on their seat. About 15 seconds later, their piles are turned face up on the table as Free Cards, open to everyone until that player comes back.",
        },
        {
          ch: "Free Cards",
          gate: "cog",
          fx: "forceFreeCards",
          body: "This bot has stopped playing, so its time is up. Tap Continue and watch: its piles appear face up on the table.",
        },
        {
          ch: "Free Cards",
          gate: "table",
          hl: (s) => {
            const m = meOf(s);
            const b = botOf(s);
            if (!m || m.openPileIndex !== 2) return SEL.pile(2);
            const hold = b?.freePileHolds?.[5];
            if (hold && hold.heldBy === TUT_ME_ID) return SEL.handCard("8♦");
            return SEL.freeCard("Q♦");
          },
          done: (s) => stageOf(s) >= 10,
          permit: onJourney(10),
          body: "The bot's piles are already open, face up on the table, and you treat a Free Card exactly like a table card. Open your third pile: three Queens and an 8. Then tap the Queen of Diamonds on the table to hold it, and within 5 seconds tap the 8 in your hand to swap. Or tap the 8 first to select it, then tap the Queen, with no time limit.",
        },
        {
          ch: "Free Cards",
          gate: "table",
          hl: SEL.myset,
          done: (s) => stageOf(s) >= 11,
          permit: onJourney(11),
          body: "Four Queens. Tap SET to lock the pile.",
        },
        {
          ch: "Free Cards",
          gate: "cog",
          body: "While Free Cards are up, anyone can hold and swap them, one at a time, just like table cards. When the bot comes back to playing, its remaining piles return to its seat.",
        },
        {
          ch: "Limitations",
          gate: "cog",
          body: "A few limits shape every match:\n\n• You can hold only one card at a time, a table card or a Free Card, for up to 5 seconds.\n• You can have only one pile open at a time. Opening another pile puts the current one back first.\n• The table holds 4 cards in 2 to 5 player games, and 8 cards in 6 to 8 player games.",
        },
        {
          ch: "Free Play",
          gate: "cog",
          kind: "freeplay",
          body: "That covers guided play. Now finish this match for real: the bot wakes up and plays at normal speed, and the text box gets out of your way. Win or lose, you will see the winner announcement, and the tutorial continues from there.",
        },
      ];
    case "tournament":
      return [
        {
          ch: "Create a Tournament",
          gate: "locked",
          kind: "still",
          still: "/tutorial-stills/home.jpg",
          hlBox: { x: 0, y: 41.9, w: 49.2, h: 6 },
          body: "A tournament starts the same way as a standard game. From the home screen, tap Create Game, highlighted here.",
        },
        {
          ch: "Create a Tournament",
          gate: "locked",
          kind: "still",
          still: "/tutorial-stills/mode.jpg",
          hlBox: { x: 0, y: 50.6, w: 100, h: 4.9 },
          body: "On the mode step, choose Tournament, highlighted here, instead of Standard.",
        },
        {
          ch: "Create a Tournament",
          gate: "locked",
          kind: "still",
          still: "/tutorial-stills/points.jpg",
          hlBox: { x: 0, y: 54.2, w: 100, h: 4.9 },
          body: "A tournament asks for one extra thing: a point limit. The first player to reach it over several matches wins the tournament. This tutorial's tournament uses a point limit of 5, so a single match win takes it. Tap Next, highlighted here, when creating one.",
        },
        {
          ch: "Create a Tournament",
          gate: "locked",
          kind: "still",
          still: "/tutorial-stills/seats.jpg",
          hlBox: { x: 0, y: 59.4, w: 100, h: 4.8 },
          body: "Pick your seat and the number of players (this room has 4), then tap Create Lobby, highlighted here.",
        },
        {
          ch: "How Tournaments Differ",
          gate: "cog",
          body: "A tournament is a series of matches against the same players. Only the winner of a match earns points, one award per set they locked, based on the set's rank: an Ace set is worth 1 point, up through a King set at 13. Everyone else earns 0 for that match. The first player to reach the point limit is the tournament champion.",
        },
        {
          ch: "How Tournaments Differ",
          gate: "scoreboard",
          doneKey: "scoreboardCycled",
          hl: SEL.scoreboard,
          body: "The Scoreboard button, highlighted at the top right, shows everyone's points and placing at any time during a tournament. Tap it to open the Scoreboard now, then tap Close on the Scoreboard to continue. It is only there in Tournament mode.",
        },
        {
          ch: "How Tournaments Differ",
          gate: "cog",
          body: "Between matches, everyone returns to the lobby with the points kept. Players tap Ready to start the next match. Anyone who does not ready up is dropped from the tournament, and once the first match has started, the roster is locked: nobody new can join.",
        },
        {
          ch: "Free Play",
          gate: "cog",
          kind: "freeplay",
          body: "Now play this tournament out. The three bots wake up and play at normal speed, and the text box gets out of your way. Because the point limit is 5, whoever wins the first match is the champion. Win or lose, the tutorial continues from the winner announcement.",
        },
      ];
    case "hosting":
      return [
        {
          ch: "Create a Game",
          gate: "locked",
          kind: "still",
          still: "/tutorial-stills/home.jpg",
          hlBox: { x: 0, y: 41.9, w: 49.2, h: 6 },
          body: "Hosting starts on the home screen. Tap Create Game, highlighted here, and you become the host of a new room.",
        },
        {
          ch: "Create a Game",
          gate: "locked",
          kind: "still",
          still: "/tutorial-stills/mode.jpg",
          hlBox: { x: 0, y: 44.7, w: 100, h: 4.8 },
          body: "Choose the mode: Standard for a single match, or Tournament for a series. Standard, highlighted here, is the usual pick.",
        },
        {
          ch: "Create a Game",
          gate: "locked",
          kind: "still",
          still: "/tutorial-stills/seats.jpg",
          hlBox: { x: 0, y: 59.4, w: 100, h: 4.8 },
          body: "Pick Play or Spectate for your own seat, choose the number of players, then tap Create Lobby, highlighted here. Signed in hosts can also set the room Public or Private on this step.",
        },
        {
          ch: "Create a Game",
          gate: "locked",
          kind: "still",
          still: "/tutorial-stills/lobby.jpg",
          body: "You land in the lobby. Share the room code, or use Invite Friends and Share Invite, so others can join. When everyone is in, each player taps Ready and the countdown begins.",
        },
        {
          ch: "Join a Game",
          gate: "locked",
          kind: "still",
          still: "/tutorial-stills/home.jpg",
          hlBox: { x: 50.8, y: 41.9, w: 49.2, h: 6 },
          body: "To join someone else's game instead, tap Join Game, highlighted here, on the home screen.",
        },
        {
          ch: "Join a Game",
          gate: "locked",
          kind: "still",
          still: "/tutorial-stills/public.jpg",
          hlBox: { x: 14.8, y: 21.5, w: 70.4, h: 6.4 },
          body: "The Public Games list shows every open public room, with the host, the mode, and how many seats are taken. Tap a game in the list, highlighted here, to join it.",
        },
        {
          ch: "Join a Game",
          gate: "locked",
          kind: "still",
          still: "/tutorial-stills/ready.jpg",
          hlBox: { x: 40.6, y: 80.7, w: 18, h: 5.5 },
          body: "You land in the lobby at your seat. When you are set, tap your Ready button, highlighted here. The match starts once every player is ready.",
        },
        {
          ch: "Reentry Codes",
          gate: "cog",
          body: "Every seat has a private 4-digit reentry code. The code is invisible: it is never shown on screen. Your device remembers the code automatically when you join or host a room.",
        },
        {
          ch: "Reentry Codes",
          gate: "locked",
          kind: "still",
          still: "/tutorial-stills/public.jpg",
          hlBox: { x: 14.8, y: 15.2, w: 70.4, h: 4.8 },
          body: "If you lose connection or close the game, come back from the same device: tap Join Game on the home screen, then Join with Code, highlighted here, enter the room code, and use the rejoin option. You take your seat back with your hand, piles, and score intact.",
        },
      ];
    case "controls": {
      const pinchSteps: Step[] = opts.hasTouch
        ? [
            {
              ch: "Resize Elements",
              gate: "free",
              kind: "pinch",
              dragTarget: SEL.mySeat,
              body: "Now resize your own seat. Pinch it with two fingers: spread them apart to grow it, or pinch them together to shrink it. Your hand, piles, and SET and SORT buttons scale together.",
            },
            {
              ch: "Resize Elements",
              gate: "free",
              kind: "pinch",
              dragTarget: SEL.table,
              body: "Pinch the table the same way. The table, the table cards, and the BIMYAH! button scale together.",
            },
          ]
        : [
            {
              ch: "Resize Elements",
              gate: "free",
              body: "On a touch screen you can also pinch any seat, or the table, with two fingers to resize it: spread to grow, pinch together to shrink. Your seat's hand, piles, and buttons scale together, and so do the table, its cards, and the BIMYAH! button.",
            },
          ];
      return [
        {
          ch: "Move Elements",
          gate: "free",
          body: "Almost everything on this screen can be moved and resized: every seat, the table, and the buttons around the edges. In this tutorial, nothing you move is saved. In a real game, your layout is remembered per mode and player count.",
        },
        {
          ch: "Move Elements",
          gate: "free",
          kind: "drag",
          dragTarget: SEL.mySeat,
          dragDest: "zone",
          zoneLabel: "Drop your seat here",
          body: "Every seat's name tag is its drag handle. Drag your own seat by its name tag into the green zone.",
        },
        {
          ch: "Move Elements",
          gate: "free",
          kind: "drag",
          dragTarget: SEL.mySeat,
          dragDest: "origin",
          body: "Now drag your seat back to where it started. The green outline marks the spot.",
        },
        {
          ch: "Move Elements",
          gate: "free",
          kind: "drag",
          dragTarget: SEL.botSeat,
          dragDest: "zone",
          zoneLabel: "Drop the bot seat here",
          body: "Other players' seats move the same way. Drag the bot's seat by its name tag into the green zone.",
        },
        {
          ch: "Move Elements",
          gate: "free",
          kind: "drag",
          dragTarget: SEL.botSeat,
          dragDest: "origin",
          body: "And drag the bot's seat back to where it started.",
        },
        {
          ch: "Move Elements",
          gate: "free",
          body: "The table drags too: press it and drag it anywhere. The small buttons around the screen, like Settings and How to Play, can also be dragged to new spots.",
        },
        {
          ch: "Resize Elements",
          gate: "free",
          body: "Moving is half of it. Elements also resize, which is how players fit everything on a small phone screen.",
        },
        ...pinchSteps,
        ...(opts.hasKeyboard
          ? [
              {
                ch: "Resize Elements",
                gate: "free" as TutGate,
                body: "With a keyboard, you do not need to pinch: the Up and Down arrow keys grow and shrink your own seat, and the Left and Right arrow keys shrink and grow the table.",
              },
            ]
          : []),
        {
          ch: "Action Keys",
          gate: "free",
          body: "Every game action has a key. Number keys 1 to 8 hold table cards (with QWER and ASDF as alternates), U I O P open your piles, J K L and ; tap hand cards, Space declares a SET, Shift sorts, and Enter declares BIMYAH!.",
        },
        {
          ch: "Action Keys",
          gate: "free",
          body: "You do not need to memorize any of that now. The full key list, and a way to remap every key, lives in the How to Play Guide under Keyboard Controls, and in the Keyboard controls button inside Settings.",
        },
      ];
    }
  }
}

/* ---------- overlay component ---------- */

const TOPIC_BTN: Record<TutTopicId, string> = {
  setup: "btn-3d-blue",
  gameplay: "btn-3d-lime",
  tournament: "btn-3d-gold",
  hosting: "btn-3d-red",
  controls: "btn-3d-dark",
};

export const INTRO_STEPS = [
  "Welcome to Bimyah!, the fast paced card race with NO turns!",
  "The objective is to set your ranks: build four of a kind in a pile. When all 4 cards in your hand are the same rank, that is a set. Your first pile is open with one now: four Kings.",
  "When your hand is a set, tap SET to lock that pile. The SET and Sort buttons sit under your piles whenever a pile is open, exactly as in a real game.",
  "When all your piles are SET, tap the red BIMYAH! button to declare victory. The first player to do it wins the match.",
  "This room has a dealt hand and one bot to practice against. Which aspect would you like to cover first? You can do them in any order.",
];

/* Per-card intro staging (Ronya 2026-11-18): as the objective and
 * the winning conditions are explained, the room shows the example
 * and the mentioned element is highlighted. "set4" opens the first
 * pile with four Kings in hand; "allSet" locks every pile so the
 * BIMYAH! button lights up. No demo = the pristine scripted room. */
export type TutIntroDemo = "set4" | "allSet";
const INTRO_META: Array<{ hl?: string; demo?: TutIntroDemo }> = [
  {},
  { demo: "set4", hl: SEL.myhand },
  { demo: "set4", hl: SEL.myset },
  { demo: "allSet", hl: SEL.bimyah },
  {},
];

export const ALLDONE_TEXT =
  "That is everything: all five topics are complete. Would you like to review any of the sections again?";

export const topicsLine = (doneCount: number) =>
  `${doneCount} of ${TUT_TOPICS.length} done. Pick a topic; they can be done in any order, and your progress is saved on this device.`;

function rectsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

export function TutorialOverlay({
  state,
  stage,
  completed,
  guardNotice,
  onGate,
  onForceFreeCards,
  onWakeBots,
  onBotsFrozen,
  onEnterTournament,
  onEnterStandard,
  onIntroDemo,
  onDemoRoom,
  onResetView,
  onTopicComplete,
  onGuardSpec,
  registerWiggle,
  onExit,
}: {
  state: GameState;
  stage: "standard" | "tournament";
  completed: TutTopicId[];
  guardNotice: string | null;
  onGate: (gate: TutGate) => void;
  onForceFreeCards: () => void;
  onWakeBots: () => void;
  onBotsFrozen: (frozen: boolean) => void;
  onEnterTournament: () => void;
  onEnterStandard: () => void;
  onIntroDemo: (demo: TutIntroDemo | null) => void;
  onDemoRoom: (seats: number | null) => void;
  onResetView: () => void;
  onTopicComplete: (t: TutTopicId) => void;
  onGuardSpec: (active: boolean, permit: TutPermit | null) => void;
  registerWiggle: (fn: (() => void) | null) => void;
  onExit: () => void;
}) {
  const [phase, setPhase] = useState<"intro" | "topics" | "topic" | "alldone">("intro");
  const [introIdx, setIntroIdx] = useState(0);
  const [topicId, setTopicId] = useState<TutTopicId | null>(null);
  const [stepIdx, setStepIdx] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [scoreboardOpen, setScoreboardOpen] = useState(false);
  const [scoreboardCycled, setScoreboardCycled] = useState(false);
  const scoreboardSawOpenRef = useRef(false);
  const [actionDone, setActionDone] = useState(false);
  const [gestureStep, setGestureStep] = useState(-1);
  const [freeplayLive, setFreeplayLive] = useState(false);
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const [zoneRect, setZoneRect] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  const [media] = useState(() => {
    if (typeof window === "undefined") return { hasTouch: false, hasKeyboard: false };
    return {
      hasTouch:
        !!window.matchMedia?.("(pointer: coarse)").matches ||
        "ontouchstart" in window,
      hasKeyboard: !!window.matchMedia?.("(pointer: fine)").matches,
    };
  });

  const stateRef = useRef(state);
  stateRef.current = state;
  const stepIdxRef = useRef(stepIdx);
  stepIdxRef.current = stepIdx;
  const originsRef = useRef<Record<string, DOMRect>>({});
  const zoneElRef = useRef<HTMLDivElement | null>(null);
  const hlElRef = useRef<Element | null>(null);
  const panelDragRef = useRef<{ dx: number; dy: number } | null>(null);

  const steps = useMemo(
    () =>
      topicId
        ? buildSteps(topicId, {
            hasTouch: media.hasTouch,
            hasKeyboard: media.hasKeyboard,
          })
        : [],
    [topicId, media],
  );
  const step: Step | undefined = steps[Math.min(stepIdx, Math.max(0, steps.length - 1))];
  const chapters = useMemo(() => {
    const out: Array<{ name: string; firstIdx: number }> = [];
    steps.forEach((s, i) => {
      if (!out.some((c) => c.name === s.ch)) out.push({ name: s.ch, firstIdx: i });
    });
    return out;
  }, [steps]);
  const currentChapter = step?.ch;

  const resolvedHl =
    phase === "intro"
      ? INTRO_META[introIdx]?.hl
      : step
        ? step.doneKey === "scoreboardCycled" && scoreboardOpen
          ? SEL.scoreboardClose
          : typeof step.hl === "function"
            ? step.hl(state)
            : step.hl
        : undefined;

  /* ----- intro staging: the room shows what the card explains ----- */
  const introDemo: TutIntroDemo | null =
    phase === "intro" ? (INTRO_META[introIdx]?.demo ?? null) : null;
  useEffect(() => {
    onIntroDemo(introDemo);
  }, [introDemo, onIntroDemo]);

  /* ----- Setup demos: pile/table counts rebuild the room ----- */
  const stepDemo: number | null =
    phase === "topic" && step ? (step.demo ?? null) : null;
  useEffect(() => {
    onDemoRoom(stepDemo);
  }, [stepDemo, onDemoRoom]);

  /* ----- publish the input gate ----- */
  const gate: TutGate = freeplayLive
    ? "free"
    : phase !== "topic" || !step
      ? "cog"
      : step.gate === "settings"
        ? settingsOpen
          ? "settings"
          : "cog"
        : step.gate;
  useEffect(() => {
    onGate(gate);
  }, [gate, onGate]);

  /* ----- publish the guided-move guard ----- */
  const guardActive =
    phase === "topic" &&
    topicId === "gameplay" &&
    !!step &&
    step.kind !== "freeplay" &&
    !freeplayLive;
  useEffect(() => {
    onGuardSpec(guardActive, guardActive ? (step?.permit ?? null) : null);
  }, [guardActive, step, onGuardSpec]);
  useEffect(() => () => onGuardSpec(false, null), [onGuardSpec]);

  /* ----- settings overlay open state ----- */
  useEffect(() => {
    const t = setInterval(() => {
      setSettingsOpen(!!document.querySelector("[data-settings-overlay]"));
    }, 400);
    return () => clearInterval(t);
  }, []);

  /* ----- scoreboard open/close cycle (Tournament topic) ----- */
  useEffect(() => {
    scoreboardSawOpenRef.current = false;
    setScoreboardCycled(false);
  }, [stepIdx, topicId, phase]);
  useEffect(() => {
    const t = setInterval(() => {
      const open = !!document.querySelector('[data-scoreboard-overlay="1"]');
      setScoreboardOpen(open);
      if (open) scoreboardSawOpenRef.current = true;
      else if (scoreboardSawOpenRef.current) setScoreboardCycled(true);
    }, 400);
    return () => clearInterval(t);
  }, []);

  /* ----- Gigi voice narration (Ronya 2026-11-18) -----
   * Every card's text is pre-rendered to an MP3 (see tutorialVoice.ts)
   * and read aloud as the card appears. The speaker button in the card
   * header mutes the voice for the whole session; the game's own mute
   * (Settings) mutes it too, so either control silences the voice. */
  const [voiceMuted, setVoiceMuted] = useState(false);
  const [gameMuted, setGameMuted] = useState(false);
  /* True once the current card's clip has finished (or there is
   * nothing to hear: muted, or the clip failed). Drives the glow on
   * the top-right play/next button. */
  const [voiceDone, setVoiceDone] = useState(true);
  /* CC button state: hide the text box completely. */
  const [textHidden, setTextHidden] = useState(false);
  useEffect(() => {
    sfx.init();
    setGameMuted(sfx.isMuted());
    const t = setInterval(() => setGameMuted(sfx.isMuted()), 400);
    return () => clearInterval(t);
  }, []);
  const voiceOff = voiceMuted || gameMuted;
  const spokenText: string | null = freeplayLive
    ? null
    : phase === "intro"
      ? INTRO_STEPS[introIdx]
      : phase === "topics"
        ? topicsLine(completed.length)
        : phase === "alldone"
          ? ALLDONE_TEXT
          : (step?.body ?? null);
  /* The narration plays through the game's own Web Audio context
   * (sharedAudioContext), NOT an <audio> element. Every card tap in
   * GameTable fires a Web Audio tone immediately, before the move is
   * even judged; with the voice on a separate media element, each
   * tone garbled the voice stream on Android (Ronya 2026-11-18:
   * tapping any card, highlighted or not, made the narration
   * crackle). One shared context mixes tones and voice in a single
   * output, like every game engine does. */
  const voiceSrcRef = useRef<AudioBufferSourceNode | null>(null);
  const voiceBufRef = useRef(new Map<string, AudioBuffer>());
  const voiceTokenRef = useRef(0);
  const voiceWantRef = useRef(false);
  const spokenTextRef = useRef(spokenText);
  spokenTextRef.current = spokenText;
  const voiceOffRef = useRef(voiceOff);
  voiceOffRef.current = voiceOff;
  const stopVoice = () => {
    voiceTokenRef.current++;
    voiceWantRef.current = false;
    const src = voiceSrcRef.current;
    voiceSrcRef.current = null;
    if (src) {
      try {
        src.onended = null;
        src.stop();
      } catch {
        /* already stopped */
      }
      try {
        src.disconnect();
      } catch {
        /* noop */
      }
    }
  };
  const startVoice = (text: string) => {
    const ctx = sharedAudioContext();
    if (!ctx) return;
    if (ctx.state !== "running") {
      /* Contexts start suspended until a user gesture. Arm the
       * pointerdown retry and try to resume; the clip starts as soon
       * as the context runs. */
      voiceWantRef.current = true;
      void ctx.resume().then(() => {
        if (
          voiceWantRef.current &&
          spokenTextRef.current === text &&
          !voiceOffRef.current
        ) {
          startVoice(text);
        }
      });
      return;
    }
    stopVoice();
    const token = voiceTokenRef.current;
    const url = tutVoiceUrl(text);
    const playBuf = (buf: AudioBuffer) => {
      if (
        voiceTokenRef.current !== token ||
        voiceOffRef.current ||
        spokenTextRef.current !== text
      ) {
        return;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.onended = () => {
        if (voiceSrcRef.current === src) {
          voiceSrcRef.current = null;
          setVoiceDone(true);
        }
      };
      voiceSrcRef.current = src;
      voiceWantRef.current = false;
      src.start();
    };
    const cached = voiceBufRef.current.get(url);
    if (cached) {
      playBuf(cached);
      return;
    }
    fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`voice ${r.status}`);
        return r.arrayBuffer();
      })
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        voiceBufRef.current.set(url, buf);
        playBuf(buf);
      })
      .catch(() => {
        /* narration is an enhancement; a failed clip stays silent
         * and counts as done so the next button still glows */
        setVoiceDone(true);
      });
  };
  useEffect(() => {
    if (!spokenText || voiceOff) {
      stopVoice();
      setVoiceDone(true);
      return;
    }
    setVoiceDone(false);
    startVoice(spokenText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spokenText, voiceOff]);
  useEffect(() => () => stopVoice(), []);
  /* If the context was suspended when the card appeared, the first
   * tap anywhere starts the current card's clip. */
  useEffect(() => {
    const retry = () => {
      if (
        voiceWantRef.current &&
        spokenTextRef.current &&
        !voiceOffRef.current
      ) {
        startVoice(spokenTextRef.current);
      }
    };
    window.addEventListener("pointerdown", retry);
    return () => window.removeEventListener("pointerdown", retry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const toggleVoice = () => {
    if (voiceOff) {
      /* Unmute fully: clear the session mute and the game mute, so the
       * button always does what its icon promises. */
      setVoiceMuted(false);
      if (gameMuted) {
        sfx.setMuted(false);
        setGameMuted(false);
      }
    } else {
      setVoiceMuted(true);
    }
  };

  /* ----- highlight engine: green outline on exactly the talked-about element ----- */
  const [hlBox, setHlBox] = useState<{
    x: number;
    y: number;
    w: number;
    h: number;
  } | null>(null);
  useEffect(() => {
    if (!resolvedHl) {
      hlElRef.current = null;
      setHlBox(null);
      return;
    }
    let cur: Element | null = null;
    const apply = () => {
      const el = document.querySelector(resolvedHl);
      const pilesEl = el?.closest('[data-piles="1"]');
      if (
        el &&
        pilesEl &&
        (el === pilesEl || el.parentElement === pilesEl)
      ) {
        // The piles container reserves empty height under the cards
        // (room for fanned sets), so outlining the container, or one
        // pile's wrapper inside it, leaves a tall empty box below the
        // card (Ronya 2026-11-18, for the whole row and for single
        // piles alike). Outline the pile cards themselves instead.
        // Measure each pile's card visuals (its button/img
        // descendants), NOT the pile wrapper: the wrappers are flex
        // items that stretch to the container's reserved height, so
        // their own rects carry the same empty band. A pile with no
        // card visual (an empty slot) is one card tall by
        // construction.
        let x1 = Infinity,
          y1 = Infinity,
          x2 = -Infinity,
          y2 = -Infinity;
        const addRect = (r: DOMRect) => {
          if (r.width === 0 && r.height === 0) return;
          x1 = Math.min(x1, r.left);
          y1 = Math.min(y1, r.top);
          x2 = Math.max(x2, r.right);
          y2 = Math.max(y2, r.bottom);
        };
        const targets =
          el === pilesEl ? Array.from(el.children) : [el];
        for (const child of targets) {
          const visuals = child.querySelectorAll("button, img");
          if (visuals.length > 0) {
            visuals.forEach((v) => addRect(v.getBoundingClientRect()));
          } else {
            const r = child.getBoundingClientRect();
            addRect(
              new DOMRect(r.left, r.top, r.width, Math.round(r.width * 1.4)),
            );
          }
        }
        if (x1 !== Infinity) {
          cur?.classList.remove("tut-hl");
          cur = null;
          hlElRef.current = el;
          const next = { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
          setHlBox((prev) =>
            prev &&
            prev.x === next.x &&
            prev.y === next.y &&
            prev.w === next.w &&
            prev.h === next.h
              ? prev
              : next,
          );
          return;
        }
      }
      setHlBox(null);
      if (el !== cur) {
        cur?.classList.remove("tut-hl");
        cur = el;
        hlElRef.current = el;
      }
      el?.classList.add("tut-hl");
    };
    apply();
    const t = setInterval(apply, 300);
    return () => {
      clearInterval(t);
      cur?.classList.remove("tut-hl");
      if (hlElRef.current === cur) hlElRef.current = null;
      setHlBox(null);
    };
  }, [resolvedHl]);

  /* ----- wiggle the correct element on a blocked or wrong move ----- */
  const wiggleNow = useCallback(() => {
    const el =
      hlElRef.current ??
      (resolvedHl ? document.querySelector(resolvedHl) : null);
    if (!el) return;
    el.classList.remove("tut-wiggle");
    void (el as HTMLElement).offsetWidth;
    el.classList.add("tut-wiggle");
    window.setTimeout(() => el.classList.remove("tut-wiggle"), 550);
  }, [resolvedHl]);
  useEffect(() => {
    registerWiggle(wiggleNow);
    return () => registerWiggle(null);
  }, [wiggleNow, registerWiggle]);

  // A tap anywhere that is not the instructed element wiggles the
  // correct one (the move itself is reverted by the route guard).
  // EXCEPTION: taps inside the player's own hand never wiggle.
  // Selecting a hand card first is the legal select-first swap
  // method, not a mistake (Ronya 2026-11-18).
  useEffect(() => {
    if (!step?.done) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || t.closest(".tutorial-ui")) return;
      if (t.closest('[data-seat-me="1"] [data-hand="1"]')) return;
      if (resolvedHl && t.closest(resolvedHl)) return;
      wiggleNow();
    };
    window.addEventListener("pointerdown", onDown, true);
    return () => window.removeEventListener("pointerdown", onDown, true);
  }, [step, resolvedHl, wiggleNow]);

  /* ----- action step completion (polled, never reset by state churn) ----- */
  useEffect(() => {
    setActionDone(false);
    if (!step?.done) return;
    const check = () => setActionDone(!!step.done!(stateRef.current));
    check();
    const t = setInterval(check, 200);
    return () => clearInterval(t);
  }, [step]);

  /* ----- gestures (Controls topic) ----- */
  useEffect(() => {
    setGestureStep(-1);
  }, [stepIdx, topicId, phase]);

  useEffect(() => {
    if (!step || (step.kind !== "drag" && step.kind !== "pinch")) {
      setZoneRect(null);
      return;
    }
    const targetSel = step.dragTarget!;
    if (step.kind === "drag") {
      const el = document.querySelector(targetSel);
      if (el && step.dragDest === "zone") {
        originsRef.current[targetSel] = el.getBoundingClientRect();
      }
      if (step.dragDest === "origin") {
        const o = originsRef.current[targetSel];
        if (o) {
          setZoneRect({ left: o.left, top: o.top, width: o.width, height: o.height });
        }
      } else {
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const width = Math.min(260, vw * 0.62);
        const height = 150;
        setZoneRect({
          left: (vw - width) / 2,
          top: targetSel === SEL.botSeat ? vh * 0.34 : vh * 0.13,
          width,
          height,
        });
      }
      let drag: { inside: boolean; moved: boolean } | null = null;
      const down = (e: PointerEvent) => {
        const t = e.target as HTMLElement | null;
        drag = { inside: !!t?.closest?.(targetSel), moved: false };
      };
      const move = () => {
        if (drag?.inside) drag.moved = true;
      };
      const up = () => {
        const d = drag;
        drag = null;
        if (!d?.inside || !d.moved) return;
        const elNow = document.querySelector(targetSel);
        if (!elNow) return;
        const r = elNow.getBoundingClientRect();
        if (step.dragDest === "origin") {
          const o = originsRef.current[targetSel];
          if (o && rectsOverlap(r, o)) setGestureStep(stepIdxRef.current);
        } else if (zoneElRef.current) {
          if (rectsOverlap(r, zoneElRef.current.getBoundingClientRect()))
            setGestureStep(stepIdxRef.current);
        }
      };
      window.addEventListener("pointerdown", down, true);
      window.addEventListener("pointermove", move, true);
      window.addEventListener("pointerup", up, true);
      return () => {
        window.removeEventListener("pointerdown", down, true);
        window.removeEventListener("pointermove", move, true);
        window.removeEventListener("pointerup", up, true);
      };
    }
    // Pinch: track every active touch; a pinch counts when at least one
    // touch started on the target and the two-touch distance changed by
    // more than 12% either way, judged when the gesture ends.
    const touches = new Map<number, { x: number; y: number }>();
    let inside = false;
    let min = Infinity;
    let max = 0;
    const dist = () => {
      const pts = [...touches.values()];
      if (pts.length < 2) return 0;
      return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    };
    const ts = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        touches.set(t.identifier, { x: t.clientX, y: t.clientY });
        const tgt = t.target as HTMLElement | null;
        if (tgt?.closest?.(targetSel)) inside = true;
      }
      const d = dist();
      if (d > 0) {
        min = Math.min(min, d);
        max = Math.max(max, d);
      }
    };
    const tm = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        if (touches.has(t.identifier))
          touches.set(t.identifier, { x: t.clientX, y: t.clientY });
      }
      const d = dist();
      if (d > 0) {
        min = Math.min(min, d);
        max = Math.max(max, d);
      }
    };
    const te = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) touches.delete(t.identifier);
      if (touches.size < 2) {
        if (inside && max > 0 && min > 0 && max / min > 1.12)
          setGestureStep(stepIdxRef.current);
        if (touches.size === 0) {
          inside = false;
          min = Infinity;
          max = 0;
        }
      }
    };
    window.addEventListener("touchstart", ts, true);
    window.addEventListener("touchmove", tm, true);
    window.addEventListener("touchend", te, true);
    window.addEventListener("touchcancel", te, true);
    return () => {
      window.removeEventListener("touchstart", ts, true);
      window.removeEventListener("touchmove", tm, true);
      window.removeEventListener("touchend", te, true);
      window.removeEventListener("touchcancel", te, true);
    };
  }, [step]);

  /* ----- flow ----- */
  const enterTopic = (id: TutTopicId) => {
    setTopicId(id);
    setStepIdx(0);
    setPhase("topic");
    setFreeplayLive(false);
    // Every topic starts from the room's original state (Ronya
    // 2026-11-18): this also closes a Settings panel left open in
    // another topic, which otherwise could never be closed.
    onResetView();
    if (id === "tournament") {
      onEnterTournament();
      onBotsFrozen(true);
      return;
    }
    onEnterStandard();
    onBotsFrozen(true);
  };

  const finishTopic = (id: TutTopicId) => {
    onTopicComplete(id);
    onResetView();
    const all = TUT_TOPICS.every(
      (t) => t.id === id || completed.includes(t.id),
    );
    setPhase(all ? "alldone" : "topics");
    setTopicId(null);
    setFreeplayLive(false);
  };

  const advance = () => {
    if (!step || !topicId) return;
    if (step.fx === "forceFreeCards") onForceFreeCards();
    if (stepIdx + 1 >= steps.length) finishTopic(topicId);
    else setStepIdx(stepIdx + 1);
  };

  const back = () => {
    if (stepIdx > 0) {
      setStepIdx(stepIdx - 1);
      return;
    }
    onResetView();
    setPhase("topics");
    setTopicId(null);
  };

  const startFreeplay = () => {
    // A seat that went to Free Cards RETURNS when free play starts:
    // its piles go back face down at the seat and the free-cards
    // layout disappears, exactly like a real match (Ronya 2026-11-18).
    onWakeBots();
    onBotsFrozen(false);
    setFreeplayLive(true);
  };
  const finishFreeplay = () => {
    if (!topicId) return;
    onBotsFrozen(true);
    setFreeplayLive(false);
    finishTopic(topicId);
  };
  const freeplayWon =
    freeplayLive &&
    state.status === "won" &&
    (topicId === "gameplay" || (state.championId ?? null) !== null);

  const stepSatisfied = !step
    ? true
    : step.kind === "drag" || step.kind === "pinch"
      ? gestureStep === stepIdx
      : step.done
        ? actionDone
        : step.doneKey === "settingsOpen"
          ? settingsOpen
          : step.doneKey === "settingsClosed"
            ? !settingsOpen
            : step.doneKey === "scoreboardCycled"
              ? scoreboardCycled
              : true;
  const isActionStep = !!step && (!!step.done || !!step.doneKey || step.kind === "drag" || step.kind === "pinch");

  /* ----- auto-advance on completed action cards -----
     When a player completes the action on a "Complete action to
     continue" card, move on by itself after a short beat instead of
     making them tap Continue (Ronya 2026-11-18). It only fires when
     the completion happens while the player is on the card: a card
     that was already complete when they arrived (stepping Back onto
     it) still waits for a manual Continue, so Back stays usable. */
  const stepSig =
    phase === "topic" && step ? `${topicId}:${stepIdx}` : null;
  const [autoAdvFor, setAutoAdvFor] = useState<string | null>(null);
  const autoEntryRef = useRef<{
    sig: string | null;
    sat: boolean;
    stateSig: string;
  }>({ sig: null, sat: false, stateSig: "" });
  const autoTimerRef = useRef<{
    sig: string;
    t: ReturnType<typeof setTimeout>;
  } | null>(null);
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  useEffect(() => {
    const clearTimer = () => {
      if (autoTimerRef.current) {
        clearTimeout(autoTimerRef.current.t);
        autoTimerRef.current = null;
      }
    };
    if (!stepSig || !isActionStep || freeplayLive) {
      clearTimer();
      setAutoAdvFor(null);
      return;
    }
    const curSig = stateSig(state);
    if (autoEntryRef.current.sig !== stepSig) {
      autoEntryRef.current = {
        sig: stepSig,
        sat: stepSatisfied,
        stateSig: curSig,
      };
      clearTimer();
      setAutoAdvFor(null);
      return;
    }
    const entry = autoEntryRef.current;
    if (stepSatisfied && (!entry.sat || entry.stateSig !== curSig)) {
      if (autoTimerRef.current?.sig !== stepSig) {
        clearTimer();
        const t = setTimeout(() => {
          autoTimerRef.current = null;
          advanceRef.current();
        }, 900);
        autoTimerRef.current = { sig: stepSig, t };
      }
      setAutoAdvFor(stepSig);
    } else {
      clearTimer();
      setAutoAdvFor(null);
    }
  }, [stepSig, stepSatisfied, isActionStep, freeplayLive, state]);

  /* ----- panel dragging -----
     Window-level move/up listeners, no pointer capture: the v1.6.160
     version captured the pointer on the header element, which fought
     the game's own window pointer tracking and froze the page on
     touch (Ronya 2026-11-18). */
  const onPanelHeadDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const panel = (e.currentTarget as HTMLElement).closest(
      "[data-tut-panel]",
    ) as HTMLElement | null;
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    panelDragRef.current = { dx: e.clientX - rect.left, dy: e.clientY - rect.top };
  };
  // Panel position persists for the whole tutorial session once the
  // player drags the text box: it resets only when the tutorial is
  // finished or exited (the overlay unmounts) (Ronya 2026-11-18).
  useEffect(() => {
    const move = (e: PointerEvent) => {
      const d = panelDragRef.current;
      if (!d) return;
      const w = Math.min(576, window.innerWidth - 24);
      setPanelPos({
        x: Math.max(0, Math.min(window.innerWidth - w, e.clientX - d.dx)),
        y: Math.max(0, Math.min(window.innerHeight - 90, e.clientY - d.dy)),
      });
    };
    const up = () => {
      panelDragRef.current = null;
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, []);

  const panelTitle =
    phase === "topic" && topicId
      ? `${TUT_TOPICS.find((t) => t.id === topicId)?.label} · ${currentChapter ?? ""}`
      : "Guided Tutorial";

  /* The top-right play/next button mirrors the panel's Continue: it
   * advances the intro cards and any satisfied topic card, and stays
   * disabled where Continue would be (an unfinished action card, the
   * free-play card whose button is Start Free Play, the topic list). */
  const nextEnabled =
    phase === "intro"
      ? true
      : phase === "topic" && !!step && step.kind !== "freeplay"
        ? stepSatisfied
        : false;
  const primaryNext = () => {
    if (phase === "intro") {
      if (introIdx + 1 >= INTRO_STEPS.length) setPhase("topics");
      else setIntroIdx(introIdx + 1);
    } else if (
      phase === "topic" &&
      step &&
      step.kind !== "freeplay" &&
      stepSatisfied
    ) {
      advance();
    }
  };

  /* The top-right Back button mirrors the panel's Back: previous
   * intro card, previous topic card, or out to the topic list from
   * a topic's first card. Disabled where there is nowhere to go
   * back to (the first intro card, the topic list). */
  const backEnabled =
    phase === "topic" ? true : phase === "intro" ? introIdx > 0 : false;
  const primaryBack = () => {
    if (phase === "intro") {
      if (introIdx > 0) setIntroIdx(introIdx - 1);
    } else if (phase === "topic") {
      back();
    }
  };

  const renderPanel = (opts: {
    title: string;
    body: React.ReactNode;
    footer: React.ReactNode;
  }) => (
    <div
      data-tut-panel
      className="tutorial-ui"
      style={
        panelPos
          ? {
              position: "fixed",
              left: panelPos.x,
              top: panelPos.y,
              width: "min(36rem, calc(100vw - 1.5rem))",
              zIndex: 30,
              // The overlay root is pointer-events-none; the panel must
              // opt back in explicitly or every button inside is dead
              // and presses fall through to the game (v1.6.160 bug).
              pointerEvents: "auto",
            }
          : {
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 64,
              margin: "0 auto",
              width: "100%",
              maxWidth: "36rem",
              padding: "0 0.75rem",
              zIndex: 30,
              pointerEvents: "auto",
            }
      }
    >
      <div className="rounded-2xl border border-white/15 bg-[oklch(0.16_0.03_20)]/95 p-4 shadow-2xl backdrop-blur">
        <div
          className="mb-2 flex cursor-grab touch-none items-center justify-between gap-2 active:cursor-grabbing"
          onPointerDown={onPanelHeadDown}
        >
          <div className="flex items-center gap-2">
            <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--gold)]">
              {opts.title}
            </div>
            <button
              type="button"
              aria-label={voiceOff ? "Unmute voice" : "Mute voice"}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={toggleVoice}
              className="shrink-0"
            >
              <img
                src={voiceOff ? iconSpeakerMuted : iconSpeaker}
                alt=""
                className="h-6 w-6 object-contain"
                draggable={false}
              />
            </button>
          </div>
          <div className="text-[9px] uppercase tracking-wider text-white/35">
            Drag to move
          </div>
        </div>
        {guardNotice && phase === "topic" && (
          <div className="mb-2 rounded-lg bg-red-500/15 px-2.5 py-1.5 text-xs font-medium text-red-200">
            {guardNotice}
          </div>
        )}
        <div className="max-h-[30dvh] overflow-y-auto">{opts.body}</div>
        {opts.footer}
      </div>
    </div>
  );

  const bodyParas = (text: string) =>
    text.split("\n\n").map((para, i) => (
      <p key={i} className="mb-2 text-sm leading-relaxed text-white/90 last:mb-0">
        {para}
      </p>
    ));

  return (
    <div className="pointer-events-none fixed inset-0 z-[400]">
      {/* The voice narration player (one element for the whole session). */}
      {/* Exit tutorial: under the settings cog, top left (Ronya 2026-11-17). */}
      <button
        type="button"
        onClick={onExit}
        className="tutorial-ui pointer-events-auto absolute left-2 top-[60px] z-30 text-xs font-semibold text-white/75 underline underline-offset-2"
      >
        Exit tutorial
      </button>

      {/* Full-page still for Hosting / Tournament creation steps.
          It covers the room completely; the exit link and the
          Back / Next / Captions row are overlay UI above it. */}
      {hlBox && (
        <div
          className="tut-hl-box"
          style={{
            left: hlBox.x - 5,
            top: hlBox.y - 5,
            width: hlBox.w + 10,
            height: hlBox.h + 10,
          }}
        />
      )}

      {phase === "topic" && step?.kind === "still" && step.still && (
        <div
          className="absolute inset-0 z-20 flex items-center justify-center"
          style={{
            // The still layer covers the whole screen above the room,
            // corner to corner with no cutout: a notch left a visible
            // chunk of room background overlapping the still's corner
            // (Ronya 2026-11-18). Its surround is the tutorial's own
            // red backdrop, never black (also Ronya 2026-11-18).
            background: "var(--gradient-bg)",
          }}
        >
          <div
            className="relative"
            style={{
              width: "min(100vw, calc(100dvh * 0.64128))",
              height: "min(100dvh, calc(100vw * 1.5594))",
            }}
          >
            <img src={step.still} alt="" className="h-full w-full object-cover" />
            {step.hlBox && (
              <div
                className="absolute rounded-md border-[3px] border-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.85)]"
                style={{
                  left: `${step.hlBox.x}%`,
                  top: `${step.hlBox.y}%`,
                  width: `${step.hlBox.w}%`,
                  height: `${step.hlBox.h}%`,
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Drag target zone for Controls practice. */}
      {phase === "topic" && step?.kind === "drag" && zoneRect && (
        <div
          ref={zoneElRef}
          className="tut-zone"
          style={{
            left: zoneRect.left,
            top: zoneRect.top,
            width: zoneRect.width,
            height: zoneRect.height,
          }}
        >
          {step.zoneLabel ?? "Drop here"}
        </div>
      )}

      {/* Top-right tutorial controls (Ronya 2026-11-18): a 3D
          play/next button that serves as Continue from anywhere
          (including while the text box is hidden), and a CC button
          that hides or shows the text box completely. The play
          button glows once the voice has finished reading the card;
          it can be tapped at any time, it never makes the player
          wait for the glow. */}
      {!freeplayLive && (
        <div className="tutorial-ui pointer-events-auto absolute right-2 top-2 z-30 flex items-start gap-2">
          <button
            type="button"
            aria-label="Back to previous card"
            disabled={!backEnabled}
            onClick={primaryBack}
            className={`flex flex-col items-center gap-[3px] ${!backEnabled ? "opacity-40" : ""}`}
          >
            <img
              src={iconNext}
              alt=""
              draggable={false}
              style={{ transform: "scaleX(-1)" }}
              className="h-[35px] w-[35px] object-contain"
            />
            <span className="text-[9px] font-bold uppercase tracking-wider text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
              Back
            </span>
          </button>
          <button
            type="button"
            aria-label="Next card"
            disabled={!nextEnabled}
            onClick={primaryNext}
            className={`flex flex-col items-center gap-[3px] ${!nextEnabled ? "opacity-40" : ""}`}
          >
            <img
              src={iconNext}
              alt=""
              draggable={false}
              className={`h-[35px] w-[35px] object-contain ${
                nextEnabled && voiceDone ? "tut-next-glow" : ""
              }`}
            />
            <span className="text-[9px] font-bold uppercase tracking-wider text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
              Next
            </span>
          </button>
          <button
            type="button"
            aria-label={textHidden ? "Show text" : "Hide text"}
            aria-pressed={textHidden}
            onClick={() => setTextHidden((h) => !h)}
            className="flex flex-col items-center gap-[3px]"
          >
            <span
              style={{ padding: 0 }}
              className={`btn-3d btn-3d-blue grid h-[35px] w-[35px] place-items-center rounded-full text-[11px] font-extrabold tracking-tighter ${
                textHidden ? "opacity-50" : ""
              }`}
            >
              CC
            </span>
            <span className="text-[9px] font-bold uppercase tracking-wider text-white [text-shadow:0_1px_3px_rgba(0,0,0,0.9)]">
              Captions
            </span>
          </button>
        </div>
      )}

      {/* Free play: the text box gets out of the way; only the Continue
          Tutorial button appears, under the winner announcement. */}
      {freeplayLive ? (
        freeplayWon ? (
          <button
            type="button"
            onClick={finishFreeplay}
            className="tutorial-ui btn-3d btn-3d-gold pointer-events-auto absolute left-1/2 top-[63%] z-30 -translate-x-1/2 px-6 py-3 text-base"
          >
            Continue Tutorial
          </button>
        ) : null
      ) : textHidden ? (
        phase === "topic" && step?.kind === "freeplay" ? (
          // Captions off on a free-play card: the panel is hidden, but
          // the Start Free Play button still shows, in the area where
          // the text panel normally sits (Ronya 2026-11-18).
          <div
            className="tutorial-ui pointer-events-auto absolute left-0 right-0 z-30 flex justify-center"
            style={{ bottom: 64 }}
          >
            <button
              type="button"
              className="btn-3d btn-3d-gold px-5 py-2 text-sm"
              onClick={startFreeplay}
            >
              Start Free Play
            </button>
          </div>
        ) : null
      ) : phase === "intro" ? (
        renderPanel({
          title: "Guided Tutorial",
          body: bodyParas(INTRO_STEPS[introIdx]),
          footer: (
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="btn-3d btn-3d-gold px-5 py-2 text-sm"
                onClick={() => {
                  if (introIdx + 1 >= INTRO_STEPS.length) setPhase("topics");
                  else setIntroIdx(introIdx + 1);
                }}
              >
                Continue
              </button>
            </div>
          ),
        })
      ) : phase === "topics" ? (
        renderPanel({
          title: "Guided Tutorial",
          body: (
            <>
              <p className="mb-1 text-sm leading-relaxed text-white/90">
                {topicsLine(completed.length)}
              </p>
            </>
          ),
          footer: <div />,
        })
      ) : phase === "alldone" ? (
        renderPanel({
          title: "Guided Tutorial",
          body: (
            <p className="text-sm leading-relaxed text-white/90">
              {ALLDONE_TEXT}
            </p>
          ),
          footer: (
            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                className="btn-3d btn-3d-gold px-5 py-2 text-sm"
                onClick={onExit}
              >
                Exit Tutorial
              </button>
            </div>
          ),
        })
      ) : step ? (
        renderPanel({
          title: panelTitle,
          body: (
            <>
              {bodyParas(step.body)}
              {isActionStep &&
                (stepSatisfied ? (
                  <p className="mt-1 text-xs font-semibold text-emerald-300">
                    {autoAdvFor === stepSig
                      ? "Done!"
                      : "Done. Tap Continue."}
                  </p>
                ) : (
                  <p className="mt-1 text-xs font-semibold text-amber-300">
                    Complete action to continue
                  </p>
                ))}
            </>
          ),
          footer:
            step.kind === "freeplay" ? (
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="btn-3d btn-3d-blue px-4 py-2 text-sm"
                  onClick={back}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn-3d btn-3d-gold px-5 py-2 text-sm"
                  onClick={startFreeplay}
                >
                  Start Free Play
                </button>
              </div>
            ) : (
              <div className="mt-3 flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="btn-3d btn-3d-blue px-4 py-2 text-sm"
                  onClick={back}
                >
                  Back
                </button>
                <button
                  type="button"
                  disabled={!stepSatisfied}
                  className="btn-3d btn-3d-gold px-5 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={advance}
                >
                  Continue
                </button>
              </div>
            ),
        })
      ) : null}

      {/* Bottom bar: topics, or the current topic's chapters. */}
      {!freeplayLive && (phase === "topics" || phase === "alldone") && (
        <div className="tutorial-ui pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex items-center gap-1.5 overflow-x-auto bg-black/45 px-2 py-2 backdrop-blur-sm">
          {TUT_TOPICS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => enterTopic(t.id)}
              className={`btn-3d ${TOPIC_BTN[t.id]} flex-1 whitespace-nowrap px-2 py-2 text-xs`}
            >
              {t.label}
              {completed.includes(t.id) ? " ✓" : ""}
            </button>
          ))}
        </div>
      )}
      {!freeplayLive && phase === "topic" && topicId && (
        <div className="tutorial-ui pointer-events-auto absolute inset-x-0 bottom-0 z-20 flex items-center gap-1.5 overflow-x-auto bg-black/45 px-2 py-2 backdrop-blur-sm">
          <button
            type="button"
            className="btn-3d btn-3d-blue px-3 py-2 text-xs"
            onClick={() => {
              onResetView();
              setPhase("topics");
              setTopicId(null);
            }}
          >
            Topics
          </button>
          {chapters.map((c) => {
            const isCurrent = c.name === currentChapter;
            // Gameplay chapters are one continuous guided path through
            // the scripted room, so only the current chapter is a jump
            // target there; other topics can jump freely.
            const disabled = topicId === "gameplay" && !isCurrent;
            return (
              <button
                key={c.name}
                type="button"
                disabled={disabled}
                onClick={() => setStepIdx(c.firstIdx)}
                className={`btn-3d flex-1 whitespace-nowrap px-2 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40 ${
                  isCurrent ? "btn-3d-gold" : "btn-3d-blue"
                }`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
