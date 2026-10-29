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
  | "wins_tournament";

export type ChallengeDef = {
  id: string;
  name: string;
  description: string;
  metric: ChallengeMetric;
  target: number;
  /** Bimbits awarded on completion. */
  reward: number;
};

export const CHALLENGES: ChallengeDef[] = [
  { id: "first-match", name: "First Match", description: "Complete a match.", metric: "matches", target: 1, reward: 1 },
  { id: "bot-battle", name: "Bot Battle", description: "Complete a match against bots.", metric: "matches_vs_bots", target: 1, reward: 1 },
  { id: "real-competition", name: "Real Competition", description: "Complete a match against other players.", metric: "matches_vs_humans", target: 1, reward: 1 },
  { id: "party-of-five", name: "Party of Five", description: "Complete a match with 5 or more players.", metric: "matches_5plus", target: 1, reward: 1 },
  { id: "full-house", name: "Full House", description: "Complete a match in a full 8-player room.", metric: "matches_full", target: 1, reward: 1 },
  { id: "host-with-the-most", name: "Host with the Most", description: "Host a match that finishes.", metric: "matches_hosted", target: 1, reward: 1 },
  { id: "winner", name: "Winner", description: "Win a match.", metric: "wins", target: 1, reward: 1 },
  { id: "bot-champion", name: "Bot Champion", description: "Win a match against bots.", metric: "wins_vs_bots", target: 1, reward: 1 },
  { id: "top-player", name: "Top Player", description: "Win a match against other players.", metric: "wins_vs_humans", target: 1, reward: 1 },
  { id: "tournament-champion", name: "Tournament Champion", description: "Win a tournament.", metric: "wins_tournament", target: 1, reward: 1 },
  { id: "regular", name: "Regular", description: "Complete 10 matches.", metric: "matches", target: 10, reward: 1 },
  { id: "veteran", name: "Veteran", description: "Complete 25 matches.", metric: "matches", target: 25, reward: 1 },
  { id: "legend", name: "Legend", description: "Complete 50 matches.", metric: "matches", target: 50, reward: 1 },
];

export const CHALLENGE_MAP = new Map(CHALLENGES.map((c) => [c.id, c]));

/** Per-match metric increments, computed from one finished-match report. */
export type MatchReport = {
  total_players: number;
  human_opponents: number;
  bot_opponents: number;
  full_room: boolean;
  won: boolean;
  hosted: boolean;
  mode: "standard" | "tournament" | "training";
};

export function metricIncrements(r: MatchReport): Record<ChallengeMetric, number> {
  const won = r.won ? 1 : 0;
  return {
    matches: 1,
    matches_vs_bots: r.bot_opponents > 0 ? 1 : 0,
    matches_vs_humans: r.human_opponents > 0 ? 1 : 0,
    matches_5plus: r.total_players >= 5 ? 1 : 0,
    // Full House means a full 8-player match (Ronya 2026-10-25). This
    // used to trust the client's full_room flag, which the client set
    // from the room's configured maxSeats (default 4), so 4-player
    // matches wrongly counted. Derive it from the player count here so
    // every client, cached or not, is judged by the same rule.
    matches_full: r.total_players >= 8 ? 1 : 0,
    matches_hosted: r.hosted ? 1 : 0,
    wins: won,
    wins_vs_bots: won && r.bot_opponents > 0 ? 1 : 0,
    wins_vs_humans: won && r.human_opponents > 0 ? 1 : 0,
    wins_tournament: won && r.mode === "tournament" ? 1 : 0,
  };
}
