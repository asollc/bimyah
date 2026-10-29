-- Push diagnostics trail: one row per subscription sync attempt, with the
-- push service's verdict and HTTP status. Server-written only (service
-- role), read by admins/operators through the Management API when a
-- device's signup misbehaves. Toasts vanish; this doesn't.
create table if not exists public.push_debug_log (
  id bigint generated always as identity primary key,
  user_id uuid,
  event text not null,
  detail text not null default '',
  created_at timestamptz not null default now()
);

alter table public.push_debug_log enable row level security;

grant all on public.push_debug_log to service_role;
grant usage, select on sequence public.push_debug_log_id_seq to service_role;
