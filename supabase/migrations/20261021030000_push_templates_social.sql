-- push_templates: seed the two social automatic alerts wired in code on
-- 2026-10-21 (v1.6.1): friend.request fires from sendFriendRequest
-- (src/lib/rpc/friends.functions.ts) and game.invite fires from
-- inviteFriendsToGame (src/lib/rpc/invites.functions.ts), both through
-- notifyUsers in src/lib/server/pushNotify.ts. Copy is editable in
-- Admin > Push > Alerts; a row with empty title AND body falls back to
-- the built-in wording in pushNotify.ts. Reseeds never overwrite admin
-- edits (do nothing). No new table, so no GRANT changes are needed.
insert into public.push_templates (key, name, title, body, variables) values
('friend.request', 'Friend request received',
 'New friend request',
 '{sender} wants to be your friend. Tap to view and respond.',
 '{sender}'),
('game.invite', 'Game invite received',
 'You''re invited to a game!',
 '{inviter} invited you to play Bimyah! Tap to join game {code}.',
 '{inviter}, {code}')
on conflict (key) do nothing;
