
-- Bimyah multiplayer state
create table public.games (
  id text primary key,
  host_id text not null,
  status text not null default 'lobby',
  state jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.games enable row level security;

-- Open access for v1 (anonymous play). Anyone can read/write their game by id.
create policy "Anyone can read games" on public.games for select using (true);
create policy "Anyone can insert games" on public.games for insert with check (true);
create policy "Anyone can update games" on public.games for update using (true);

-- Realtime
alter publication supabase_realtime add table public.games;
alter table public.games replica identity full;
