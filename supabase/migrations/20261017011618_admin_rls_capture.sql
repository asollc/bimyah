-- Admin RLS capture, 2026-10-16
-- Policies applied live via the Management API during the admin-console fix
-- (client-side tabs + service-role key configured in the Worker). Captured
-- from pg_policies so future environments get identical policies.
-- Idempotent: safe to rerun.

alter table public."bplus_config" enable row level security;
drop policy if exists "Admins can update bplus_config" on public."bplus_config";
create policy "Admins can update bplus_config" on public."bplus_config" as permissive for UPDATE to public
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can view all" on public."bplus_config";
create policy "Admins can view all" on public."bplus_config" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Anyone can read bplus_config" on public."bplus_config";
create policy "Anyone can read bplus_config" on public."bplus_config" as permissive for SELECT to public
  using (true);

alter table public."bplus_gifts" enable row level security;
drop policy if exists "Admins can delete all" on public."bplus_gifts";
create policy "Admins can delete all" on public."bplus_gifts" as permissive for DELETE to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can insert all" on public."bplus_gifts";
create policy "Admins can insert all" on public."bplus_gifts" as permissive for INSERT to public
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can update all" on public."bplus_gifts";
create policy "Admins can update all" on public."bplus_gifts" as permissive for UPDATE to public
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can view all" on public."bplus_gifts";
create policy "Admins can view all" on public."bplus_gifts" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins manage gifts" on public."bplus_gifts";
create policy "Admins manage gifts" on public."bplus_gifts" as permissive for ALL to public
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins view all gifts" on public."bplus_gifts";
create policy "Admins view all gifts" on public."bplus_gifts" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Purchasers view own gifts" on public."bplus_gifts";
create policy "Purchasers view own gifts" on public."bplus_gifts" as permissive for SELECT to authenticated
  using ((auth.uid() = purchaser_id));

drop policy if exists "Recipients view their gifts" on public."bplus_gifts";
create policy "Recipients view their gifts" on public."bplus_gifts" as permissive for SELECT to authenticated
  using ((auth.uid() = recipient_user_id));

alter table public."bulletin_hides" enable row level security;
drop policy if exists "Admins can delete all" on public."bulletin_hides";
create policy "Admins can delete all" on public."bulletin_hides" as permissive for DELETE to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can view all" on public."bulletin_hides";
create policy "Admins can view all" on public."bulletin_hides" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Users can insert own bulletin hides" on public."bulletin_hides";
create policy "Users can insert own bulletin hides" on public."bulletin_hides" as permissive for INSERT to public
  with check ((auth.uid() = user_id));

drop policy if exists "Users can read own bulletin hides" on public."bulletin_hides";
create policy "Users can read own bulletin hides" on public."bulletin_hides" as permissive for SELECT to public
  using ((auth.uid() = user_id));

drop policy if exists "Users manage own hides" on public."bulletin_hides";
create policy "Users manage own hides" on public."bulletin_hides" as permissive for ALL to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

alter table public."bulletin_reads" enable row level security;
drop policy if exists "Admins can delete all" on public."bulletin_reads";
create policy "Admins can delete all" on public."bulletin_reads" as permissive for DELETE to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can view all" on public."bulletin_reads";
create policy "Admins can view all" on public."bulletin_reads" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Users can insert own bulletin reads" on public."bulletin_reads";
create policy "Users can insert own bulletin reads" on public."bulletin_reads" as permissive for INSERT to public
  with check ((auth.uid() = user_id));

drop policy if exists "Users can read own bulletin reads" on public."bulletin_reads";
create policy "Users can read own bulletin reads" on public."bulletin_reads" as permissive for SELECT to public
  using ((auth.uid() = user_id));

drop policy if exists "Users manage own reads" on public."bulletin_reads";
create policy "Users manage own reads" on public."bulletin_reads" as permissive for ALL to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

alter table public."bulletins" enable row level security;
drop policy if exists "Admins can delete all" on public."bulletins";
create policy "Admins can delete all" on public."bulletins" as permissive for DELETE to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can insert all" on public."bulletins";
create policy "Admins can insert all" on public."bulletins" as permissive for INSERT to public
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can update all" on public."bulletins";
create policy "Admins can update all" on public."bulletins" as permissive for UPDATE to public
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can view all" on public."bulletins";
create policy "Admins can view all" on public."bulletins" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins manage bulletins" on public."bulletins";
create policy "Admins manage bulletins" on public."bulletins" as permissive for ALL to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Anyone authenticated can read bulletins" on public."bulletins";
create policy "Anyone authenticated can read bulletins" on public."bulletins" as permissive for SELECT to authenticated
  using (true);

