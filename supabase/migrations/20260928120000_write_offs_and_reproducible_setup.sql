-- Phase 6: 6.25 write-offs for debts with deleted users, 6.27 reproducible setup.
--
-- 6.25 A debt that involves a deleted user (the user reference is NULL) can
--      never be paid, so the group could never become fully settled. A group
--      admin can now close it with a write-off: a settlement row with
--      kind = 'write_off', the deleted side NULL and the real member on the
--      other side. The balance logic already treats every settlement row the
--      same way, so the write-off cancels the "Deleted user" line.
-- 6.27 Everything the apps rely on is created by migrations: every table the
--      apps subscribe to via Realtime, and the private "receipts" bucket with
--      the storage policy the mobile app needs. All steps are idempotent.

begin;

-- 1. 6.25: settlements.kind ------------------------------------------------

alter table public.settlements
  add column kind text not null default 'payment';

alter table public.settlements
  add constraint settlements_kind_check
  check (kind in ('payment', 'write_off'));

-- 2. 6.25: settlement RLS ----------------------------------------------------

-- Permissive policies are OR'ed, so the existing member-wide rules must be
-- limited to payments; otherwise any member could insert (or update a row
-- into) a write-off. Payments need two existing users: a payment with a NULL
-- side would be a write-off under another name.
drop policy if exists "settlements_insert" on public.settlements;

create policy "settlements_insert" on public.settlements
  for insert
  with check (
    is_group_member(group_id, auth.uid())
    and kind = 'payment'
    and from_user is not null
    and to_user is not null
  );

-- Only group admins may write off, and only a debt with exactly one deleted
-- side.
create policy "settlements_insert_write_off" on public.settlements
  for insert
  with check (
    kind = 'write_off'
    and is_group_admin(group_id, auth.uid())
    and ((from_user is null) <> (to_user is null))
  );

drop policy if exists "settlements_update" on public.settlements;

create policy "settlements_update" on public.settlements
  for update
  using (is_group_member(group_id, auth.uid()) and kind = 'payment')
  with check (
    is_group_member(group_id, auth.uid())
    and kind = 'payment'
    and from_user is not null
    and to_user is not null
  );

-- Deleting a write-off would bring the closed debt back; only admins may.
drop policy if exists "settlements_delete" on public.settlements;

create policy "settlements_delete" on public.settlements
  for delete
  using (
    is_group_member(group_id, auth.uid())
    and (kind = 'payment' or is_group_admin(group_id, auth.uid()))
  );

-- 3. 6.25: notification payload carries the kind ----------------------------

-- Same as in 20260923130000_add_notifications.sql plus 'kind', so the apps
-- can word a write-off differently from a payment.
create or replace function public.notify_settlement_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.from_user);
  v_group groups%rowtype;
begin
  select * into v_group from groups where id = new.group_id;

  perform notify_group_members(
    new.group_id,
    v_actor,
    'settlement_added',
    jsonb_build_object(
      'settlement_id', new.id,
      'kind', new.kind,
      'amount', new.amount,
      'currency', v_group.currency,
      'group_name', v_group.name,
      'actor_name', notification_display_name(v_actor),
      'from_name', notification_display_name(new.from_user),
      'to_name', notification_display_name(new.to_user)
    )
  );
  return new;
end;
$$;

revoke execute on function public.notify_settlement_added() from public, anon, authenticated;

-- 4. 6.27: Realtime for every table the apps subscribe to ------------------

-- Web and mobile group screens: expenses, settlements, expense_splits,
-- group_members (mobile), groups. Bells and lists: notifications.
-- groups and notifications were added by earlier migrations; re-checked here.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'expenses', 'settlements', 'expense_splits', 'group_members', 'groups', 'notifications'
  ]
  loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end
$$;

-- 5. 6.27: private "receipts" bucket ---------------------------------------

-- An existing bucket is left as it is (see the verification output).
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- The mobile app uploads receipt photos to receipts/<group id>/<timestamp>.<ext>
-- (upload without upsert, which only needs INSERT). Nothing reads receipts
-- back yet, so no SELECT policy is added. The CASE makes sure a folder name
-- that is not a uuid is rejected instead of failing the cast.
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'receipts_insert_group_member'
  ) then
    create policy "receipts_insert_group_member" on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'receipts'
        and case
          when (storage.foldername(name))[1]
               ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then public.is_group_member(((storage.foldername(name))[1])::uuid, auth.uid())
          else false
        end
      );
  end if;
end
$$;

commit;

-- 6. Verification ------------------------------------------------------------

select 'column'::text as kind, 'public.settlements.kind'::text as name,
       data_type || ' not null=' || (is_nullable = 'NO') || ' default ' || column_default as detail
from information_schema.columns
where table_schema = 'public' and table_name = 'settlements' and column_name = 'kind'
union all
select 'check', c.conname::text, pg_get_constraintdef(c.oid)
from pg_constraint c
where c.conrelid = 'public.settlements'::regclass and c.conname = 'settlements_kind_check'
union all
select 'policy', 'public.settlements.' || policyname,
       cmd || ' using ' || coalesce(qual, '-') || ' check ' || coalesce(with_check, '-')
from pg_policies
where schemaname = 'public' and tablename = 'settlements'
union all
select 'realtime', 'public.' || tablename, 'in supabase_realtime'
from pg_publication_tables
where pubname = 'supabase_realtime' and schemaname = 'public'
union all
select 'bucket', id::text, 'public=' || public
from storage.buckets
where id = 'receipts'
union all
select 'storage policy', policyname::text,
       cmd || ' check ' || coalesce(with_check, '-') || ' using ' || coalesce(qual, '-')
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (coalesce(qual, '') || coalesce(with_check, '') || policyname) ilike '%receipts%'
order by 1, 2;
