ALTER TABLE public.public_matches
ADD COLUMN IF NOT EXISTS seats_taken integer NOT NULL DEFAULT 1;