-- Public lobby listings: activity-based expiry (Ronya's rule, 2026-10-21).
-- A listing stays up while the room has any activity from any participant;
-- it closes when the room is empty or after 5 minutes with no activity.
-- Replaces the flat 4-hour-from-creation TTL that left dead hosts' games
-- listed (and unjoinable) for hours.
ALTER TABLE public.public_matches
  ADD COLUMN IF NOT EXISTS last_activity_at timestamptz NOT NULL DEFAULT now();

UPDATE public.public_matches SET last_activity_at = created_at WHERE last_activity_at > created_at;

CREATE INDEX IF NOT EXISTS public_matches_last_activity_idx
  ON public.public_matches (last_activity_at);
