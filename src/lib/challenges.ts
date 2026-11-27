/* Challenge catalog (Ronya 2026-10-23). Challenges live in code so names,
   targets, and rewards can be retuned without a migration; per-user
   progress lives in the user_challenges table. Every reward is 1 Bimbit
   for now; Ronya will work out real point values later. */

export type ChallengeMetric =
  | "matches"
  | "matches_vs_bots"
  | "matches_vs_humans"
  | "matches_5plus"
  | "matches_full"
  | "matches_hosted"
  | "wins"
  | "wins_vs_bots"
  | "wins_vs_humans"
  | "wins_tournament"
  | "wins_tournament_bots";

export type ChallengeCategory = "human" | "bot";

export type ChallengeDef = {
  id: string;
  name: string;
  description: string;
  metric: ChallengeMetric;
  target: number;
  /** Bimbits awarded on completion. */
  reward: number;
  /** Which tab of the challenges screen the challenge lives on
   *  (Ronya 2026-11-01). */
  category: ChallengeCategory;
  /** Seat sub category (Ronya 2026-11-02): the exact table size this
   *  challenge belongs to, 2 to 8. The challenges screen groups by this
   *  under each tab, and a match only counts toward challenges whose
   *  seat count equals the match's player count. The 2 seat sub
   *  category holds the 1-on-1 challenges. */
  seats: number;
};

/** Every table size a match can have. */
const SEAT_COUNTS = [2, 3, 4, 5, 6, 7, 8];

/** "1-on-1" for 2 players, "5-Player" otherwise. */
function sizeName(n: number): string {
  return n === 2 ? "1-on-1" : `${n}-Player`;
}

/** Title prefix for the named challenge families (Ronya 2026-11-02):
 *  "Solo" for 2 players, "Full House" for 8, "5 Seat" style otherwise. */
function sizeTitle(n: number): string {
  return n === 2 ? "Solo" : n === 8 ? "Full House" : `${n} Seat`;
}

/** "a 1-on-1 match" for 2 players, "a match with exactly N players" otherwise. */
function sizeDesc(n: number): string {
  return n === 2 ? "a 1-on-1 match" : `a match with exactly ${n} players`;
}

/** Bot challenges count seats, not players (Ronya 2026-11-02): the Bot
 *  tab's names and descriptions say "seat(s)" wherever the Player tab
 *  says "player(s)". */
function sizeNameBot(n: number): string {
  return n === 2 ? "1-on-1" : `${n}-Seat`;
}
function sizeDescBot(n: number): string {
  return n === 2 ? "a 1-on-1 match" : `a match with exactly ${n} seats`;
}

/* The catalog is generated per seat count (Ronya 2026-11-02): under each
   tab, every size from 2 to 8 has its own Play and Win challenges, and
   the Human tab adds First Match, hosting, tournament, and cumulative
   match-count challenges per size. The Bot tab has tournament
   challenges too. The original 2026-10-23 challenges keep their ids
   (at the 2 seat size, or their own size for Party of Five and Full
   House) so existing progress carries over; from now on they count
   only matches of exactly their size.
   Naming (Ronya 2026-11-02): the Regular/Veteran/Legend and Tournament
   Champion families carry their size in the name ("Solo Regular" for
   2, "5 Seat Veteran", "Full House Legend" for 8), and First of Many
   and Gracious Host carry it in parentheses with the word seats
   ("First of Many (5 seats)"), because rewards will eventually scale
   with the seat count. The one First Match challenge is unique: it
   completes on a player's first ever match and exists only in that
   match's sub category. */