drop policy if exists "Users can read bulletins" on public."bulletins";
create policy "Users can read bulletins" on public."bulletins" as permissive for SELECT to public
  using ((auth.uid() IS NOT NULL));

alter table public."card_backs" enable row level security;
drop policy if exists "Admins can view all" on public."card_backs";
create policy "Admins can view all" on public."card_backs" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Users delete own card backs" on public."card_backs";
create policy "Users delete own card backs" on public."card_backs" as permissive for DELETE to authenticated
  using ((auth.uid() = user_id));

drop policy if exists "Users insert own card backs" on public."card_backs";
create policy "Users insert own card backs" on public."card_backs" as permissive for INSERT to authenticated
  with check ((auth.uid() = user_id));

drop policy if exists "Users update own card backs" on public."card_backs";
create policy "Users update own card backs" on public."card_backs" as permissive for UPDATE to authenticated
  using ((auth.uid() = user_id));

drop policy if exists "Users view own card backs" on public."card_backs";
create policy "Users view own card backs" on public."card_backs" as permissive for SELECT to authenticated
  using ((auth.uid() = user_id));

alter table public."founding_members" enable row level security;
drop policy if exists "Admins can delete all" on public."founding_members";
create policy "Admins can delete all" on public."founding_members" as permissive for DELETE to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can insert all" on public."founding_members";
create policy "Admins can insert all" on public."founding_members" as permissive for INSERT to public
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can view all" on public."founding_members";
create policy "Admins can view all" on public."founding_members" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Founding members publicly viewable" on public."founding_members";
create policy "Founding members publicly viewable" on public."founding_members" as permissive for SELECT to public
  using (true);

alter table public."friendships" enable row level security;
drop policy if exists "Addressee accepts pending request" on public."friendships";
create policy "Addressee accepts pending request" on public."friendships" as permissive for UPDATE to authenticated
  using (((auth.uid() = addressee_id) AND (status = 'pending'::friendship_status)))
  with check (((auth.uid() = addressee_id) AND (status = 'accepted'::friendship_status)));

drop policy if exists "Admins can view all" on public."friendships";
create policy "Admins can view all" on public."friendships" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Users create friend requests" on public."friendships";
create policy "Users create friend requests" on public."friendships" as permissive for INSERT to authenticated
  with check ((auth.uid() = requester_id));

drop policy if exists "Users delete own friendships" on public."friendships";
create policy "Users delete own friendships" on public."friendships" as permissive for DELETE to authenticated
  using (((auth.uid() = requester_id) OR (auth.uid() = addressee_id)));

drop policy if exists "Users view own friendships" on public."friendships";
create policy "Users view own friendships" on public."friendships" as permissive for SELECT to authenticated
  using (((auth.uid() = requester_id) OR (auth.uid() = addressee_id)));

alter table public."games" enable row level security;
drop policy if exists "Admins can view all" on public."games";
create policy "Admins can view all" on public."games" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

alter table public."payments" enable row level security;
drop policy if exists "Admins can insert all" on public."payments";
create policy "Admins can insert all" on public."payments" as permissive for INSERT to public
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can view all" on public."payments";
create policy "Admins can view all" on public."payments" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins view all payments" on public."payments";
create policy "Admins view all payments" on public."payments" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Users view own payments" on public."payments";
create policy "Users view own payments" on public."payments" as permissive for SELECT to public
  using ((auth.uid() = user_id));

alter table public."profiles" enable row level security;
drop policy if exists "Admins can update all" on public."profiles";
create policy "Admins can update all" on public."profiles" as permissive for UPDATE to public
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can view all" on public."profiles";
create policy "Admins can view all" on public."profiles" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Profiles viewable by everyone" on public."profiles";
create policy "Profiles viewable by everyone" on public."profiles" as permissive for SELECT to public
  using (true);

drop policy if exists "Users can insert their own profile" on public."profiles";
create policy "Users can insert their own profile" on public."profiles" as permissive for INSERT to authenticated
  with check ((auth.uid() = id));

drop policy if exists "Users can update their own profile" on public."profiles";
create policy "Users can update their own profile" on public."profiles" as permissive for UPDATE to authenticated
  using ((auth.uid() = id))
  with check ((auth.uid() = id));

alter table public."public_matches" enable row level security;
drop policy if exists "Admins can view all" on public."public_matches";
create policy "Admins can view all" on public."public_matches" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Anyone authenticated can read public matches" on public."public_matches";
create policy "Anyone authenticated can read public matches" on public."public_matches" as permissive for SELECT to authenticated
  using (true);

drop policy if exists "Service role manages public matches" on public."public_matches";
create policy "Service role manages public matches" on public."public_matches" as permissive for ALL to public
  using ((auth.role() = 'service_role'::text))
  with check ((auth.role() = 'service_role'::text));

