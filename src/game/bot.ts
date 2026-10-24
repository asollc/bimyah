import type { GameState, Player, Card, Rank } from "./types";
import {
  openPile,
  closePile,
  holdCenterCard,
  swapCard,
  declareSet,
  canDeclareBimyah,
  declareBimyah,
  holdFreeCard,
  swapFreeCard,
} from "./engine";
import { isFourOfAKind } from "./deck";

/**
 * Bot AI v3 — strategy write-up (Ronya, 2026-10-23).
 *
 * OBJECTIVE: build a four-of-a-kind set in every one of your piles, then
 * slap BIMYAH before anyone else does. There is no other goal. Bots play
 * to WIN, as fast as their speed limits allow, from the first second of
 * the match. (The old timed phases and the 2-minute "help the humans"
 * mode are gone: feeding opponents their missing cards is losing.)
 *
 * THE FIVE RULES
 *
 * 1. Win as fast as possible, within the existing speed constraints
 *    (0.7–1.5s between actions; a center card can't be claimed until
 *    1.5s after it lands; never repeat the same swap more than twice).
 *
 * 2. Start from your multiples, counted across ALL your cards. At match
 *    start, count ranks over your collective piles: the ranks you hold
 *    the most of overall are the sets you build. Each pile is assigned
 *    the strongest of those collective ranks that the pile actually
 *    holds, and no two of your piles chase the same rank.
 *
 * 3. Never stall, even if it costs the game. Every pile target carries a
 *    progress clock: if the number of that rank you hold toward the set
 *    hasn't grown in 7 seconds of active work, abandon the rank. Swap
 *    those cards to the center and build a different rank instead.
 *    (Holding two 9s for a minute waiting on the other two is how games
 *    die.) The 7s value is Ronya's call (2026-10-23) after a simulator
 *    sweep: removing the rule entirely scored 0/60 wins, 30s 0/60, 20s
 *    3/60, 10s 18/60, 7s 30/60, 5s 23/60. The clock is the escape valve
 *    that unsticks doomed builds; longer fuses are monotonically worse.
 *
 * 4. Throw singletons first. When a swap forces you to give up a card,
 *    give up (in order): ranks you hold exactly one of, then non-target
 *    multiples, then abandoned/dumped ranks. Cards that match another
 *    pile's target are protected, and the current target rank is never
 *    thrown. The one exception is the rule 3 dump itself: when you are
 *    deliberately expelling an abandoned rank, that rank's cards go.
 *
 * 5. Games should end in 3–5 minutes. The stall clock (rule 3) plus a
 *    forced card cycle at least every 5 seconds keep every bot in
 *    constant motion, so tables can't freeze.
 *
 * HOW CARDS MOVE: the center is the only road between piles. There is
 * no direct pile-to-pile transfer: to move a card into another pile you
 * swap it to the center first, then the destination pile swaps it in.
 * A bot works one open pile at a time (the open pile's cards are its
 * hand), takes wanted ranks from the center (or from an inactive
 * player's free pile) by swapping out its least useful card per rule 4,
 * and when copies of its focus pile's target are stranded in another of
 * its piles, it runs a fetch mission: swap them to the center from
 * that pile, then swap them in. The bot commits to one focus pile
 * until it locks or proves unproductive, and its rule 3 clock measures
 * active work on a pile, so time spent working other piles (or
 * fetching) never counts as a stall. A target whose copies are locked
 * inside finished sets is dead and gets retargeted immediately.
 * (v3.1, tuned against a headless match simulator: the earlier
 * every-tick "consolidation" planner and pile rotation were measured
 * to waste most actions on open/close thrash and were removed.)
 */

/** Rule 10 (speed): bots wait at least 1.5s after a card lands in a
 *  center slot before claiming it. UNCHANGED from v2. */
const BOT_CENTER_COOLDOWN_MS = 1500;

/** Rule 3: a pile target that hasn't gained a copy in this long is
 *  abandoned and its cards are dumped to the center. */
const STALL_LIMIT_MS = 7_000;

/** Rule 5: a bot must cycle at least one card every this long. */
const FORCE_CYCLE_MS = 15_000;

/** Find a card matching one of `wantedRanks` in any inactive (freeCards)
 *  player's piles that isn't currently held by someone else. */
