-- is_group_member and is_group_admin are RLS helper functions. Only signed-in
-- users ever reach them: no client calls them as an RPC and the app never
-- queries the guarded tables as anon. After this revoke, an anonymous request
-- to those tables fails with 42501 instead of returning zero rows.

revoke execute on function public.is_group_member(uuid, uuid) from public, anon;
grant execute on function public.is_group_member(uuid, uuid) to authenticated;

revoke execute on function public.is_group_admin(uuid, uuid) from public, anon;
grant execute on function public.is_group_admin(uuid, uuid) to authenticated;