alter table public."push_subscriptions" enable row level security;
drop policy if exists "Admins can view all" on public."push_subscriptions";
create policy "Admins can view all" on public."push_subscriptions" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Users manage own push subs" on public."push_subscriptions";
create policy "Users manage own push subs" on public."push_subscriptions" as permissive for ALL to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

alter table public."referrals" enable row level security;
drop policy if exists "Admins can view all" on public."referrals";
create policy "Admins can view all" on public."referrals" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins manage referrals" on public."referrals";
create policy "Admins manage referrals" on public."referrals" as permissive for ALL to authenticated
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Users see their own referrals (sent or received)" on public."referrals";
create policy "Users see their own referrals (sent or received)" on public."referrals" as permissive for SELECT to authenticated
  using (((auth.uid() = referrer_id) OR (auth.uid() = referred_id)));

alter table public."share_events" enable row level security;
drop policy if exists "Admins can view all" on public."share_events";
create policy "Admins can view all" on public."share_events" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can view share events" on public."share_events";
create policy "Admins can view share events" on public."share_events" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Anyone can record share events" on public."share_events";
create policy "Anyone can record share events" on public."share_events" as permissive for INSERT to public
  with check (((user_id IS NULL) OR (auth.uid() = user_id)));

alter table public."subscriptions" enable row level security;
drop policy if exists "Admins can insert all" on public."subscriptions";
create policy "Admins can insert all" on public."subscriptions" as permissive for INSERT to public
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can update all" on public."subscriptions";
create policy "Admins can update all" on public."subscriptions" as permissive for UPDATE to public
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can view all" on public."subscriptions";
create policy "Admins can view all" on public."subscriptions" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins manage subscriptions" on public."subscriptions";
create policy "Admins manage subscriptions" on public."subscriptions" as permissive for ALL to public
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins view all subscriptions" on public."subscriptions";
create policy "Admins view all subscriptions" on public."subscriptions" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Users view own subscriptions" on public."subscriptions";
create policy "Users view own subscriptions" on public."subscriptions" as permissive for SELECT to public
  using ((auth.uid() = user_id));

alter table public."user_keybinds" enable row level security;
drop policy if exists "Admins can view all" on public."user_keybinds";
create policy "Admins can view all" on public."user_keybinds" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Users delete own keybinds" on public."user_keybinds";
create policy "Users delete own keybinds" on public."user_keybinds" as permissive for DELETE to authenticated
  using ((auth.uid() = user_id));

drop policy if exists "Users insert own keybinds" on public."user_keybinds";
create policy "Users insert own keybinds" on public."user_keybinds" as permissive for INSERT to authenticated
  with check ((auth.uid() = user_id));

drop policy if exists "Users update own keybinds" on public."user_keybinds";
create policy "Users update own keybinds" on public."user_keybinds" as permissive for UPDATE to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

drop policy if exists "Users view own keybinds" on public."user_keybinds";
create policy "Users view own keybinds" on public."user_keybinds" as permissive for SELECT to authenticated
  using ((auth.uid() = user_id));

alter table public."user_presence" enable row level security;
drop policy if exists "Admins can view all" on public."user_presence";
create policy "Admins can view all" on public."user_presence" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Presence viewable by authenticated" on public."user_presence";
create policy "Presence viewable by authenticated" on public."user_presence" as permissive for SELECT to authenticated
  using (true);

drop policy if exists "Users upsert own presence insert" on public."user_presence";
create policy "Users upsert own presence insert" on public."user_presence" as permissive for INSERT to authenticated
  with check ((auth.uid() = user_id));

drop policy if exists "Users upsert own presence update" on public."user_presence";
create policy "Users upsert own presence update" on public."user_presence" as permissive for UPDATE to authenticated
  using ((auth.uid() = user_id))
  with check ((auth.uid() = user_id));

alter table public."user_roles" enable row level security;
drop policy if exists "Admins can delete all" on public."user_roles";
create policy "Admins can delete all" on public."user_roles" as permissive for DELETE to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can insert all" on public."user_roles";
create policy "Admins can insert all" on public."user_roles" as permissive for INSERT to public
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can manage roles" on public."user_roles";
create policy "Admins can manage roles" on public."user_roles" as permissive for ALL to public
  using (has_role(auth.uid(), 'admin'::app_role))
  with check (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can view all" on public."user_roles";
create policy "Admins can view all" on public."user_roles" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Admins can view all roles" on public."user_roles";
create policy "Admins can view all roles" on public."user_roles" as permissive for SELECT to public
  using (has_role(auth.uid(), 'admin'::app_role));

drop policy if exists "Users can view their own roles" on public."user_roles";
create policy "Users can view their own roles" on public."user_roles" as permissive for SELECT to public
  using ((auth.uid() = user_id));
