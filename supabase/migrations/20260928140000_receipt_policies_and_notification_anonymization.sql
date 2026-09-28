-- Phase 6: 6.29 receipt storage policies, 6.30 anonymize deleted users in
-- notifications.
--
-- 6.29 The live database had four hand-made policies for the "receipts"
--      bucket (receipts_select, receipts_insert, receipts_update,
--      receipts_delete) that no migration created, plus
--      receipts_insert_group_member from 20260928120000 (a duplicate of
--      receipts_insert). All five are dropped and one clean set of four is
--      created here, so the policies are reproducible from migrations.
--      Objects live at receipts/<group id>/<timestamp>.<ext>:
--        select, insert   any member of that group
--        update, delete   a member who uploaded the object, or a group admin
-- 6.30 Deleting a user (auth.users -> profiles cascade) now replaces that
--      user's name in other people's notifications with 'Deleted user'.
--      Payloads only stored names, so the notify_* functions now also store
--      the ids (actor_id, paid_by_id, from_id, to_id, member_id), and
--      existing payloads are backfilled from the source rows.

begin;

-- 1. 6.29: group id from a receipt object name --------------------------------

-- The same guard as in 20260928120000: a first folder that is not a uuid
-- gives NULL (is_group_member(NULL, ...) is false) instead of failing the
-- cast. Not security definer; it only parses the name.
create or replace function public.receipt_group_id(p_name text)
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when (storage.foldername(p_name))[1]
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then ((storage.foldername(p_name))[1])::uuid
    else null
  end;
$$;

revoke execute on function public.receipt_group_id(text) from public, anon;
grant execute on function public.receipt_group_id(text) to authenticated;

-- 2. 6.29: receipts storage policies -------------------------------------------

drop policy if exists "receipts_select" on storage.objects;
drop policy if exists "receipts_insert" on storage.objects;
drop policy if exists "receipts_update" on storage.objects;
drop policy if exists "receipts_delete" on storage.objects;
drop policy if exists "receipts_insert_group_member" on storage.objects;

-- Viewing (signed URLs) and uploading: any member of the group.
create policy "receipts_select" on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and public.is_group_member(public.receipt_group_id(name), auth.uid())
  );

create policy "receipts_insert" on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'receipts'
    and public.is_group_member(public.receipt_group_id(name), auth.uid())
  );

-- Changing or removing a receipt: the uploader or a group admin, and only
-- while still a member. owner_id is the uploader's id as text (storage's
-- successor to the deprecated uuid column "owner").
create policy "receipts_update" on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'receipts'
    and public.is_group_member(public.receipt_group_id(name), auth.uid())
    and (
      owner_id = auth.uid()::text
      or public.is_group_admin(public.receipt_group_id(name), auth.uid())
    )
  )
  with check (
    bucket_id = 'receipts'
    and public.is_group_member(public.receipt_group_id(name), auth.uid())
  );

create policy "receipts_delete" on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'receipts'
    and public.is_group_member(public.receipt_group_id(name), auth.uid())
    and (
      owner_id = auth.uid()::text
      or public.is_group_admin(public.receipt_group_id(name), auth.uid())
    )
  );

-- 3. 6.30: store user ids in notification payloads ---------------------------

-- Every notification carries its actor's id, so a deleted actor is still
-- found when notifications.actor_id has already been set to NULL.
create or replace function public.notify_group_members(
  p_group_id uuid,
  p_actor_id uuid,
  p_type text,
  p_payload jsonb
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into notifications (user_id, group_id, actor_id, type, payload)
  select gm.user_id, p_group_id, p_actor_id, p_type,
         p_payload || jsonb_build_object('actor_id', p_actor_id)
  from group_members gm
  where gm.group_id = p_group_id
    and gm.user_id is distinct from p_actor_id;
$$;

-- As in 20260923130000 plus paid_by_id.
create or replace function public.notify_expense_added()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.paid_by);
  v_group groups%rowtype;
begin
  select * into v_group from groups where id = new.group_id;

  perform notify_group_members(
    new.group_id,
    v_actor,
    'expense_added',
    jsonb_build_object(
      'expense_id', new.id,
      'description', new.description,
      'amount', new.amount,
      'currency', v_group.currency,
      'group_name', v_group.name,
      'actor_name', notification_display_name(v_actor),
      'paid_by_id', new.paid_by,
      'paid_by_name', notification_display_name(new.paid_by)
    )
  );
  return new;
end;
$$;

-- As in 20260928120000 plus from_id and to_id.
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
      'from_id', new.from_user,
      'from_name', notification_display_name(new.from_user),
      'to_id', new.to_user,
      'to_name', notification_display_name(new.to_user)
    )
  );
  return new;
end;
$$;

-- As in 20260923130000 plus member_id.
create or replace function public.notify_member_joined()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.user_id);
  v_group_name text;
begin
  select name into v_group_name from groups where id = new.group_id;

  perform notify_group_members(
    new.group_id,
    v_actor,
    'member_joined',
    jsonb_build_object(
      'group_name', v_group_name,
      'actor_name', notification_display_name(v_actor),
      'member_id', new.user_id,
      'member_name', notification_display_name(new.user_id)
    )
  );
  return new;
end;
$$;

