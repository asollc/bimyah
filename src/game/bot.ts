import type { GameState, Player, Card, Rank } from "./types";
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
 * Bot AI v2.
 *
 * Primary objective: WIN. Secondary: prevent stalemates.
 *
 * Behavior phases (relative to state.startedAt):
 *   0–30s   : "Build mode" — only swaps that help build a set, or that move
 *             a useful rank from one of the bot's other piles into the open
 *             pile. No taking center cards that don't match a target rank.
 *   30–45s  : Same as above, plus: if a pile holds 3-of-a-kind, swap the
 *             remaining non-matching cards out of all other piles to try to
 *             trade for the 4th matching card.
 *   45s–2m  : If a pile holds 3-of-a-kind, the bot may also pivot — swap
 *             the 3 matching cards themselves to try to build sets with
 *             different ranks, prioritizing center ranks that appear more
 *             than once.
 *   2m+     : Cooperative mode — also help humans complete sets they have
 *             3-of-a-kind for, by feeding their ranks into the center.
 *
 * Other rules:
 *   - At match start, each bot picks a target rank per pile based on which
 *     ranks appear more than once across that pile (rule 2).
 *   - If another player swaps away a card the bot needs to complete a set,
 *     the bot re-evaluates and may switch targets (rule 3).
 *   - Bots do at least one swap every 5 seconds (rule 7).
 *   - Bots never make the same (handCardId → centerSlotIndex) swap more
 *     than twice (rule 7).
 *   - Bots SET immediately on 4-of-a-kind in hand (rule 9).
 */

type BotMemory = {
  // per-bot per-game last action timestamp
  nextActionAt: Map<string, number>;
  closeAfter: Map<string, number>;

  // Rule 2/3: per-bot per-pile target rank (the rank the bot is trying to
  // build into that pile). Key = `${botId}:${pileIndex}`. Recomputed each
  // match start and re-evaluated when the desired rank disappears from
  // reachable sources (other players' hands, center, our piles).
  pileTarget: Map<string, Rank | null>;

  // Match number this memory was initialized for, so we re-seed pileTarget
  // when a new match begins.
  initializedMatch: Map<string, number>;

  // Rule 7: swap repetition tracking. Key = `${botId}:${handCardId}->${centerIdx}`.
  swapCount: Map<string, number>;

  // Rule 7: last swap timestamp per bot, used to enforce >=1 swap per 5s.
  lastSwapAt: Map<string, number>;

  // Rule 8 last donation timestamp to throttle altruistic moves.
  lastHelpAt: Map<string, number>;
};