function buildCatalog(): ChallengeDef[] {
  const defs: ChallengeDef[] = [
    // The unique First Match (Ronya 2026-11-02): completes on the first
    // match a player ever plays, and exists only in the sub category of
    // the table size that match had. The server completes it outside
    // the metric loop (see reportMatchForChallenges) and records the
    // size on the progress row; the seats value here is only the
    // fallback for rows completed before sizes were recorded.
    {
      id: "first-match",
      name: "First Match",
      description: "Play your first ever match.",
      metric: "matches", target: 1, reward: 1, category: "human", seats: 2,
    },
  ];
  for (const n of SEAT_COUNTS) {
    if (n === 2) {
      defs.push({
        id: "winner",
        name: "Solo Winner",
        description: "Win a 1-on-1 match.",
        metric: "wins", target: 1, reward: 1, category: "human", seats: 2,
      });
    }
    defs.push(
      {
        id: `first-of-many-${n}`,
        name: `First of Many (${n} seats)`,
        description: n === 2 ? "Complete a 1-on-1 match." : `Complete a match with exactly ${n} players.`,
        metric: "matches", target: 1, reward: 1, category: "human", seats: n,
      },
      {
        id: n === 2 ? "real-competition" : `play-humans-${n}`,
        name: `Play ${n === 8 ? "an" : "a"} ${sizeName(n)} Game`,
        description: `Complete ${sizeDesc(n)} against other players.`,
        metric: "matches_vs_humans", target: 1, reward: 1, category: "human", seats: n,
      },
      {
        id: n === 2 ? "top-player" : `win-humans-${n}`,
        name: `Win ${n === 8 ? "an" : "a"} ${sizeName(n)} Game`,
        description: `Win ${sizeDesc(n)} against other players.`,
        metric: "wins_vs_humans", target: 1, reward: 1, category: "human", seats: n,
      },
      {
        id: n === 2 ? "bot-battle" : `play-bots-${n}`,
        name: `Play ${n === 8 ? "an" : "a"} ${sizeNameBot(n)} Game`,
        description: `Complete ${sizeDescBot(n)} against bots.`,
        metric: "matches_vs_bots", target: 1, reward: 1, category: "bot", seats: n,
      },
      {
        id: n === 2 ? "bot-champion" : `win-bots-${n}`,
        name: `Win ${n === 8 ? "an" : "a"} ${sizeNameBot(n)} Game`,
        description: `Win ${sizeDescBot(n)} against bots.`,
        metric: "wins_vs_bots", target: 1, reward: 1, category: "bot", seats: n,
      },
      {
        id: `tournament-bots-${n}`,
        name: `${sizeTitle(n)} Tournament Champion`,
        description: `Win ${sizeDescBot(n)} in a tournament, against bots.`,
        metric: "wins_tournament_bots", target: 1, reward: 1, category: "bot", seats: n,
      },
      {
        id: n === 2 ? "host-with-the-most" : `host-${n}`,
        name: `Gracious Host (${n} seats)`,
        description: `Host ${sizeDesc(n)} that finishes.`,
        metric: "matches_hosted", target: 1, reward: 1, category: "human", seats: n,
      },
      {
        id: n === 2 ? "tournament-champion" : `tournament-${n}`,
        name: `${sizeTitle(n)} Tournament Champion`,
        description: `Win ${sizeDesc(n)} in a tournament.`,
        metric: "wins_tournament", target: 1, reward: 1, category: "human", seats: n,
      },
      {
        id: n === 2 ? "regular" : `regular-${n}`,
        name: `${sizeTitle(n)} Regular`,
        description: n === 2 ? "Complete 10 1-on-1 matches." : `Complete 10 matches with exactly ${n} players.`,
        metric: "matches", target: 10, reward: 1, category: "human", seats: n,
      },
      {
        id: n === 2 ? "veteran" : `veteran-${n}`,
        name: `${sizeTitle(n)} Veteran`,
        description: n === 2 ? "Complete 25 1-on-1 matches." : `Complete 25 matches with exactly ${n} players.`,
        metric: "matches", target: 25, reward: 1, category: "human", seats: n,
      },
      {
        id: n === 2 ? "legend" : `legend-${n}`,
        name: `${sizeTitle(n)} Legend`,
        description: n === 2 ? "Complete 50 1-on-1 matches." : `Complete 50 matches with exactly ${n} players.`,
        metric: "matches", target: 50, reward: 1, category: "human", seats: n,
      },
    );
  }
  defs.push(
    { id: "party-of-five", name: "Party of Five", description: "Complete a match with exactly 5 players.", metric: "matches_5plus", target: 1, reward: 1, category: "human", seats: 5 },
    { id: "full-house", name: "Full House", description: "Complete a match in a full 8-player room.", metric: "matches_full", target: 1, reward: 1, category: "human", seats: 8 },
  );
  return defs;
}