revoke execute on function public.notify_group_members(uuid, uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.notify_expense_added() from public, anon, authenticated;
revoke execute on function public.notify_settlement_added() from public, anon, authenticated;
revoke execute on function public.notify_member_joined() from public, anon, authenticated;

-- 4. 6.30: backfill ids into existing payloads --------------------------------

-- Only keys that are missing are added. Notifications whose expense or
-- settlement was deleted keep their payload as it is.
update public.notifications n
set payload = n.payload || jsonb_build_object('actor_id', n.actor_id)
where n.actor_id is not null
  and not (n.payload ? 'actor_id');

update public.notifications n
set payload = n.payload || jsonb_build_object('paid_by_id', e.paid_by)
from public.expenses e
where n.type = 'expense_added'
  and not (n.payload ? 'paid_by_id')
  and e.id::text = n.payload->>'expense_id';

update public.notifications n
set payload = n.payload || jsonb_build_object('from_id', s.from_user, 'to_id', s.to_user)
from public.settlements s
where n.type = 'settlement_added'
  and not (n.payload ? 'from_id')
  and s.id::text = n.payload->>'settlement_id';

-- member_joined never stored the member. The joining user is always the
-- actor (group creation and invite acceptance both insert the caller's own
-- membership), so the actor id is used.
update public.notifications n
set payload = n.payload || jsonb_build_object('member_id', n.actor_id)
where n.type = 'member_joined'
  and n.actor_id is not null
  and not (n.payload ? 'member_id');

-- 5. 6.30: anonymize on user deletion -----------------------------------------

-- BEFORE DELETE on profiles: runs for a direct profile delete and for the
-- auth.users cascade. The deleted user's own notifications are removed by
-- their own cascade and are skipped here. The name is the same label the
-- apps use (DELETED_USER_NAME).
create or replace function public.anonymize_deleted_user_in_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id text := old.id::text;
  v_name constant text := 'Deleted user';
begin
  update notifications n
  set payload = n.payload
    || case when n.actor_id = old.id or n.payload->>'actor_id' = v_id
            then jsonb_build_object('actor_name', v_name) else '{}'::jsonb end
    || case when n.payload->>'paid_by_id' = v_id
            then jsonb_build_object('paid_by_name', v_name) else '{}'::jsonb end
    || case when n.payload->>'from_id' = v_id
            then jsonb_build_object('from_name', v_name) else '{}'::jsonb end
    || case when n.payload->>'to_id' = v_id
            then jsonb_build_object('to_name', v_name) else '{}'::jsonb end
    || case when n.payload->>'member_id' = v_id
            then jsonb_build_object('member_name', v_name) else '{}'::jsonb end
  where n.user_id <> old.id
    and (
      n.actor_id = old.id
      or v_id in (
        n.payload->>'actor_id',
        n.payload->>'paid_by_id',
        n.payload->>'from_id',
        n.payload->>'to_id',
        n.payload->>'member_id'
      )
    );

  return old;
end;
$$;

revoke execute on function public.anonymize_deleted_user_in_notifications() from public, anon, authenticated;

drop trigger if exists anonymize_deleted_user_in_notifications on public.profiles;

create trigger anonymize_deleted_user_in_notifications
  before delete on public.profiles
  for each row execute function public.anonymize_deleted_user_in_notifications();

commit;

-- 6. Verification ------------------------------------------------------------
-- Expected: 'receipts policy count' = 4 and four 'storage policy' rows; the
-- trigger present; both functions security definer with search_path=public
-- and no client execute; 'payloads missing ids' ideally 0 (rows whose
-- expense/settlement no longer exists keep counting).

select 'receipts policy count'::text as kind, count(*)::text as name, 'expected 4'::text as detail
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (coalesce(qual, '') || coalesce(with_check, '') || policyname) ilike '%receipts%'
union all
select 'storage policy', policyname::text,
       cmd || ' to ' || array_to_string(roles, ',')
       || ' using ' || coalesce(qual, '-') || ' check ' || coalesce(with_check, '-')
from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (coalesce(qual, '') || coalesce(with_check, '') || policyname) ilike '%receipts%'
union all
select 'trigger', tgname::text, 'on ' || tgrelid::regclass::text || ' enabled=' || tgenabled::text
from pg_trigger
where not tgisinternal and tgname = 'anonymize_deleted_user_in_notifications'
union all
select 'function', p.proname::text,
       'security definer=' || p.prosecdef
       || ' config=' || coalesce(array_to_string(p.proconfig, ','), '-')
       || ' authenticated can execute=' || has_function_privilege('authenticated', p.oid, 'execute')
       || ' anon can execute=' || has_function_privilege('anon', p.oid, 'execute')
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in (
    'anonymize_deleted_user_in_notifications', 'notify_group_members',
    'notify_expense_added', 'notify_settlement_added', 'notify_member_joined',
    'receipt_group_id'
  )
union all
select 'payloads missing ids', count(*)::text, 'by type: ' || coalesce(string_agg(distinct type, ','), '-')
from public.notifications
where (actor_id is not null and not (payload ? 'actor_id'))
   or (type = 'expense_added' and not (payload ? 'paid_by_id'))
   or (type = 'settlement_added' and not (payload ? 'from_id'))
   or (type = 'member_joined' and not (payload ? 'member_id'))
order by 1, 2;