export function createBotMemory(): BotMemory {
  return {
    nextActionAt: new Map(),
    closeAfter: new Map(),
    pileTarget: new Map(),
    initializedMatch: new Map(),
    swapCount: new Map(),
    lastSwapAt: new Map(),
    lastHelpAt: new Map(),
  };
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function rankCounts(cards: Card[]): Map<Rank, number> {
  const counts = new Map<Rank, number>();
  for (const c of cards) counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
  return counts;
}

function modeRank(cards: Card[]): { rank: Rank | null; count: number } {
  const counts = rankCounts(cards);
  let best: { rank: Rank | null; count: number } = { rank: null, count: 0 };
  for (const [r, c] of counts) if (c > best.count) best = { rank: r, count: c };
  return best;
}

/** Initialize per-pile target ranks for a bot at match start (rule 2). */
function initBotTargets(state: GameState, bot: Player, mem: BotMemory) {
  const matchKey = bot.id;
  if (mem.initializedMatch.get(matchKey) === state.matchNumber) return;
  mem.initializedMatch.set(matchKey, state.matchNumber);

  // Clear stale per-pile and swap data from previous matches.
  for (const k of Array.from(mem.pileTarget.keys())) {
    if (k.startsWith(`${bot.id}:`)) mem.pileTarget.delete(k);
  }
  for (const k of Array.from(mem.swapCount.keys())) {
    if (k.startsWith(`${bot.id}:`)) mem.swapCount.delete(k);
  }

  // For each pile, look at the 4 cards. Pick the rank with the highest
  // count (>=2 preferred). Avoid assigning the same target rank to two
  // different piles for the same bot.
  const claimed = new Set<Rank>();
  // Process piles sorted by their best-count desc so the pile with the
  // strongest head-start gets first pick of its top rank.
  const order = bot.piles
    .map((pile, i) => ({ i, best: modeRank(pile) }))
    .sort((a, b) => b.best.count - a.best.count);

  for (const { i, best } of order) {
    const key = `${bot.id}:${i}`;
    if (best.rank && best.count >= 2 && !claimed.has(best.rank)) {
      mem.pileTarget.set(key, best.rank);
      claimed.add(best.rank);
    } else {
      // Fallback: try the next-most-common rank in that pile that isn't claimed.
      const counts = rankCounts(bot.piles[i] ?? []);
      const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
      const pick = sorted.find(([r]) => !claimed.has(r));
      if (pick) {
        mem.pileTarget.set(key, pick[0]);
        claimed.add(pick[0]);
      } else {
        mem.pileTarget.set(key, null);
      }
    }
  }
}

/** Get the target rank for the currently open pile, if any. */
function currentTarget(bot: Player, mem: BotMemory): Rank | null {
  if (bot.openPileIndex === null) return null;
  return mem.pileTarget.get(`${bot.id}:${bot.openPileIndex}`) ?? null;
}

/** Count how many copies of `rank` are reachable for the bot to acquire. */
function reachableCopies(state: GameState, botId: string, rank: Rank): number {
  let n = 0;
  for (const slot of state.center) {
    if (slot.card?.rank === rank && slot.heldBy === null) n++;
  }
  // Cards in own piles + own hand also count toward "still buildable".
  const me = state.players.find((p) => p.id === botId);
  if (me) {
    for (let i = 0; i < me.piles.length; i++) {
      if (me.pileLocked[i]) continue;
      for (const c of me.piles[i]) if (c.rank === rank) n++;
    }
    for (const c of me.hand) if (c.rank === rank) n++;
  }
  return n;
}

/**
 * Rule 3: if the current pile's target rank is no longer achievable
 * (we have <4 reachable copies), pivot to a new target chosen from the
 * cards we currently have in this pile/hand.
 */
function maybeRetarget(state: GameState, bot: Player, mem: BotMemory) {
  if (bot.openPileIndex === null) return;
  const key = `${bot.id}:${bot.openPileIndex}`;
  const target = mem.pileTarget.get(key) ?? null;
  if (target && reachableCopies(state, bot.id, target) >= 4) return;

  // Pick a new target: best rank in current hand we can still reach 4 of.
  const handCounts = rankCounts(bot.hand);
  const candidates = Array.from(handCounts.entries()).sort((a, b) => b[1] - a[1]);
  for (const [r] of candidates) {
    if (reachableCopies(state, bot.id, r) >= 4) {
      mem.pileTarget.set(key, r);
      return;
    }
  }
  // No realistic target — leave it null; the bot will swap toward
  // whatever the center offers next.
  mem.pileTarget.set(key, null);
}

/** Find which (other) pile of the bot holds the most matches for `rank`. */
function pileWithMostOf(bot: Player, rank: Rank, exclude: number): { idx: number; count: number } {
  let best = { idx: -1, count: 0 };
  for (let i = 0; i < bot.piles.length; i++) {
    if (i === exclude) continue;
    if (bot.pileLocked[i]) continue;
    let c = 0;
    for (const card of bot.piles[i]) if (card.rank === rank) c++;
    if (c > best.count) best = { idx: i, count: c };
  }
  return best;
}

/** Count rank occurrences in the center (face-up, unheld). */
function centerRankCounts(state: GameState): Map<Rank, number> {
  const m = new Map<Rank, number>();
  for (const slot of state.center) {
    if (slot.card && slot.heldBy === null) {
      m.set(slot.card.rank, (m.get(slot.card.rank) ?? 0) + 1);
    }
  }
  return m;
}

/** Pick a center index whose card matches one of `wantedRanks`. */
function findCenterCard(
  state: GameState,
  wantedRanks: Set<Rank>,
  preferDuplicates = false,
): number {
  const counts = centerRankCounts(state);
  let best = -1;
  let bestScore = -1;
  state.center.forEach((slot, i) => {
    if (!slot.card || slot.heldBy) return;
    if (!wantedRanks.has(slot.card.rank)) return;
    const score = preferDuplicates ? counts.get(slot.card.rank) ?? 1 : 1;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Rule 7: was this exact swap already attempted twice? */
function swapBlocked(mem: BotMemory, botId: string, handCardId: string, centerIdx: number): boolean {
  const k = `${botId}:${handCardId}->${centerIdx}`;
  return (mem.swapCount.get(k) ?? 0) >= 2;
}
function recordSwap(mem: BotMemory, botId: string, handCardId: string, centerIdx: number) {
  const k = `${botId}:${handCardId}->${centerIdx}`;
  mem.swapCount.set(k, (mem.swapCount.get(k) ?? 0) + 1);
  mem.lastSwapAt.set(botId, Date.now());
}

/** Pick which hand card to throw away when completing a swap into center slot `centerIdx`. */
function pickThrowaway(
  bot: Player,
  mem: BotMemory,
  centerIdx: number,
  protectRank: Rank | null,
): Card | null {
  // Candidates: any hand card not matching protectRank, ordered by "least useful first".
  // Useful = matches another pile's target rank. Avoid throwing away cards that
  // we plan to relocate.
  const targetRank = protectRank;
  const handByUsefulness = [...bot.hand].sort((a, b) => {
    const aProt = targetRank && a.rank === targetRank ? 1 : 0;
    const bProt = targetRank && b.rank === targetRank ? 1 : 0;
    if (aProt !== bProt) return aProt - bProt; // protected last
    return 0;
  });
  for (const c of handByUsefulness) {
    if (targetRank && c.rank === targetRank) continue;
    if (!swapBlocked(mem, bot.id, c.id, centerIdx)) return c;
  }
  // Fallback: any card not blocked.
  for (const c of bot.hand) {
    if (!swapBlocked(mem, bot.id, c.id, centerIdx)) return c;
  }
  return null;
}

export function stepBots(
  state: GameState,
  memory: BotMemory,
  apply: (mutator: (s: GameState) => GameState) => void,
): void {
  if (state.status !== "playing") return;
  const now = Date.now();
  const elapsedMs = state.startedAt ? now - state.startedAt : 0;
  const phaseAggressive = elapsedMs >= 30_000; // rule 5
  const phasePivot = elapsedMs >= 45_000; // rule 6
  const phaseCoop = elapsedMs >= 120_000; // rule 8

  for (const bot of state.players) {
    if (!bot.isBot) continue;

    // Rule 2: initialize targets at match start
    initBotTargets(state, bot, memory);

    const next = memory.nextActionAt.get(bot.id) ?? 0;
    if (now < next) continue;
    memory.nextActionAt.set(bot.id, now + rand(700, 1500));

    // Rule 9: WIN if possible.
    if (canDeclareBimyah(state, bot.id)) {
      apply((s) => declareBimyah(s, bot.id));
      return;
    }

    // Rule 9: SET immediately if hand is 4-of-a-kind.
    if (
      bot.openPileIndex !== null &&
      bot.hand.length === 4 &&
      isFourOfAKind(bot.hand)
    ) {
      apply((s) => declareSet(s, bot.id));
      continue;
    }

    // Rule 3: re-evaluate target if the rank we're chasing isn't reachable.
    maybeRetarget(state, bot, memory);

    // Step A: Complete an in-flight hold (we already grabbed a center card).
    const heldIdx = state.center.findIndex((sl) => sl.heldBy === bot.id);
    if (heldIdx !== -1) {
      if (bot.hand.length === 0) continue;
      const target = currentTarget(bot, memory);
      const throwaway = pickThrowaway(bot, memory, heldIdx, target);
      if (!throwaway) {
        // Can't swap without violating rule 7 — let the hold expire.
        continue;
      }
      recordSwap(memory, bot.id, throwaway.id, heldIdx);
      apply((s) => swapCard(s, bot.id, throwaway.id));
      continue;
    }

    // Step B: open a pile if none is open.
    if (bot.openPileIndex === null) {
      // Prefer a pile whose target rank still has reachable copies.
      const candidates: Array<{ i: number; score: number }> = [];
      for (let i = 0; i < bot.piles.length; i++) {
        if (bot.pileLocked[i]) continue;
        if (!bot.piles[i] || bot.piles[i].length === 0) continue;
        const t = memory.pileTarget.get(`${bot.id}:${i}`) ?? null;
        const own = bot.piles[i].filter((c) => c.rank === t).length;
        const score = t ? own + reachableCopies(state, bot.id, t) * 0.1 : 0.01;
        candidates.push({ i, score });
      }
      if (candidates.length === 0) continue;
      candidates.sort((a, b) => b.score - a.score);
      // Slight randomness so bots don't always pick the same pile order.
      const top = candidates.slice(0, Math.min(2, candidates.length));
      const pick = top[Math.floor(Math.random() * top.length)].i;
      apply((s) => openPile(s, bot.id, pick));
      memory.closeAfter.set(bot.id, now + rand(2200, 3800));
      continue;
    }

    // Step C: a pile is open. Decide what to do.
    const target = currentTarget(bot, memory);
    const handCounts = rankCounts(bot.hand);
    const haveOfTarget = target ? handCounts.get(target) ?? 0 : 0;

    // Rule 7: if we haven't swapped in >=5s, try harder to make ANY useful swap.
    const lastSwap = memory.lastSwapAt.get(bot.id) ?? state.startedAt ?? now;
    const overdueSwap = now - lastSwap >= 5000;

    // ===== Build wanted-rank set based on phase =====
    const wantedRanks = new Set<Rank>();
    if (target) wantedRanks.add(target);

    // Rule 8: cooperative phase — also want ranks that humans have 3+ of in any pile.
    if (phaseCoop) {
      for (const other of state.players) {
        if (other.isBot || other.id === bot.id) continue;
        for (let i = 0; i < other.piles.length; i++) {
          if (other.pileLocked[i]) continue;
          const counts = rankCounts(other.piles[i]);
          for (const [r, c] of counts) if (c >= 3) wantedRanks.add(r);
        }
        // Also include hand-based 3-of-a-kind (open pile).
        const hc = rankCounts(other.hand);
        for (const [r, c] of hc) if (c >= 3) wantedRanks.add(r);
      }
    }

    // Step C1: try to take a useful center card.
    let centerIdx = findCenterCard(state, wantedRanks, /*preferDuplicates*/ false);

    // Rule 6: phase-pivot — if we have 3-of-a-kind in this hand and we're
    // past 45s, also accept center cards of OTHER ranks (preferring duplicates).
    if (centerIdx === -1 && phasePivot && target && haveOfTarget >= 3) {
      const counts = centerRankCounts(state);
      // Build a set of "any rank that appears in center", preferring those
      // with multiples; we still want to grab one that gives us a fresh start.
      const anyRanks = new Set<Rank>();
      for (const r of counts.keys()) if (r !== target) anyRanks.add(r);
      centerIdx = findCenterCard(state, anyRanks, /*preferDuplicates*/ true);
      // If we take this card, retarget this pile to its rank.
      if (centerIdx !== -1 && bot.openPileIndex !== null) {
        const newRank = state.center[centerIdx].card?.rank ?? null;
        if (newRank) memory.pileTarget.set(`${bot.id}:${bot.openPileIndex}`, newRank);
      }
    }

    // Rule 7 fallback: overdue for a swap — accept ANY center card.
    if (centerIdx === -1 && overdueSwap) {
      const anyRanks = new Set<Rank>();
      for (const slot of state.center) {
        if (slot.card && slot.heldBy === null) anyRanks.add(slot.card.rank);
      }
      centerIdx = findCenterCard(state, anyRanks, true);
    }

    if (centerIdx !== -1) {
      // Rule 4 (early phase): only proceed if this is genuinely build-helpful
      // OR a relocation move OR we're overdue.
      const centerRank = state.center[centerIdx].card?.rank;
      const helpful =
        (target && centerRank === target) ||
        (phaseCoop && centerRank && wantedRanks.has(centerRank)) ||
        (phasePivot && target && haveOfTarget >= 3) ||
        overdueSwap;
      if (helpful || phaseAggressive) {
        // Make sure we have a non-blocked throwaway available BEFORE holding.
        const probe = pickThrowaway(bot, memory, centerIdx, target);
        if (probe) {
          apply((s) => holdCenterCard(s, bot.id, centerIdx));
          continue;
        }
      }
    }

    // Step C2: relocate a useful rank from one of our other piles into the
    // open pile. This is "moving cards over to other card piles to build a
    // set" (rule 4). We do this by swapping out a non-target hand card for
    // a center card that sits between us and that pile — but the simplest
    // proxy is: if a non-open pile of ours has 2+ of our target rank and
    // the open pile has fewer of that rank, mark the open-pile target to
    // match instead (so future swaps fill it). When we eventually close and
    // reopen the richer pile, we'll continue building there.
    if (target && bot.openPileIndex !== null) {
      const richer = pileWithMostOf(bot, target, bot.openPileIndex);
      const ownInOpen = bot.piles[bot.openPileIndex].filter((c) => c.rank === target).length
        + handCounts.get(target) ?? 0;
      if (richer.idx !== -1 && richer.count > ownInOpen) {
        // Close current pile and open the richer one next tick.
        apply((s) => closePile(s, bot.id));
        // Set its target so when we open it we keep building.
        memory.pileTarget.set(`${bot.id}:${richer.idx}`, target);
        continue;
      }
    }

    // Step C3: rule 5 — past 30s, if we have 3-of-a-kind in the hand,
    // aggressively cycle non-matching cards out via the center, even if
    // the center doesn't show our target (we'll dump and try again).
    if (phaseAggressive && target && haveOfTarget >= 3) {
      // Hold any center card so we can exchange a non-target hand card.
      const anySlot = state.center.findIndex(
        (sl) => sl.card && sl.heldBy === null,
      );
      if (anySlot !== -1) {
        const probe = pickThrowaway(bot, memory, anySlot, target);
        if (probe) {
          apply((s) => holdCenterCard(s, bot.id, anySlot));
          continue;
        }
      }
    }

    // Step C4: rule 8 — donate a card we don't need into the center to help
    // a human who has 3-of-a-kind of that rank. We do this by simply taking
    // any center card and throwing one of theirs into the center.
    if (phaseCoop) {
      const lastHelp = memory.lastHelpAt.get(bot.id) ?? 0;
      if (now - lastHelp >= 8000) {
        // Find a hand card whose rank is wanted by a human.
        const humanWanted = new Set<Rank>();
        for (const other of state.players) {
          if (other.isBot || other.id === bot.id) continue;
          for (let i = 0; i < other.piles.length; i++) {
            if (other.pileLocked[i]) continue;
            const counts = rankCounts(other.piles[i]);
            for (const [r, c] of counts) if (c >= 3) humanWanted.add(r);
          }
          const hc = rankCounts(other.hand);
          for (const [r, c] of hc) if (c >= 3) humanWanted.add(r);
        }
        const donor = bot.hand.find(
          (c) => humanWanted.has(c.rank) && c.rank !== target,
        );
        if (donor) {
          // Take any center card so we can throw the donor into play.
          const anySlot = state.center.findIndex(
            (sl) => sl.card && sl.heldBy === null,
          );
          if (anySlot !== -1 && !swapBlocked(memory, bot.id, donor.id, anySlot)) {
            memory.lastHelpAt.set(bot.id, now);
            apply((s) => holdCenterCard(s, bot.id, anySlot));
            continue;
          }
        }
      }
    }

    // Step C5: nothing useful — close the pile and try a different one
    // (also helps bots refresh their target when stuck).
    const closeAt = memory.closeAfter.get(bot.id) ?? 0;
    if (now >= closeAt) {
      apply((s) => closePile(s, bot.id));
    }
  }
}
