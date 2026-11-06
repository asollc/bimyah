
-- Storage buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/png','image/jpeg','image/webp','image/gif']),
  ('card-backs', 'card-backs', true, 5242880, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;

-- Storage policies: public read, owner-only write/update/delete (folder = user id)
create policy "Avatars are publicly viewable"
on storage.objects for select
using (bucket_id = 'avatars');

create policy "Users upload own avatar"
on storage.objects for insert to authenticated
with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users update own avatar"
on storage.objects for update to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete own avatar"
on storage.objects for delete to authenticated
using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Card backs are publicly viewable"
on storage.objects for select
using (bucket_id = 'card-backs');

create policy "Users upload own card back"
on storage.objects for insert to authenticated
with check (bucket_id = 'card-backs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users update own card back"
on storage.objects for update to authenticated
using (bucket_id = 'card-backs' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users delete own card back"
on storage.objects for delete to authenticated
using (bucket_id = 'card-backs' and (storage.foldername(name))[1] = auth.uid()::text);

-- card_backs library table
create table public.card_backs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  image_url text not null,
  is_active boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_card_backs_user on public.card_backs(user_id);
create unique index uniq_card_backs_active_per_user
  on public.card_backs(user_id) where is_active;

alter table public.card_backs enable row level security;

create policy "Users view own card backs"
on public.card_backs for select to authenticated
using (auth.uid() = user_id);

create policy "Users insert own card backs"
on public.card_backs for insert to authenticated
with check (auth.uid() = user_id);

create policy "Users update own card backs"
on public.card_backs for update to authenticated
using (auth.uid() = user_id);

create policy "Users delete own card backs"
on public.card_backs for delete to authenticated
using (auth.uid() = user_id);
