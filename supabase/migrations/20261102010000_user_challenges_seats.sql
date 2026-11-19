-- 2026-11-02: seat bucket for the unique First Match challenge.
-- user_challenges.seats records the table size at which a player's
-- First Match was completed, so the challenge can live only in that
-- seat sub category. Nullable: legacy rows have no recorded size and
-- the app falls back to the 2 seat sub category for them.
alter table public.user_challenges add column if not exists seats integer;
