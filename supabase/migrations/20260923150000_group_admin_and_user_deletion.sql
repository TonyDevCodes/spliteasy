-- Phase 6: 6.14 group admins, 6.21 safe user deletion.
--
-- 6.14 Only group admins may update a group row (name, currency). Invite links
--      are rows in group_invites, not groups, so generating one (any member)
--      is not affected by this policy.
-- 6.21 Deleting a user (auth.users -> profiles cascade) must not delete groups
--      or other members' data. The user's own profile, memberships and
--      notifications are still removed; references in shared data become NULL
--      and the apps show them as "Deleted user", so everyone else's balances
--      stay exactly as they were.

begin;

-- 1. 6.14: groups UPDATE only for admins -----------------------------------

-- is_group_admin() (initial schema) checks role in ('owner', 'admin'); the
-- apps only ever create 'admin' and 'member', and groups_delete already uses it.
drop policy if exists "groups_update" on public.groups;

create policy "groups_update" on public.groups
  for update
  using (is_group_admin(id, auth.uid()))
  with check (is_group_admin(id, auth.uid()));

-- 2. 6.21: keep shared data when a user is deleted -------------------------

-- groups.created_by: keep the group.
alter table public.groups alter column created_by drop not null;
alter table public.groups drop constraint groups_created_by_fkey;
alter table public.groups
  add constraint groups_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

-- group_invites.created_by: keep the group's invite links working.
alter table public.group_invites alter column created_by drop not null;
alter table public.group_invites drop constraint group_invites_created_by_fkey;
alter table public.group_invites
  add constraint group_invites_created_by_fkey
  foreign key (created_by) references public.profiles (id) on delete set null;

-- expenses.paid_by: the expense and everyone's shares stay; the payer becomes
-- "Deleted user", so what others owe for it is unchanged.
alter table public.expenses alter column paid_by drop not null;
alter table public.expenses drop constraint expenses_paid_by_fkey;
alter table public.expenses
  add constraint expenses_paid_by_fkey
  foreign key (paid_by) references public.profiles (id) on delete set null;

-- expense_splits.user_id was part of the primary key (expense_id, user_id),
-- which cannot hold NULL. Use a surrogate id as primary key and keep
-- (expense_id, user_id) unique for real users.
alter table public.expense_splits drop constraint expense_splits_pkey;
alter table public.expense_splits add column id uuid not null default gen_random_uuid();
alter table public.expense_splits add constraint expense_splits_pkey primary key (id);
alter table public.expense_splits
  add constraint expense_splits_expense_id_user_id_key unique (expense_id, user_id);
alter table public.expense_splits alter column user_id drop not null;
alter table public.expense_splits drop constraint expense_splits_user_id_fkey;
alter table public.expense_splits
  add constraint expense_splits_user_id_fkey
  foreign key (user_id) references public.profiles (id) on delete set null;

-- settlements.from_user / to_user: recorded payments keep counting.
-- The existing check (from_user <> to_user) passes when either side is NULL.
alter table public.settlements alter column from_user drop not null;
alter table public.settlements alter column to_user drop not null;
alter table public.settlements drop constraint settlements_from_user_fkey;
alter table public.settlements drop constraint settlements_to_user_fkey;
alter table public.settlements
  add constraint settlements_from_user_fkey
  foreign key (from_user) references public.profiles (id) on delete set null;
alter table public.settlements
  add constraint settlements_to_user_fkey
  foreign key (to_user) references public.profiles (id) on delete set null;

-- 3. Never leave a group without an admin ----------------------------------

-- When the last admin leaves or is deleted, the longest-standing remaining
-- member becomes admin.
create or replace function public.ensure_group_has_admin(p_group_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update group_members
  set role = 'admin'
  where (group_id, user_id) = (
    select gm.group_id, gm.user_id
    from group_members gm
    where gm.group_id = p_group_id
    order by gm.joined_at, gm.user_id
    limit 1
  )
  and not exists (
    select 1 from group_members a
    where a.group_id = p_group_id and a.role in ('owner', 'admin')
  );
$$;

revoke execute on function public.ensure_group_has_admin(uuid) from public, anon, authenticated;

create or replace function public.promote_admin_after_member_removed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if old.role in ('owner', 'admin') then
    perform ensure_group_has_admin(old.group_id);
  end if;
  return old;
end;
$$;

revoke execute on function public.promote_admin_after_member_removed() from public, anon, authenticated;

create trigger promote_admin_after_member_removed
  after delete on public.group_members
  for each row execute function public.promote_admin_after_member_removed();

-- One-time backfill so the admin-only policy cannot lock any existing group.
select public.ensure_group_has_admin(g.id)
from public.groups g
where not exists (
  select 1 from public.group_members a
  where a.group_id = g.id and a.role in ('owner', 'admin')
);

commit;

-- 4. Verification ------------------------------------------------------------

select 'policy'::text as kind, policyname::text as name, cmd || ' using ' || qual || ' check ' || with_check as detail
from pg_policies
where schemaname = 'public' and tablename = 'groups' and policyname = 'groups_update'
union all
select 'foreign key', c.conrelid::regclass::text || '.' || c.conname::text,
       'on delete ' || case c.confdeltype
         when 'n' then 'set null' when 'c' then 'cascade' when 'a' then 'no action'
         when 'r' then 'restrict' when 'd' then 'set default' end
from pg_constraint c
where c.contype = 'f'
  and c.conname in (
    'groups_created_by_fkey', 'group_invites_created_by_fkey', 'expenses_paid_by_fkey',
    'expense_splits_user_id_fkey', 'settlements_from_user_fkey', 'settlements_to_user_fkey'
  )
union all
select 'primary key', 'public.expense_splits', pg_get_constraintdef(c.oid)
from pg_constraint c
where c.conrelid = 'public.expense_splits'::regclass and c.contype = 'p'
union all
select 'trigger', tgname::text, 'on ' || tgrelid::regclass::text
from pg_trigger
where not tgisinternal and tgname = 'promote_admin_after_member_removed'
union all
select 'groups without admin', count(*)::text, 'should be 0'
from public.groups g
where exists (select 1 from public.group_members m where m.group_id = g.id)
  and not exists (
    select 1 from public.group_members a
    where a.group_id = g.id and a.role in ('owner', 'admin')
  )
order by 1, 2;
