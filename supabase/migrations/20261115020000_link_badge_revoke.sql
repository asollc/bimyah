-- Link badges, part 2: unlinking takes the badge back (Ronya's ruling
-- 2026-11-15). Removes the inventory row and unequips the badge if worn.
create or replace function public.revoke_link_badge()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.user_inventory
  where user_id = OLD.bimyah_user_id and kind = 'badge' and item_id = TG_ARGV[0];

  update public.user_equipped
  set badge_id = case when badge_id = TG_ARGV[0] then null else badge_id end,
      badge_id_2 = case when badge_id_2 = TG_ARGV[0] then null else badge_id_2 end
  where user_id = OLD.bimyah_user_id
    and (badge_id = TG_ARGV[0] or badge_id_2 = TG_ARGV[0]);

  return OLD;
end;
$$;

revoke all on function public.revoke_link_badge() from public, anon, authenticated;

drop trigger if exists trg_discord_unlink_badge on public.discord_links;
create trigger trg_discord_unlink_badge
  after delete on public.discord_links
  for each row execute function public.revoke_link_badge('discord_badge');

drop trigger if exists trg_yapin_unlink_badge on public.yapin_links;
create trigger trg_yapin_unlink_badge
  after delete on public.yapin_links
  for each row execute function public.revoke_link_badge('yapin_badge');