function findFreeCard(
  state: GameState,
  botId: string,
  wantedRanks: Set<Rank>,
): { ownerId: string; pileIndex: number; cardId: string; rank: Rank } | null {
  for (const owner of state.players) {
    if (!owner.freeCards || owner.id === botId) continue;
    const holds = owner.freePileHolds ?? [];
    for (let i = 0; i < owner.piles.length; i++) {
      if (owner.pileLocked[i]) continue;
      if (holds[i]) continue; // pile already has a held card
      for (const c of owner.piles[i]) {
        if (!wantedRanks.has(c.rank)) continue;
        return { ownerId: owner.id, pileIndex: i, cardId: c.id, rank: c.rank };
      }
    }
  }
  return null;
}

type BotMemory = {
  // Per-bot next-action timestamp (the action cadence / speed limit).
  nextActionAt: Map<string, number>;
  closeAfter: Map<string, number>;

  // Rule 2: per-bot per-pile target rank. Key = `${botId}:${pileIndex}`.
  pileTarget: Map<string, Rank | null>;

  // Match number this memory was seeded for; re-seed on a new match.
  initializedMatch: Map<string, number>;

  // Swap repetition tracking. Key = `${botId}:${handCardId}->${centerIdx}`.
  // A bot never makes the same swap more than twice.
  swapCount: Map<string, number>;

  // Last swap timestamp per bot, for the rule 5 forced cycle.
  lastSwapAt: Map<string, number>;

  // Rule 3: progress clock per pile target.
  // Key = `${botId}:${pileIndex}`.
  targetProgress: Map<string, { rank: Rank; count: number; since: number }>;

  // Rule 3: ranks abandoned for a pile, to be dumped to the center.
  // Key = `${botId}:${pileIndex}`.
  dumpRanks: Map<string, Set<Rank>>;

  // True while the bot's current center hold was started specifically
  // to expel a dumped rank, so the completion throws that rank's card.
  dumpHold: Set<string>;

  // Fetch mission: the focus pile's target rank has copies sitting in
  // another of the bot's piles. The bot goes to that pile, swaps those
  // copies to the center, then returns to the focus pile to swap them
  // in (the center is the only road between piles). Persisted until the
  // source pile is drained, so the mission can't thrash.
  fetchPlan: Map<string, { fromPile: number; rank: Rank } | null>;

  // Focus pile: the pile the bot is committed to finishing next. The bot
  // keeps reopening it instead of rotating, and only moves on when it
  // locks or proves unproductive. (Pile rotation was measured to waste
  // most actions on open/close with ~1 swap per visit.)
  focusPile: Map<string, number | null>;

  // The pile that was open on the previous tick, used to detect a fresh
  // open so the rule 3 progress clock restarts. The clock measures
  // ACTIVE work on a pile: time spent away on other piles must not
  // count, or every revisit instantly "stalls" and dumps the build.
  lastOpenPile: Map<string, number | null>;

  // When the currently open pile was opened (for the unproductive-close
  // rule in step C7).
  openedAt: Map<string, number>;

  // Key = `${botId}:${pileIndex}`: when each pile was last opened.
  // Fresh focus picks prefer the least recently opened pile (among the
  // best builds), because opening a long-closed pile throws its buried
  // cards into circulation, which is what un-wedges the endgame.
  pileLastOpenedAt: Map<string, number>;
};

