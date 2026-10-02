-- Skip notifications for recurring catch-up expenses.
--
-- When the daily generator has been down or a template was paused and resumed,
-- it back-fills several overdue occurrences at once. Notifying every group
-- member about each old occurrence is noise. Expenses generated from a
-- recurring template whose due_date is more than one day in the past are
-- therefore inserted silently. Occurrences due today or yesterday (normal
-- timezone slack) and all manually created expenses still notify as before.
--
-- Only the function body changes. The trigger, security mode, search_path and
-- payload are identical to 20260928140000_receipt_policies_and_notification_anonymization.sql.
--
-- Rollback: re-run the function below without the early return, i.e.
--
-- create or replace function public.notify_expense_added()
-- returns trigger
-- language plpgsql
-- security definer
-- set search_path = public
-- as $$
-- declare
--   v_actor uuid := coalesce(auth.uid(), new.paid_by);
--   v_group groups%rowtype;
-- begin
--   select * into v_group from groups where id = new.group_id;
--
--   perform notify_group_members(
--     new.group_id,
--     v_actor,
--     'expense_added',
--     jsonb_build_object(
--       'expense_id', new.id,
--       'description', new.description,
--       'amount', new.amount,
--       'currency', v_group.currency,
--       'group_name', v_group.name,
--       'actor_name', notification_display_name(v_actor),
--       'paid_by_id', new.paid_by,
--       'paid_by_name', notification_display_name(new.paid_by)
--     )
--   );
--   return new;
-- end;
-- $$;

begin;

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
  if new.recurring_id is not null and new.due_date < current_date - 1 then
    return new;
  end if;

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

revoke execute on function public.notify_expense_added() from public, anon, authenticated;

commit;
