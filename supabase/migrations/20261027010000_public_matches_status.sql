-- Public lobby listings: track whether the room is still in the lobby or
-- has started playing (Ronya, 2026-10-27). Started games STAY listed so a
-- player who got kicked or dropped can find the room and rejoin with their
-- seat; the listing is labelled 'playing' and rejoins are seat-locked.
-- Existing rows default to 'lobby'; live hosts flip their row to 'playing'
-- on match start (web host effect / Discord game update sync).
ALTER TABLE public.public_matches
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'lobby';
