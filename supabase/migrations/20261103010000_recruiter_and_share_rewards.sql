-- Recruiter challenge + screenshot share rewards (Ronya 2026-11-03).
--
-- recruit_activations: one row per referred player who became an
-- "active recruit" (registered, then completed a game of any seat
-- count with at least one other human player). Unique on referred_id
-- so a recruit can only ever activate once. On activation the sponsor
-- is credited 300 Bimbits and their Recruiter level (user_challenges
-- progress for challenge_id 'recruiter') goes up by one.
--
-- screenshot_share_claims: one row per user per day for the 50 Bimbit
-- public screenshot share reward (claimed from the win screen share
-- sheet). Unique on (user_id, claim_date) enforces the daily cap.
--
-- Access is server-functions only (supabaseAdmin / service role), so
-- RLS stays enabled with no public policies, and the service role gets
-- an explicit grant per the post-2026-10-30 grants rule.

create table if not exists public.recruit_activations (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null,
  referred_id uuid not null,
  game_code text,
  match_number integer,
  created_at timestamptz not null default now(),
  constraint recruit_activations_referred_unique unique (referred_id)
);

create index if not exists recruit_activations_referrer_idx
  on public.recruit_activations (referrer_id);

create table if not exists public.screenshot_share_claims (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  claim_date date not null,
  created_at timestamptz not null default now(),
  constraint screenshot_share_claims_user_day_unique unique (user_id, claim_date)
);

alter table public.recruit_activations enable row level security;
alter table public.screenshot_share_claims enable row level security;

grant all on public.recruit_activations to service_role;
grant all on public.screenshot_share_claims to service_role;
