-- Discord account linking for the Bimyah Discord bot (2026-11-05).
-- Mirrors the Yapin' linking migration (20261103020000) exactly, with
-- Discord user ids (snowflakes) stored as text instead of uuid.
-- A player runs /link in Discord (the bot inserts a one-time code here
-- via the service role), then redeems it while signed into the game
-- (redeem_discord_link), which ties their Discord user id to their
-- Bimyah account in discord_links. The bot reads discord_links +
-- profiles/wallets with the service role to answer /profile.

create table if not exists public.discord_links (
  id uuid primary key default gen_random_uuid(),
  discord_user_id text not null unique,
  discord_username text,
  bimyah_user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.discord_link_codes (
  code text primary key,
  discord_user_id text not null,
  discord_username text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz
);

create index if not exists discord_link_codes_discord_user_idx
  on public.discord_link_codes (discord_user_id);

alter table public.discord_links enable row level security;
alter table public.discord_link_codes enable row level security;

-- Data API grants (explicit since the 2026-10-30 Supabase change):
-- players may read only their own link row (RLS below); codes are
-- service-role and RPC only, so no authenticated/anon grants there.
grant select on public.discord_links to authenticated;
grant select, insert, update, delete on public.discord_links to service_role;
grant select, insert, update, delete on public.discord_link_codes to service_role;

drop policy if exists "Users read their own Discord link" on public.discord_links;
create policy "Users read their own Discord link" on public.discord_links
  for select to authenticated
  using (bimyah_user_id = auth.uid());

create or replace function public.redeem_discord_link(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code public.discord_link_codes%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  select * into v_code
    from public.discord_link_codes
    where code = upper(trim(p_code))
    for update;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'invalid_code');
  end if;
  if v_code.redeemed_at is not null then
    return jsonb_build_object('ok', false, 'error', 'code_used');
  end if;
  if v_code.expires_at < now() then
    return jsonb_build_object('ok', false, 'error', 'code_expired');
  end if;
  if exists (select 1 from public.discord_links where bimyah_user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'already_linked');
  end if;
  if exists (select 1 from public.discord_links where discord_user_id = v_code.discord_user_id) then
    return jsonb_build_object('ok', false, 'error', 'discord_taken');
  end if;
  insert into public.discord_links (discord_user_id, discord_username, bimyah_user_id)
  values (v_code.discord_user_id, v_code.discord_username, v_uid);
  update public.discord_link_codes
    set redeemed_by = v_uid, redeemed_at = now()
    where code = v_code.code;
  return jsonb_build_object('ok', true, 'discord_username', v_code.discord_username);
end;
$$;

grant execute on function public.redeem_discord_link(text) to authenticated;

create or replace function public.unlink_discord()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  delete from public.discord_links where bimyah_user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.unlink_discord() to authenticated;

-- Same hardening as the Yapin' follow-up: function EXECUTE is granted
-- to PUBLIC by default; keep these two callable by signed-in players
-- only. (Both functions check auth.uid() themselves as well.)
revoke execute on function public.redeem_discord_link(text) from public, anon;
revoke execute on function public.unlink_discord() from public, anon;
