-- Public profile section visibility (Ronya 2026-11-09): from the
-- "View Public Profile" preview on their own profile page, a player
-- can hide whole sections of their public profile from other players.
-- Stored as a text array of section keys on profiles: equipped,
-- titles, badges, stickers, victory, backgrounds, tabletops,
-- tableart, cardbacks, challenges. Empty array = everything visible
-- (the default). Existing table, so no new-table grants are needed;
-- writes go through the service role in a server function.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS public_hidden_sections text[] NOT NULL DEFAULT '{}';
