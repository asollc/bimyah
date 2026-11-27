-- Link badges: connecting a Discord or Yapin' account grants that platform's
-- logo as a badge (Decor > Badges). Products are hidden (not for sale).
insert into public.bmart_products (id, name, price, currency, category, kind, hidden, is_custom, image_url)
values
  ('discord_badge', 'Discord Badge', 0, 'bimbits', 'badges', 'badge', true, true,
   'https://xetlumsehzltnbucexdk.supabase.co/storage/v1/object/public/public-assets/bmart/discord-link-badge.png'),
  ('yapin_badge', 'Yapin'' Badge', 0, 'bimbits', 'badges', 'badge', true, true,
   'https://xetlumsehzltnbucexdk.supabase.co/storage/v1/object/public/public-assets/bmart/yapin-link-badge.png')
on conflict (id) do nothing;

create or replace function public.grant_link_badge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.user_inventory (user_id, kind, item_id, source)
  select NEW.bimyah_user_id, 'badge', TG_ARGV[0], 'grant'
  where not exists (
    select 1 from public.user_inventory
    where user_id = NEW.bimyah_user_id and kind = 'badge' and item_id = TG_ARGV[0]
  );
  return NEW;
end;
$$;

revoke all on function public.grant_link_badge() from public, anon, authenticated;

drop trigger if exists trg_discord_link_badge on public.discord_links;
create trigger trg_discord_link_badge
  after insert on public.discord_links
  for each row execute function public.grant_link_badge('discord_badge');

drop trigger if exists trg_yapin_link_badge on public.yapin_links;
create trigger trg_yapin_link_badge
  after insert on public.yapin_links
  for each row execute function public.grant_link_badge('yapin_badge');

-- Backfill: everyone already linked gets their badges.
insert into public.user_inventory (user_id, kind, item_id, source)
select l.bimyah_user_id, 'badge', 'discord_badge', 'grant'
from public.discord_links l
where not exists (
  select 1 from public.user_inventory i
  where i.user_id = l.bimyah_user_id and i.kind = 'badge' and i.item_id = 'discord_badge'
);

insert into public.user_inventory (user_id, kind, item_id, source)
select l.bimyah_user_id, 'badge', 'yapin_badge', 'grant'
from public.yapin_links l
where not exists (
  select 1 from public.user_inventory i
  where i.user_id = l.bimyah_user_id and i.kind = 'badge' and i.item_id = 'yapin_badge'
);