export const CHALLENGES: ChallengeDef[] = buildCatalog();

export const CHALLENGE_MAP = new Map(CHALLENGES.map((c) => [c.id, c]));

/** Per-match metric increments, computed from one finished-match report. */
export type MatchReport = {
  total_players: number;
  human_opponents: number;
  /** Of the human opponents, how many were guests (no account). Guests
   *  are identified by the leading "_" marker on their display name.
   *  Optional so reports from older clients still parse; treated as 0.
   *  If this is above zero the match counts toward NO challenges at all
   *  (see metricIncrements). */
  guest_opponents?: number;
  bot_opponents: number;
  full_room: boolean;
  won: boolean;
  hosted: boolean;
  mode: "standard" | "tournament" | "training";
};

export function metricIncrements(r: MatchReport): Record<ChallengeMetric, number> {
  // Ronya (2026-11-02): if there are any guest accounts in the match at
  // all, the match counts toward NO challenges — not just the human
  // ones. This replaces the 2026-11-01 rule, which only discounted
  // guests out of the human metrics and let the rest still count.
  if ((r.guest_opponents ?? 0) > 0) {
    return {
      matches: 0,
      matches_vs_bots: 0,
      matches_vs_humans: 0,
      matches_5plus: 0,
      matches_full: 0,
      matches_hosted: 0,
      wins: 0,
      wins_vs_bots: 0,
      wins_vs_humans: 0,
      wins_tournament: 0,
      wins_tournament_bots: 0,
    };
  }
  const won = r.won ? 1 : 0;
  // Pure human side (Ronya 2026-11-02): a match with ANY bots in it
  // counts toward NO human challenges; that is the whole point of the
  // Human tab ("REGISTERED human matches"). Human metrics below only
  // fire for bot-free matches. Bot challenges are the mirror image:
  // any match that includes bots counts toward them ("Matches with
  // ANY bots"), even a mixed one.
  const botFree = r.bot_opponents === 0;
  return {
    matches: botFree ? 1 : 0,
    matches_vs_bots: r.bot_opponents > 0 ? 1 : 0,
    matches_vs_humans: botFree && r.human_opponents > 0 ? 1 : 0,
    // Party of Five counts exactly 5 players (Ronya 2026-11-02): with
    // challenges grouped by exact seat count, a 6, 7, or 8 player match
    // no longer counts toward it. The metric name is historical.
    matches_5plus: botFree && r.total_players === 5 ? 1 : 0,
    // Full House means a full 8-player match (Ronya 2026-10-25). This
    // used to trust the client's full_room flag, which the client set
    // from the room's configured maxSeats (default 4), so 4-player
    // matches wrongly counted. Derive it from the player count here so
    // every client, cached or not, is judged by the same rule.
    matches_full: botFree && r.total_players >= 8 ? 1 : 0,
    matches_hosted: botFree && r.hosted ? 1 : 0,
    wins: botFree ? won : 0,
    wins_vs_bots: won && r.bot_opponents > 0 ? 1 : 0,
    wins_vs_humans: botFree && won && r.human_opponents > 0 ? 1 : 0,
    wins_tournament: botFree && won && r.mode === "tournament" ? 1 : 0,
    wins_tournament_bots: won && r.mode === "tournament" && r.bot_opponents > 0 ? 1 : 0,
  };
}
