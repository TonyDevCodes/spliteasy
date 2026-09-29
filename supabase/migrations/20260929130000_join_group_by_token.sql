-- Phase 6: 6.40 join groups only through a valid invite.
--
-- Before: group_members_insert allowed
--   user_id = auth.uid() or is_group_member(group_id, auth.uid())
-- so any signed-in user could add themselves to any group whose id they knew
-- (with any role, including admin), and any member could add anyone with any
-- role. Joining now goes through join_group_by_token(), which checks the
-- invite. Direct inserts are limited to:
--   - the group creator adding themselves as admin while the group has no
--     members yet (the web and mobile "create group" flow);
--   - a group admin adding another user as a plain member.
-- reset_demo() is security definer (owner bypasses RLS) and is unaffected.

begin;

-- 1. Helper for the policy -------------------------------------------------

-- security definer, like is_group_member: reading groups/group_members inside
-- a group_members policy would otherwise recurse through RLS.
create or replace function public.is_new_group_creator(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from groups g
    where g.id = p_group_id and g.created_by = p_user_id
  )
  and not exists (
    select 1 from group_members m
    where m.group_id = p_group_id
  );
$$;

revoke execute on function public.is_new_group_creator(uuid, uuid) from public, anon;
grant execute on function public.is_new_group_creator(uuid, uuid) to authenticated;

-- 2. Narrow group_members_insert --------------------------------------------

drop policy if exists "group_members_insert" on public.group_members;

create policy "group_members_insert" on public.group_members
  for insert
  with check (
    (
      user_id = auth.uid()
      and role = 'admin'
      and public.is_new_group_creator(group_id, auth.uid())
    )
    or (
      user_id <> auth.uid()
      and role = 'member'
      and public.is_group_admin(group_id, auth.uid())
    )
  );

-- 3. join_group_by_token() ----------------------------------------------------

-- Joins the signed-in user to the invite's group as a member and returns the
-- group id. Already a member: nothing changes, the group id is returned.
-- Errors (message is stable, clients map it):
--   not_authenticated, invite_invalid, invite_expired
create or replace function public.join_group_by_token(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid := auth.uid();
  v_group   uuid;
  v_expires timestamptz;
begin
  if v_user is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select gi.group_id, gi.expires_at
  into v_group, v_expires
  from group_invites gi
  where gi.token = p_token;

  if v_group is null then
    raise exception 'invite_invalid' using errcode = 'P0002', hint = 'This invite link is invalid.';
  end if;

  if v_expires < now() then
    raise exception 'invite_expired' using errcode = 'P0001', hint = 'This invite link has expired.';
  end if;

  insert into group_members (group_id, user_id, role)
  values (v_group, v_user, 'member')
  on conflict (group_id, user_id) do nothing;

  return v_group;
end;
$$;

revoke execute on function public.join_group_by_token(text) from public, anon;
grant execute on function public.join_group_by_token(text) to authenticated;

commit;

-- 4. Verification ------------------------------------------------------------
-- Expected: the new group_members_insert check; both functions security
-- definer, executable by authenticated but not anon.

select 'policy'::text as kind, policyname::text as name,
       cmd || ' using ' || coalesce(qual, '-') || ' check ' || coalesce(with_check, '-') as detail
from pg_policies
where schemaname = 'public' and tablename = 'group_members'
union all
select 'function', p.proname::text,
       'security definer=' || p.prosecdef::text
       || ' config=' || coalesce(array_to_string(p.proconfig, ','), '-')
       || ' anon/authenticated can execute='
       || has_function_privilege('anon', p.oid, 'execute')::text || '/'
       || has_function_privilege('authenticated', p.oid, 'execute')::text
from pg_proc p
where p.pronamespace = 'public'::regnamespace
  and p.proname in ('join_group_by_token', 'is_new_group_creator')
order by 1, 2;