export function createBotMemory(): BotMemory {
  return {
    nextActionAt: new Map(),
    closeAfter: new Map(),
    pileTarget: new Map(),
    initializedMatch: new Map(),
    swapCount: new Map(),
    lastSwapAt: new Map(),
    targetProgress: new Map(),
    dumpRanks: new Map(),
    dumpHold: new Set(),
    fetchPlan: new Map(),
    focusPile: new Map(),
    lastOpenPile: new Map(),
    openedAt: new Map(),
    pileLastOpenedAt: new Map(),
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

/**
 * How many copies of each rank the bot controls across its hand and all
 * unlocked piles. This is "your cards" for rules 2 and 4. (The open
 * pile's cards live in `hand`, so that pile is skipped here.)
 */
function controlledCounts(bot: Player): Map<Rank, number> {
  const counts = rankCounts(bot.hand);
  for (let i = 0; i < bot.piles.length; i++) {
    if (i === bot.openPileIndex) continue;
    if (bot.pileLocked[i]) continue;
    for (const c of bot.piles[i]) {
      counts.set(c.rank, (counts.get(c.rank) ?? 0) + 1);
    }
  }
  return counts;
}

/** Total copies of `rank` the bot controls (hand + unlocked piles). */
function ownedRankCount(bot: Player, rank: Rank): number {
  return controlledCounts(bot).get(rank) ?? 0;
}

/**
 * What a bot is building, for the training View All Cards window: one
 * entry per distinct pile target with the number of copies of that
 * rank the bot owns, best first. Displayed as "K(3), 4(2), 2(2)".
 */
export function botBuildRanks(
  bot: Player,
  mem: BotMemory,
): Array<{ rank: Rank; count: number }> {
  const byRank = new Map<Rank, number>();
  for (let i = 0; i < bot.piles.length; i++) {
    if (bot.pileLocked[i]) continue;
    const t = mem.pileTarget.get(`${bot.id}:${i}`);
    if (!t || byRank.has(t)) continue;
    const n = ownedRankCount(bot, t);
    if (n > 0) byRank.set(t, n);
  }
  return [...byRank.entries()]
    .map(([rank, count]) => ({ rank, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Total copies of `rank` still in play anywhere (center + every player's
 * unlocked piles/hands). Below 4 the rank can never be completed: the
 * missing copies are locked inside a finished set.
 */
function liveCopies(state: GameState, rank: Rank): number {
  let n = state.center.filter((s) => s.card?.rank === rank).length;
  for (const p of state.players) {
    n += p.hand.filter((c) => c.rank === rank).length;
    p.piles.forEach((pile, i) => {
      if (p.pileLocked[i]) return;
      if (i === p.openPileIndex) return; // hand already counted
      n += pile.filter((c) => c.rank === rank).length;
    });
  }
  return n;
}

/** Rule 2: seed per-pile target ranks at match start, from the ranks
 *  the bot holds the most of across its COLLECTIVE piles. */
function initBotTargets(state: GameState, bot: Player, mem: BotMemory) {
  if (mem.initializedMatch.get(bot.id) === state.matchNumber) return;
  mem.initializedMatch.set(bot.id, state.matchNumber);

  // Clear stale per-pile data from previous matches.
  for (const store of [mem.pileTarget, mem.targetProgress, mem.dumpRanks]) {
    for (const k of Array.from(store.keys())) {
      if (k.startsWith(`${bot.id}:`)) store.delete(k);
    }
  }
  for (const k of Array.from(mem.swapCount.keys())) {
    if (k.startsWith(`${bot.id}:`)) mem.swapCount.delete(k);
  }
  mem.fetchPlan.delete(bot.id);
  mem.dumpHold.delete(bot.id);

  // Collective counts: every card the bot holds, all piles combined.
  // The ranks with the highest collective counts are the build targets.
  const collective = new Map<Rank, number>();
  for (const pile of bot.piles) {
    for (const c of pile) {
      collective.set(c.rank, (collective.get(c.rank) ?? 0) + 1);
    }
  }

  // Assign piles strongest-first: each pile takes the highest-collective
  // rank it actually holds that no other pile of this bot has claimed.
  const claimed = new Set<Rank>();
  const bestCollectiveIn = (pile: Card[]): number =>
    pile.reduce((m, c) => Math.max(m, collective.get(c.rank) ?? 0), 0);
  const order = bot.piles
    .map((pile, i) => ({ i, pile }))
    .sort((a, b) => bestCollectiveIn(b.pile) - bestCollectiveIn(a.pile));

  for (const { i, pile } of order) {
    const key = `${bot.id}:${i}`;
    const present = Array.from(new Set(pile.map((c) => c.rank))).sort(
      (a, b) => (collective.get(b) ?? 0) - (collective.get(a) ?? 0),
    );
    const pick = present.find((r) => !claimed.has(r)) ?? null;
    if (pick) claimed.add(pick);
    mem.pileTarget.set(key, pick);
    mem.dumpRanks.set(key, new Set());
  }
}

/** Get the target rank for the currently open pile, if any. */
function currentTarget(bot: Player, mem: BotMemory): Rank | null {
  if (bot.openPileIndex === null) return null;
  return mem.pileTarget.get(`${bot.id}:${bot.openPileIndex}`) ?? null;
}

/**
 * Rule 3: check the open pile's progress clock. Returns the stalled rank
 * when the target hasn't gained a copy within STALL_LIMIT_MS. Progress
 * (or losing copies, e.g. to a swap) restarts the clock.
 */
function stalledRank(bot: Player, mem: BotMemory, now: number): Rank | null {
  if (bot.openPileIndex === null) return null;
  // A fetch mission in flight IS the attempt to get the missing
  // copies; the rule 3 clock is about a build sitting idle, so it is
  // suspended while a fetch is running.
  if (mem.fetchPlan.get(bot.id)) return null;
  const key = `${bot.id}:${bot.openPileIndex}`;
  const target = mem.pileTarget.get(key) ?? null;
  if (!target) {
    mem.targetProgress.delete(key);
    return null;
  }
  const count = bot.hand.filter((c) => c.rank === target).length;
  const rec = mem.targetProgress.get(key);
  if (!rec || rec.rank !== target || rec.count !== count) {
    mem.targetProgress.set(key, { rank: target, count, since: now });
    return null;
  }
  if (count < 4 && now - rec.since >= STALL_LIMIT_MS) return target;
  return null;
}

/**
 * Rule 3 follow-through: abandon `rank` for this pile (mark it for
 * dumping) and retarget the pile to the best rank left in hand.
 */
function abandonTarget(bot: Player, mem: BotMemory, rank: Rank) {
  if (bot.openPileIndex === null) return;
  const key = `${bot.id}:${bot.openPileIndex}`;
  const dump = mem.dumpRanks.get(key) ?? new Set<Rank>();
  dump.add(rank);
  mem.dumpRanks.set(key, dump);

  const counts = rankCounts(bot.hand);
  const candidates = Array.from(counts.entries())
    .filter(([r]) => !dump.has(r))
    .sort((a, b) => b[1] - a[1]);
  if (candidates.length > 0) {
    mem.pileTarget.set(key, candidates[0][0]);
  } else {
    // Everything in hand is marked for dumping: wipe the slate and
    // start fresh on the most common rank rather than deadlocking.
    dump.clear();
    const best = modeRank(bot.hand);
    mem.pileTarget.set(key, best.rank);
  }
  mem.targetProgress.delete(key);
}

/** Whether a bot is allowed to claim the given center slot right now. */
function slotClaimable(state: GameState, centerIdx: number, now: number): boolean {
  const slot = state.center[centerIdx];
  if (!slot || !slot.card || slot.heldBy) return false;
  const placedAt = slot.placedAt ?? state.startedAt ?? now;
  return now - placedAt >= BOT_CENTER_COOLDOWN_MS;
}

/** Count rank occurrences in the center (face-up, unheld, past cooldown). */
function centerRankCounts(state: GameState, now: number): Map<Rank, number> {
  const m = new Map<Rank, number>();
  state.center.forEach((slot, i) => {
    if (!slotClaimable(state, i, now)) return;
    if (!slot.card) return;
    m.set(slot.card.rank, (m.get(slot.card.rank) ?? 0) + 1);
  });
  return m;
}

/** Pick a center index whose card matches one of `wantedRanks`. */
function findCenterCard(
  state: GameState,
  now: number,
  wantedRanks: Set<Rank>,
  preferDuplicates = false,
): number {
  const counts = centerRankCounts(state, now);
  let best = -1;
  let bestScore = -1;
  state.center.forEach((slot, i) => {
    if (!slotClaimable(state, i, now)) return;
    if (!slot.card) return;
    if (!wantedRanks.has(slot.card.rank)) return;
    const score = preferDuplicates ? counts.get(slot.card.rank) ?? 1 : 1;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  });
  return best;
}

/** Was this exact swap already attempted twice? */
function swapBlocked(mem: BotMemory, botId: string, handCardId: string, centerIdx: number): boolean {
  const k = `${botId}:${handCardId}->${centerIdx}`;
  return (mem.swapCount.get(k) ?? 0) >= 2;
}
function recordSwap(mem: BotMemory, botId: string, handCardId: string, centerIdx: number) {
  const k = `${botId}:${handCardId}->${centerIdx}`;
  mem.swapCount.set(k, (mem.swapCount.get(k) ?? 0) + 1);
  mem.lastSwapAt.set(botId, Date.now());
}

/**
 * Rule 4: pick which hand card to give up in a swap with center slot
 * `centerIdx`. Ronya's exact order, least useful first:
 *   1. ranks the bot holds exactly one of (singletons)
 *   2. non-target multiples, fewest copies first
 *   3. ranks abandoned for this pile (rule 3 dumps)
 *   4. ranks targeted by another pile (protected, almost never thrown)
 *   5. the open pile's target rank (never, unless it's the only card)
 * (The deliberate rule 3 dump does not use this picker: it expels the
 * abandoned rank's own cards via the dumpHold path in stepBots.)
 */
function pickThrowaway(bot: Player, mem: BotMemory, centerIdx: number): Card | null {
  if (bot.hand.length === 0) return null;
  const openKey = bot.openPileIndex !== null ? `${bot.id}:${bot.openPileIndex}` : null;
  const dump = openKey ? mem.dumpRanks.get(openKey) ?? new Set<Rank>() : new Set<Rank>();
  const target = currentTarget(bot, mem);
  const otherTargets = new Set<Rank>();
  for (let i = 0; i < bot.piles.length; i++) {
    if (i === bot.openPileIndex) continue;
    const t = mem.pileTarget.get(`${bot.id}:${i}`);
    if (t) otherTargets.add(t);
  }
  const controlled = controlledCounts(bot);

  const score = (c: Card): number => {
    const n = controlled.get(c.rank) ?? 1;
    if (target && c.rank === target) return 10000;
    if (otherTargets.has(c.rank)) return 500 + n;
    if (n === 1) return 0; // singletons first
    if (dump.has(c.rank)) return 300 + n; // dumps third
    return n * 10; // non-target multiples second
  };

  const ordered = [...bot.hand].sort((a, b) => score(a) - score(b));
  for (const c of ordered) {
    if (!swapBlocked(mem, bot.id, c.id, centerIdx)) return c;
  }
  return bot.hand[0] ?? null;
}

/** Pick a hand card whose rank is in `ranks` (rule 3 dump expulsion). */
function pickDumpCard(bot: Player, mem: BotMemory, centerIdx: number, ranks: Set<Rank>): Card | null {
  for (const c of bot.hand) {
    if (!ranks.has(c.rank)) continue;
    if (!swapBlocked(mem, bot.id, c.id, centerIdx)) return c;
  }
  return null;
}

/** Pick a hand card of exactly `rank` to throw (fetch-mission flush). */
function pickFlushCard(
  bot: Player,
  mem: BotMemory,
  centerIdx: number,
  flushRank: Rank,
): Card | null {
  for (const c of bot.hand) {
    if (c.rank !== flushRank) continue;
    if (!swapBlocked(mem, bot.id, c.id, centerIdx)) return c;
  }
  return null;
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

export function stepBots(
  state: GameState,
  memory: BotMemory,
  apply: (mutator: (s: GameState) => GameState) => void,
): void {
  if (state.status !== "playing") return;
  const now = Date.now();

  for (const bot of state.players) {
    if (!bot.isBot) continue;

    // Rule 2: seed targets at match start.
    initBotTargets(state, bot, memory);

    // Open-pile transition bookkeeping: a fresh work session on a pile
    // restarts its rule 3 progress clock (the clock measures ACTIVE work
    // on the pile, not wall-clock time spent working other piles).
    const prevOpen = memory.lastOpenPile.get(bot.id) ?? null;
    if (prevOpen !== bot.openPileIndex) {
      memory.lastOpenPile.set(bot.id, bot.openPileIndex);
      if (bot.openPileIndex !== null) {
        memory.openedAt.set(bot.id, now);
        memory.pileLastOpenedAt.set(`${bot.id}:${bot.openPileIndex}`, now);
        memory.targetProgress.delete(`${bot.id}:${bot.openPileIndex}`);
      }
    }

    // Speed limit (unchanged): 0.7–1.5s between actions.
    const next = memory.nextActionAt.get(bot.id) ?? 0;
    if (now < next) continue;
    memory.nextActionAt.set(bot.id, now + rand(700, 1500));

    // Rule 1: WIN the moment it's possible.
    if (canDeclareBimyah(state, bot.id)) {
      apply((s) => declareBimyah(s, bot.id));
      return;
    }

    // Rule 1: SET the instant a set is complete.
    if (
      bot.openPileIndex !== null &&
      bot.hand.length === 4 &&
      isFourOfAKind(bot.hand)
    ) {
      apply((s) => declareSet(s, bot.id));
      continue;
    }

    // Step A: complete an in-flight center hold. A hold started as a
    // rule 3 dump expels the abandoned rank's own card; a hold on a
    // fetch mission expels the fetched rank; any other swap throws
    // per rule 4.
    const fetch0 = memory.fetchPlan.get(bot.id) ?? null;
    const heldIdx = state.center.findIndex((sl) => sl.heldBy === bot.id);
    if (heldIdx !== -1) {
      if (bot.hand.length === 0) continue;
      let throwaway: Card | null = null;
      if (memory.dumpHold.has(bot.id) && bot.openPileIndex !== null) {
        memory.dumpHold.delete(bot.id);
        const dump = memory.dumpRanks.get(`${bot.id}:${bot.openPileIndex}`) ?? new Set<Rank>();
        throwaway = pickDumpCard(bot, memory, heldIdx, dump);
      }
      if (!throwaway && fetch0 && bot.openPileIndex === fetch0.fromPile) {
        throwaway = pickFlushCard(bot, memory, heldIdx, fetch0.rank);
      }
      if (!throwaway) throwaway = pickThrowaway(bot, memory, heldIdx);
      if (!throwaway) continue; // let the hold expire rather than break the swap cap
      recordSwap(memory, bot.id, throwaway.id, heldIdx);
      apply((s) => swapCard(s, bot.id, throwaway.id));
      continue;
    }

    // Step A2: complete an in-flight free-card hold the same way.
    let holdingFree = false;
    for (const owner of state.players) {
      if (!owner.freePileHolds) continue;
      if (owner.freePileHolds.some((h) => h?.heldBy === bot.id)) {
        holdingFree = true;
        break;
      }
    }
    if (holdingFree) {
      memory.dumpHold.delete(bot.id);
      const throwaway = pickThrowaway(bot, memory, 0) ?? bot.hand[0];
      if (throwaway) {
        apply((s) => swapFreeCard(s, bot.id, throwaway.id));
      }
      continue;
    }

    // Step B: no pile open — open the most promising one.
    if (bot.openPileIndex === null) {
      // Fetch routing: a live fetch mission goes to its source pile.
      // If the source is drained, the mission is over and we fall
      // through to the focus pick.
      const fetch = memory.fetchPlan.get(bot.id) ?? null;
      if (fetch) {
        const stillThere =
          !bot.pileLocked[fetch.fromPile] &&
          (bot.piles[fetch.fromPile] ?? []).some((c) => c.rank === fetch.rank);
        if (stillThere) {
          apply((s) => openPile(s, bot.id, fetch.fromPile));
          memory.closeAfter.set(bot.id, now + rand(1800, 2800));
          continue;
        }
        memory.fetchPlan.set(bot.id, null);
      }
      // Focus first: keep working the committed pile until it locks or
      // proves unproductive. Only pick fresh (by most target copies)
      // when there is no valid focus.
      let pick = -1;
      const focus = memory.focusPile.get(bot.id) ?? null;
      if (focus !== null && !bot.pileLocked[focus] && bot.piles[focus]?.length) {
        pick = focus;
      }
      if (pick === -1) {
        // Best build first; ties (and near-ties) go to the least
        // recently opened pile so buried cards keep entering play.
        const candidates: Array<{ i: number; score: number; lastOpen: number }> = [];
        for (let i = 0; i < bot.piles.length; i++) {
          if (bot.pileLocked[i]) continue;
          if (!bot.piles[i] || bot.piles[i].length === 0) continue;
          const t = memory.pileTarget.get(`${bot.id}:${i}`) ?? null;
          const own = t ? bot.piles[i].filter((c) => c.rank === t).length : 0;
          candidates.push({
            i,
            score: own,
            lastOpen: memory.pileLastOpenedAt.get(`${bot.id}:${i}`) ?? 0,
          });
        }
        if (candidates.length === 0) continue;
        candidates.sort((a, b) => b.score - a.score || a.lastOpen - b.lastOpen);
        pick = candidates[0].i;
      }
      memory.focusPile.set(bot.id, pick);
      apply((s) => openPile(s, bot.id, pick));
      memory.closeAfter.set(bot.id, now + rand(2200, 3800));
      continue;
    }

    // Step C: a pile is open.
    const openKey = `${bot.id}:${bot.openPileIndex}`;
    const handCounts = rankCounts(bot.hand);

    // Rule 3: abandon a stalled target before anything else, then fall
    // through so the dumping starts on this very tick.
    const stalled = stalledRank(bot, memory, now);
    if (stalled) abandonTarget(bot, memory, stalled);
    // Dead target: its copies are locked inside finished sets and it
    // can never be completed. Retarget now instead of spinning.
    const preTarget = currentTarget(bot, memory);
    if (preTarget && liveCopies(state, preTarget) < 4) {
      abandonTarget(bot, memory, preTarget);
    }
    const target = currentTarget(bot, memory);
    const haveOfTarget = target ? handCounts.get(target) ?? 0 : 0;
    const dump = memory.dumpRanks.get(openKey) ?? new Set<Rank>();

    // Step C0: fetch mission execution. We came to this pile to move
    // its copies of the fetched rank to the center for the focus pile.
    // Swap them out one by one; when none are left in hand the mission
    // is complete, so clear it and close up (step B routes us back to
    // the focus pile to swap the copies in).
    const fetch = memory.fetchPlan.get(bot.id) ?? null;
    if (fetch && bot.openPileIndex === fetch.fromPile) {
      const inHand = handCounts.get(fetch.rank) ?? 0;
      if (inHand === 0) {
        memory.fetchPlan.set(bot.id, null);
        apply((s) => closePile(s, bot.id));
        continue;
      }
      let held = false;
      for (let i = 0; i < state.center.length; i++) {
        if (!slotClaimable(state, i, now)) continue;
        const slotRank = state.center[i].card?.rank;
        if (!slotRank) continue;
        if (slotRank !== fetch.rank && ownedRankCount(bot, slotRank) >= 4) continue;
        if (!pickFlushCard(bot, memory, i, fetch.rank)) continue;
        memory.dumpHold.delete(bot.id);
        apply((s) => holdCenterCard(s, bot.id, i));
        held = true;
        break;
      }
      if (held) continue;
      // No claimable slot this tick: stay on mission and wait.
      continue;
    }

    // Step C1: take the open pile's target rank from the center.
    if (target && haveOfTarget < 4 && ownedRankCount(bot, target) < 4) {
      const idx = findCenterCard(state, now, new Set([target]));
      if (idx !== -1 && pickThrowaway(bot, memory, idx)) {
        memory.dumpHold.delete(bot.id);
        apply((s) => holdCenterCard(s, bot.id, idx));
        continue;
      }
    }

    // Step C1b: opportunistic build — the center offers a rank this
    // pile already holds 2+ of. Take it and switch this pile's build
    // to that rank: three (or the set itself) in hand beats a plan
    // anchored in another pile. (Ronya, 2026-10-23: a bot sat on two
    // 10s with a 10 on the table for 20+ seconds and ignored it
    // because its target pointed elsewhere.)
    if (haveOfTarget < 4) {
      let bestRank: Rank | null = null;
      let bestCount = 0;
      for (const [r, n] of handCounts) {
        if (n >= 2 && n > bestCount && r !== target && !dump.has(r)) {
          bestRank = r;
          bestCount = n;
        }
      }
      if (bestRank) {
        const idx = findCenterCard(state, now, new Set([bestRank]));
        if (idx !== -1) {
          memory.pileTarget.set(openKey, bestRank);
          memory.targetProgress.delete(openKey);
          if (pickThrowaway(bot, memory, idx)) {
            memory.dumpHold.delete(bot.id);
            apply((s) => holdCenterCard(s, bot.id, idx));
            continue;
          }
        }
      }
    }

    // Step C2: rule 3 dumping — swap abandoned ranks to the center,
    // whatever the center is offering in return. The dumpHold flag makes
    // the completion expel the abandoned rank's card specifically.
    const dumpCard = bot.hand.find((c) => dump.has(c.rank));
    if (dumpCard) {
      let dumped = false;
      for (let i = 0; i < state.center.length; i++) {
        if (!slotClaimable(state, i, now)) continue;
        if (swapBlocked(memory, bot.id, dumpCard.id, i)) continue;
        memory.dumpHold.add(bot.id);
        apply((s) => holdCenterCard(s, bot.id, i));
        dumped = true;
        break;
      }
      if (dumped) continue;
    }

    // Step C2b: fetch trigger. The center doesn't offer our target,
    // but copies of it sit in another of our piles: start a fetch
    // mission for them (close up; step B routes us to that pile, we
    // swap the copies to the center, then come back for them).
    if (
      target &&
      haveOfTarget >= 1 &&
      haveOfTarget < 4 &&
      !memory.fetchPlan.get(bot.id)
    ) {
      const inCenter = findCenterCard(state, now, new Set([target]));
      if (inCenter === -1) {
        const source = pileWithMostOf(bot, target, bot.openPileIndex);
        if (source.idx !== -1 && source.count > 0) {
          memory.fetchPlan.set(bot.id, { fromPile: source.idx, rank: target });
          apply((s) => closePile(s, bot.id));
          continue;
        }
      }
    }

    // Step C3: pair up — if the center offers a rank we hold exactly one
    // of, take it and build on the new pair (rule 2's spirit, mid-game).
    {
      const pairRanks = new Set<Rank>();
      for (const [r, n] of handCounts) {
        if (n === 1 && !dump.has(r)) pairRanks.add(r);
      }
      if (pairRanks.size > 0) {
        const idx = findCenterCard(state, now, pairRanks);
        if (idx !== -1) {
          const r = state.center[idx].card?.rank;
          if (r && ownedRankCount(bot, r) < 4 && pickThrowaway(bot, memory, idx)) {
            // Only worth it if the pair beats what we're building now.
            if (!target || haveOfTarget <= 1) {
              memory.pileTarget.set(openKey, r);
              memory.targetProgress.delete(openKey);
            }
            memory.dumpHold.delete(bot.id);
            apply((s) => holdCenterCard(s, bot.id, idx));
            continue;
          }
        }
      }
    }

    // Step C4: grab a wanted rank from an inactive player's free pile.
    if (bot.hand.length > 0) {
      const wanted = new Set<Rank>();
      if (target && ownedRankCount(bot, target) < 4) wanted.add(target);
      for (const [r, n] of handCounts) {
        if (n === 1 && !dump.has(r) && ownedRankCount(bot, r) < 4) wanted.add(r);
      }
      if (wanted.size > 0) {
        const grab = findFreeCard(state, bot.id, wanted);
        if (grab) {
          apply((s) => holdFreeCard(s, bot.id, grab.ownerId, grab.pileIndex, grab.cardId));
          continue;
        }
      }
    }

    // Step C5: relocation — a different pile holds more of our target
    // than this one does. Close up and build there instead (moving the
    // focus with it, or step B would just reopen this pile and the two
    // would ping-pong).
    if (target) {
      const richer = pileWithMostOf(bot, target, bot.openPileIndex);
      if (richer.idx !== -1 && richer.count > haveOfTarget) {
        memory.pileTarget.set(`${bot.id}:${richer.idx}`, target);
        memory.focusPile.set(bot.id, richer.idx);
        apply((s) => closePile(s, bot.id));
        continue;
      }
    }

    // Step C6: forced cycle — if we haven't swapped in 15s, cycle the
    // least useful card through any claimable center slot. The window
    // is long on purpose (Ronya, 2026-10-23): the bot gets time to
    // fully scan its hand and piles before anything forces a throw.
    // Sim sweep at 7s stall: 5s cycle won 20/60, 15s won 27/60 with
    // faster wins; the old 5s cycle threw cards before the scan
    // finished and buried cards the bot needed.
    const lastSwap = memory.lastSwapAt.get(bot.id) ?? state.startedAt ?? now;
    if (now - lastSwap >= FORCE_CYCLE_MS) {
      let cycled = false;
      for (let i = 0; i < state.center.length; i++) {
        if (!slotClaimable(state, i, now)) continue;
        const slotRank = state.center[i].card?.rank;
        if (slotRank && ownedRankCount(bot, slotRank) >= 4) continue;
        if (!pickThrowaway(bot, memory, i)) continue;
        memory.dumpHold.delete(bot.id);
        apply((s) => holdCenterCard(s, bot.id, i));
        cycled = true;
        break;
      }
      if (cycled) continue;
    }

    // Step C7: close only when this pile has proved unproductive: open
    // for at least 8s AND no completed swap in the last 5s. (The old
    // pure-timer close killed piles mid-acquisition.) Moving on also
    // clears the focus so step B picks a fresh pile by score.
    const closeAt = memory.closeAfter.get(bot.id) ?? 0;
    const openedAt = memory.openedAt.get(bot.id) ?? now;
    const lastSwap2 = memory.lastSwapAt.get(bot.id) ?? state.startedAt ?? now;
    if (now >= closeAt && now - openedAt >= 8000 && now - lastSwap2 >= 5000) {
      memory.focusPile.set(bot.id, null);
      apply((s) => closePile(s, bot.id));
    }
  }
}
