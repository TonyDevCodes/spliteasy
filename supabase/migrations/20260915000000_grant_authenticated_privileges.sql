-- Grant base table privileges to the authenticated role.
-- RLS policies control *which rows* a user can see; these GRANTs control
-- whether the authenticated role can touch the table at all. Without them,
-- Postgres denies access before RLS is even evaluated (error 42501).

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.groups to authenticated;
grant select, insert, update, delete on public.group_members to authenticated;
grant select, insert, update, delete on public.group_invites to authenticated;
grant select, insert, update, delete on public.expenses to authenticated;
grant select, insert, update, delete on public.expense_splits to authenticated;
grant select, insert, update, delete on public.settlements to authenticated;