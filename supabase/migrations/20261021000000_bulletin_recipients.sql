-- Bulletin recipient targeting (Creator Shout parity): empty list = everyone.
-- Applied to the live project 2026-10-21 via the Management API; kept here
-- for the record alongside the other migrations.
alter table public.bulletins
  add column if not exists recipient_user_ids uuid[] not null default '{}';

drop policy if exists "Anyone authenticated can read bulletins" on public.bulletins;
drop policy if exists "Users can read bulletins" on public.bulletins;

create policy "Users read visible bulletins" on public.bulletins for select to authenticated
  using (
    cardinality(recipient_user_ids) = 0
    or auth.uid() = any(recipient_user_ids)
    or public.has_role(auth.uid(), 'admin')
  );
