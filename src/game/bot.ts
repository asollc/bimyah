import type { GameState, Player, Card } from "./types";
import {
  openPile,
  closePile,
  holdCenterCard,
  swapCard,
  declareSet,
  canDeclareBimyah,
  declareBimyah,
} from "./engine";
import { isFourOfAKind } from "./deck";

/**
 * Simple bot AI - steady pace.
 * Each call advances ONE bot decision for ONE bot. The driver loops calls.
 *
 * Strategy:
 *  - If can declare BIMYAH, do it.
 *  - If hand is 4-of-a-kind and pile open, SET.
 *  - If holding a center card → swap with worst hand card.
 *  - If pile open and not holding → consider picking a center card that improves the pile.
 *  - If no pile open → pick a random unlocked pile.
 *  - Occasionally close pile (no good moves) and pick a different one.
 */

type BotMemory = {
  // per-bot per-game last action timestamp
  nextActionAt: Map<string, number>;
  closeAfter: Map<string, number>;
};

export function createBotMemory(): BotMemory {
  return { nextActionAt: new Map(), closeAfter: new Map() };
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function modeRank(cards: Card[]): { rank: string; count: number } {
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  let best = { rank: "", count: 0 };
  for (const [r, c] of counts) if (c > best.count) best = { rank: r, count: c };
  return best;
}

export function stepBots(
  state: GameState,
  memory: BotMemory,
  apply: (mutator: (s: GameState) => GameState) => void,
): void {
  if (state.status !== "playing") return;
  const now = Date.now();
  for (const bot of state.players) {
    if (!bot.isBot) continue;
    const next = memory.nextActionAt.get(bot.id) ?? 0;
    if (now < next) continue;

    // Schedule next decision in 700-1500ms
    memory.nextActionAt.set(bot.id, now + rand(700, 1500));

    // 1. Win check
    if (canDeclareBimyah(state, bot.id)) {
      apply((s) => declareBimyah(s, bot.id));
      return;
    }

    // 2. SET check
    if (
      bot.openPileIndex !== null &&
      bot.hand.length === 4 &&
      isFourOfAKind(bot.hand)
    ) {
      apply((s) => declareSet(s, bot.id));
      continue;
    }

    // 3. If holding center card → swap
    const holdSlot = state.center.findIndex((sl) => sl.heldBy === bot.id);
    if (holdSlot !== -1) {
      // Pick hand card to throw away: one not matching the mode rank
      if (bot.hand.length === 0) continue;
      const target = modeRank(bot.hand);
      // The held card is the LAST one in hand
      const holdCard = bot.hand[bot.hand.length - 1];
      // If the held card is target rank → great, throw away a different card
      let throwAway: Card | undefined;
      if (holdCard.rank === target.rank) {
        // Throw away a card whose rank isn't target
        throwAway = bot.hand.find((c) => c.rank !== target.rank && c.id !== holdCard.id);
        // Fallback: throw any non-held card
        if (!throwAway) throwAway = bot.hand.find((c) => c.id !== holdCard.id);
      } else {
        // The held card is useless → return it (swap held card back)
        throwAway = holdCard;
      }
      if (!throwAway) continue;
      apply((s) => swapCard(s, bot.id, throwAway!.id));
      continue;
    }

    // 4. No pile open → open a random unlocked pile
    if (bot.openPileIndex === null) {
      const candidates: number[] = [];
      bot.pileLocked.forEach((locked, i) => {
        if (!locked && bot.piles[i] && bot.piles[i].length > 0) candidates.push(i);
      });
      if (candidates.length === 0) continue;
      const pick = candidates[Math.floor(Math.random() * candidates.length)];
      apply((s) => openPile(s, bot.id, pick));
      memory.closeAfter.set(bot.id, now + rand(2200, 3500));
      continue;
    }

    // 5. Pile open, not holding → consider taking a center card
    const target = modeRank(bot.hand);
    const useful = state.center.findIndex(
      (sl) => sl.card !== null && sl.heldBy === null && sl.card.rank === target.rank,
    );
    if (useful !== -1 && target.count >= 1) {
      apply((s) => holdCenterCard(s, bot.id, useful));
      continue;
    }

    // 6. Otherwise maybe close pile and try another
    const closeAt = memory.closeAfter.get(bot.id) ?? 0;
    if (now >= closeAt) {
      apply((s) => closePile(s, bot.id));
    }
  }
}
