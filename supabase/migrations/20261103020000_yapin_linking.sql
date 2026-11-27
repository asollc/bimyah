-- Yapin' account linking for the Bimyah Yapin' bot (2026-11-03).
-- A player runs /link in Yapin' (the bot inserts a one-time code here via
-- the service role), then redeems it while signed into the game
-- (redeem_yapin_link), which ties their Yapin' user id to their Bimyah
-- account in yapin_links. The bot reads yapin_links + profiles/wallets
-- with the service role to answer /profile.

create table if not exists public.yapin_links (
  id uuid primary key default gen_random_uuid(),
  yapin_user_id uuid not null unique,
  yapin_username text,
  bimyah_user_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.yapin_link_codes (
  code text primary key,
  yapin_user_id uuid not null,
  yapin_username text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_by uuid references auth.users(id) on delete set null,
  redeemed_at timestamptz
);

create index if not exists yapin_link_codes_yapin_user_idx
  on public.yapin_link_codes (yapin_user_id);

alter table public.yapin_links enable row level security;
alter table public.yapin_link_codes enable row level security;

-- Data API grants (explicit since the 2026-10-30 Supabase change):
-- players may read only their own link row (RLS below); codes are
-- service-role and RPC only, so no authenticated/anon grants there.
grant select on public.yapin_links to authenticated;
grant select, insert, update, delete on public.yapin_links to service_role;
grant select, insert, update, delete on public.yapin_link_codes to service_role;

drop policy if exists "Users read their own Yapin link" on public.yapin_links;
create policy "Users read their own Yapin link" on public.yapin_links
  for select to authenticated
  using (bimyah_user_id = auth.uid());

create or replace function public.redeem_yapin_link(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code public.yapin_link_codes%rowtype;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  select * into v_code
    from public.yapin_link_codes
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
  if exists (select 1 from public.yapin_links where bimyah_user_id = v_uid) then
    return jsonb_build_object('ok', false, 'error', 'already_linked');
  end if;
  if exists (select 1 from public.yapin_links where yapin_user_id = v_code.yapin_user_id) then
    return jsonb_build_object('ok', false, 'error', 'yapin_taken');
  end if;
  insert into public.yapin_links (yapin_user_id, yapin_username, bimyah_user_id)
  values (v_code.yapin_user_id, v_code.yapin_username, v_uid);
  update public.yapin_link_codes
    set redeemed_by = v_uid, redeemed_at = now()
    where code = v_code.code;
  return jsonb_build_object('ok', true, 'yapin_username', v_code.yapin_username);
end;
$$;

grant execute on function public.redeem_yapin_link(text) to authenticated;

create or replace function public.unlink_yapin()
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
  delete from public.yapin_links where bimyah_user_id = v_uid;
  return jsonb_build_object('ok', true);
end;
$$;

grant execute on function public.unlink_yapin() to authenticated;

-- Follow-up from the security advisors (same day): function EXECUTE is
-- granted to PUBLIC by default; keep these two callable by signed-in
-- players only. (Both functions check auth.uid() themselves as well.)
revoke execute on function public.redeem_yapin_link(text) from public, anon;
revoke execute on function public.unlink_yapin() from public, anon;
