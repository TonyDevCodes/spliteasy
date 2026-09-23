-- Phase 4.4: in-app notifications.
--
-- Rows are only ever created by the triggers below (security definer). Clients
-- can read their own notifications and mark them as read (read_at only).
--
-- Actor columns in the existing schema:
--   expenses.paid_by, settlements.from_user, group_members.user_id,
--   groups.created_by. The actor is auth.uid() when the change comes from a
--   signed-in client, otherwise the row's actor column.

begin;

-- 1. Table ----------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  group_id uuid references public.groups (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  type text not null check (type in ('expense_added', 'settlement_added', 'member_joined', 'currency_changed')),
  payload jsonb not null default '{}',
  read_at timestamptz null,
  created_at timestamptz not null default now()
);

create index notifications_user_id_read_at_created_at_idx
  on public.notifications (user_id, read_at, created_at desc);

-- 2. Privileges and RLS ---------------------------------------------------

alter table public.notifications enable row level security;

-- No client inserts or deletes; updates are limited to the read_at column.
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;
revoke update on table public.notifications from authenticated;
grant update (read_at) on table public.notifications to authenticated;

create policy "notifications_select" on public.notifications
  for select using (user_id = auth.uid());

create policy "notifications_update" on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 3. Helpers --------------------------------------------------------------

-- Same rule as getDisplayName() in the apps: the display name, or the part of
-- the email before "@", so raw emails never end up in a notification.
create or replace function public.notification_display_name(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(p.display_name), ''), split_part(p.email, '@', 1))
  from profiles p
  where p.id = p_user_id;
$$;

revoke execute on function public.notification_display_name(uuid) from public, anon, authenticated;

-- Inserts one notification for every member of the group except the actor.
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
  select gm.user_id, p_group_id, p_actor_id, p_type, p_payload
  from group_members gm
  where gm.group_id = p_group_id
    and gm.user_id is distinct from p_actor_id;
$$;

revoke execute on function public.notify_group_members(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- 4. Trigger functions ----------------------------------------------------

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
      'paid_by_name', notification_display_name(new.paid_by)
    )
  );
  return new;
end;
$$;

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
      'member_name', notification_display_name(new.user_id)
    )
  );
  return new;
end;
$$;

create or replace function public.notify_currency_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.created_by);
begin
  perform notify_group_members(
    new.id,
    v_actor,
    'currency_changed',
    jsonb_build_object(
      'group_name', new.name,
      'old_currency', old.currency,
      'currency', new.currency,
      'actor_name', notification_display_name(v_actor)
    )
  );
  return new;
end;
$$;

revoke execute on function public.notify_expense_added() from public, anon, authenticated;
revoke execute on function public.notify_settlement_added() from public, anon, authenticated;
revoke execute on function public.notify_member_joined() from public, anon, authenticated;
revoke execute on function public.notify_currency_changed() from public, anon, authenticated;

-- 5. Triggers -------------------------------------------------------------

create trigger notify_expense_added
  after insert on public.expenses
  for each row execute function public.notify_expense_added();

create trigger notify_settlement_added
  after insert on public.settlements
  for each row execute function public.notify_settlement_added();

create trigger notify_member_joined
  after insert on public.group_members
  for each row execute function public.notify_member_joined();

create trigger notify_currency_changed
  after update of currency on public.groups
  for each row
  when (old.currency is distinct from new.currency)
  execute function public.notify_currency_changed();

-- 6. Realtime -------------------------------------------------------------

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table notifications;
  end if;
end
$$;

commit;

-- 7. Verification ---------------------------------------------------------

select
  to_regclass('public.notifications') is not null as table_exists,
  (select c.relrowsecurity from pg_class c where c.oid = to_regclass('public.notifications')) as rls_enabled,
  (select count(*) from pg_policies where schemaname = 'public' and tablename = 'notifications') as policy_count,
  (select count(*) from pg_trigger
     where not tgisinternal
       and tgname in ('notify_expense_added', 'notify_settlement_added', 'notify_member_joined', 'notify_currency_changed')) as triggers_present,
  exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) as realtime_enabled;
