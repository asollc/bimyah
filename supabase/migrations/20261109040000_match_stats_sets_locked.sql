-- Sets locked stat (Ronya 2026-11-09): how many piles the player
-- had SET (locked) when the match ended, recorded per match_stats
-- row. No historical data exists, so it counts from 2026-11-09.
ALTER TABLE public.match_stats
  ADD COLUMN IF NOT EXISTS sets_locked integer NOT NULL DEFAULT 0;
