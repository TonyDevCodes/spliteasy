-- Activity feed, part 1: one chronological stream of a group's expenses and
-- settlements.
--
-- security_invoker = true makes the view run with the privileges of the caller,
-- so the existing RLS policies of expenses, settlements and groups apply
-- unchanged: a user only sees rows of groups they are a member of
-- (is_group_member(group_id, auth.uid())). The view has no policies of its own.
--
-- Columns:
--   kind   'expense' | 'settlement'
--   title  expenses.description for an expense; settlements.kind
--          ('payment' or 'write_off') for a settlement, so the apps word it.
--   actor_id  expenses.paid_by; for a settlement the paying side, falling back
--          to the receiving side for a write-off whose debtor was deleted.
--          NULL when the user was deleted.
--   currency  the group's currency (amounts are stored without one).
--
-- Roll back with:  drop view if exists public.group_activity;

drop view if exists public.group_activity;

create view public.group_activity
with (security_invoker = true)
as
select
  e.group_id,
  'expense'::text as kind,
  e.id as ref_id,
  e.paid_by as actor_id,
  e.amount,
  g.currency,
  e.description as title,
  e.created_at
from public.expenses e
join public.groups g on g.id = e.group_id
union all
select
  s.group_id,
  'settlement'::text as kind,
  s.id as ref_id,
  coalesce(s.from_user, s.to_user) as actor_id,
  s.amount,
  g.currency,
  s.kind as title,
  s.settled_at as created_at
from public.settlements s
join public.groups g on g.id = s.group_id;

grant select on public.group_activity to authenticated;
