-- Match stats (Ronya 2026-11-09): one row per player per finished
-- match, written by reportMatchForChallenges behind the same dedupe
-- gate as challenge_match_reports. Powers the Stats page: games
-- played / hosted / won / won as a guest, fastest win, tournament
-- wins, and average game length, per seat count and Player/Bot
-- bucket. Challenges completed, active referrals, and currency
-- spent are read from their existing tables instead.
CREATE TABLE public.match_stats (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  game_code text NOT NULL,
  match_number integer NOT NULL,
  total_players integer NOT NULL,
  human_opponents integer NOT NULL DEFAULT 0,
  guest_opponents integer NOT NULL DEFAULT 0,
  bot_opponents integer NOT NULL DEFAULT 0,
  hosted boolean NOT NULL DEFAULT false,
  won boolean NOT NULL DEFAULT false,
  mode text NOT NULL DEFAULT 'standard',
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_code, match_number)
);

GRANT SELECT ON public.match_stats TO authenticated;
GRANT ALL ON public.match_stats TO service_role;

ALTER TABLE public.match_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own match stats" ON public.match_stats
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins view all match stats" ON public.match_stats
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_match_stats_user ON public.match_stats(user_id, created_at DESC);
