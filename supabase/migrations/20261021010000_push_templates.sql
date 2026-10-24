-- push_templates: editable push notification copy for automatic alerts.
-- Mirrors Creator Shout (Admin > Push > Alerts tab). Overrides the built-in
-- copy in src/lib/rpc/push.functions.ts; {variables} in title/body are
-- substituted at send time, and a row with empty title AND body falls back
-- to the built-in copy. Reseeds never overwrite admin edits (do nothing).
create table if not exists public.push_templates (
  key text primary key,
  name text not null,
  title text not null default '',
  body text not null default '',
  image_url text,
  variables text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.push_templates enable row level security;
-- No policies on purpose: only the service role touches this table (the
-- admin UI reads/writes through admin-gated server functions).
grant all on public.push_templates to service_role;

insert into public.push_templates (key, name, title, body, variables) values
('bulletin.posted', 'New bulletin posted',
 'A New Bulletin was Posted',
 '{subject}... see more',
 '{subject}'),
('push.test', 'Test notification',
 'Testing, testing',
 'Looks like your notifications are enabled! I''ll let you know stuff when it happens.',
 '')
on conflict (key) do nothing;

-- Storage bucket for push big images (Creator Shout parity): public read,
-- admins manage. 2 MB cap and image types only, matching the client rules.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('push-images', 'push-images', true, 2097152, array['image/*'])
on conflict (id) do nothing;

create policy "Push images public read"
  on storage.objects for select using (bucket_id = 'push-images');

create policy "Admins upload push images"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'push-images' and public.has_role(auth.uid(), 'admin'));

create policy "Admins update push images"
  on storage.objects for update to authenticated
  using (bucket_id = 'push-images' and public.has_role(auth.uid(), 'admin'));

create policy "Admins delete push images"
  on storage.objects for delete to authenticated
  using (bucket_id = 'push-images' and public.has_role(auth.uid(), 'admin'));
