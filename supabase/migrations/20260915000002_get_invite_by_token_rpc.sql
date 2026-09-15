-- Lets an authenticated user look up an invite by its token, even before
-- they're a group member (group_invites SELECT policy normally requires
-- membership, which is a chicken-and-egg problem for someone accepting an
-- invite). security definer bypasses RLS for this narrow, read-only lookup.

create or replace function get_invite_by_token(p_token text)
returns table (
  invite_id uuid,
  group_id uuid,
  group_name text,
  expires_at timestamptz,
  is_expired boolean
)
language sql
security definer
set search_path = public
stable
as $$
  select
    gi.id as invite_id,
    gi.group_id,
    g.name as group_name,
    gi.expires_at,
    gi.expires_at < now() as is_expired
  from group_invites gi
  join groups g on g.id = gi.group_id
  where gi.token = p_token;
$$;

grant execute on function get_invite_by_token(text) to authenticated;