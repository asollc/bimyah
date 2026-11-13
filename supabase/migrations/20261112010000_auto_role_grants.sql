-- Ledger for automatically granted platform roles (Yapin' + Discord).
-- The auto-roles sweep (~/workspace/bimyah-auto-roles/sweep.py) records
-- every grant it makes here so revocation only ever touches roles the
-- system itself granted, never manual grants.
create table public.auto_role_grants (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('yapin', 'discord')),
  server_id text not null,
  platform_user_id text not null,
  role_id text not null,
  rule text not null,
  granted_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (platform, server_id, platform_user_id, role_id, rule)
);

alter table public.auto_role_grants enable row level security;

-- Restricted table: revoke the default ACL grants first, then grant
-- back only to service_role (the sweep runs server-side).
revoke all on public.auto_role_grants from anon, authenticated;
grant all on public.auto_role_grants to service_role;
