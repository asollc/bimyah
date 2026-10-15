CREATE TABLE public.public_matches (
  game_id text PRIMARY KEY,
  host_id uuid NOT NULL,
  host_name text NOT NULL,
  mode text NOT NULL,
  max_seats integer NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.public_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read public matches"
  ON public.public_matches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Service role manages public matches"
  ON public.public_matches FOR ALL TO public
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE INDEX idx_public_matches_created_at ON public.public_matches (created_at DESC);