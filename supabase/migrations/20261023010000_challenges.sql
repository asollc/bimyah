-- Challenge system (Ronya 2026-10-23): players earn Bimbits for completing
-- challenges (catalog lives in code, src/lib/challenges.ts). Progress is
-- tracked per user here; challenge_match_reports dedupes match-end reports
-- so a match can only be counted once per player.
-- Writes happen only through the service role (server functions); users and
-- admins can read. Explicit GRANTs included per the Supabase Oct 30, 2026
-- Data API change (new public tables no longer get automatic grants).

CREATE TABLE public.user_challenges (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_id text NOT NULL,
  progress integer NOT NULL DEFAULT 0,
  completed_at timestamptz,
  awarded boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, challenge_id)
);

CREATE TABLE public.challenge_match_reports (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_code text NOT NULL,
  match_number integer NOT NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_code, match_number)
);

ALTER TABLE public.user_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenge_match_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own challenge progress"
  ON public.user_challenges FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all challenge progress"
  ON public.user_challenges FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own match reports"
  ON public.challenge_match_reports FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Admins can view all match reports"
  ON public.challenge_match_reports FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

GRANT SELECT ON public.user_challenges TO authenticated;
GRANT SELECT ON public.challenge_match_reports TO authenticated;
GRANT ALL ON public.user_challenges TO service_role;
GRANT ALL ON public.challenge_match_reports TO service_role;
