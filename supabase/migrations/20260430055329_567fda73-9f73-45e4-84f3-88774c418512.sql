insert into storage.buckets (id, name, public) values ('public-assets', 'public-assets', true) on conflict (id) do nothing;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='storage' and tablename='objects' and policyname='public read public-assets') then
    create policy "public read public-assets" on storage.objects for select using (bucket_id = 'public-assets');
  end if;
end $$;