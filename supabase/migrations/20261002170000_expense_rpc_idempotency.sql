-- Atomic, idempotent expense creation.
--
-- Today the clients insert the expense and then its splits in two requests, so a
-- failure or retry between them leaves an expense without splits, and a
-- double-submit creates two expenses. create_expense_with_splits() does both
-- inserts in one function (one transaction) and a client-generated
-- idempotency_key makes a retry return the existing expense instead of a new one.
--
-- Design:
--   - security invoker: the expenses_insert and expense_splits_insert RLS
--     policies, the expenses_guard_recurring_fields trigger and the
--     notify_expense_added trigger all run exactly as for a direct insert.
--     auth.uid() is the caller, so nothing is bypassed.
--   - Amounts are numeric(12,2) like the columns. The apps compute integer cents
--     and send cents / 100, so the splits must sum to the amount exactly; no
--     tolerance.
--   - A repeated key returns the existing id and inserts nothing, so no second
--     notification is created. A concurrent duplicate waits on the unique index
--     and then returns the winner's id.
--   - recurring_id and due_date are not parameters: clients may not set them.
--
-- Rollback:
-- drop function if exists public.create_expense_with_splits(uuid, uuid, numeric, text, text, text, text, jsonb);
-- drop index if exists public.expenses_group_idempotency_key_uidx;
-- alter table public.expenses drop column if exists idempotency_key;
-- delete from supabase_migrations.schema_migrations where version = '20261002170000';

begin;

-- 1. idempotency key ----------------------------------------------------------

alter table public.expenses
  add column if not exists idempotency_key text;

create unique index if not exists expenses_group_idempotency_key_uidx
  on public.expenses (group_id, idempotency_key)
  where idempotency_key is not null;

-- 2. create_expense_with_splits() ---------------------------------------------

create or replace function public.create_expense_with_splits(
  p_group_id uuid,
  p_paid_by uuid,
  p_amount numeric,
  p_description text,
  p_category text,
  p_receipt_url text,
  p_idempotency_key text,
  p_splits jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_splits is null
     or jsonb_typeof(p_splits) <> 'array'
     or jsonb_array_length(p_splits) = 0 then
    raise exception 'splits must be a non-empty array';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_splits) as s(user_id uuid, amount_owed numeric)
    where s.user_id is null
       or s.amount_owed is null
       or s.amount_owed < 0
  ) then
    raise exception 'every split needs a user_id and a non-negative amount_owed';
  end if;

  if (
    select count(*) <> count(distinct s.user_id)
    from jsonb_to_recordset(p_splits) as s(user_id uuid, amount_owed numeric)
  ) then
    raise exception 'duplicate user in splits';
  end if;

  if (
    select sum(s.amount_owed)
    from jsonb_to_recordset(p_splits) as s(user_id uuid, amount_owed numeric)
  ) is distinct from p_amount then
    raise exception 'splits must add up to the amount';
  end if;

  -- A retry with a known key returns the existing expense.
  if p_idempotency_key is not null then
    select id into v_id
    from public.expenses
    where group_id = p_group_id
      and idempotency_key = p_idempotency_key;

    if v_id is not null then
      return v_id;
    end if;
  end if;

  insert into public.expenses
    (group_id, paid_by, amount, description, category, receipt_url, idempotency_key)
  values
    (p_group_id, p_paid_by, p_amount, p_description, p_category, p_receipt_url, p_idempotency_key)
  on conflict (group_id, idempotency_key) where idempotency_key is not null do nothing
  returning id into v_id;

  -- Lost a race with a concurrent call using the same key.
  if v_id is null then
    select id into v_id
    from public.expenses
    where group_id = p_group_id
      and idempotency_key = p_idempotency_key;
    return v_id;
  end if;

  insert into public.expense_splits (expense_id, user_id, amount_owed)
  select v_id, s.user_id, s.amount_owed
  from jsonb_to_recordset(p_splits) as s(user_id uuid, amount_owed numeric);

  return v_id;
end;
$$;

revoke execute on function public.create_expense_with_splits(uuid, uuid, numeric, text, text, text, text, jsonb)
  from public, anon;
grant execute on function public.create_expense_with_splits(uuid, uuid, numeric, text, text, text, text, jsonb)
  to authenticated;

commit;
