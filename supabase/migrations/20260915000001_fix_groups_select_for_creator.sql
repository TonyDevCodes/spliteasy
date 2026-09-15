-- Allow a group's creator to see it immediately after creation, even before
-- the corresponding group_members row exists. Without this, INSERT ...
-- RETURNING on groups fails: RETURNING is filtered through the SELECT
-- policy, and is_group_member() returns false until group_members is
-- populated in the next statement (a chicken-and-egg problem).

drop policy "groups_select" on groups;

create policy "groups_select" on groups
  for select using (
    is_group_member(id, auth.uid()) or created_by = auth.uid()
  );