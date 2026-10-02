-- Recurring expenses, part 1: templates, idempotent generation, daily schedule.
--
-- A recurring_expenses row is a template (payer, amount, split, weekly or
-- monthly). public.generate_recurring_expenses() runs daily via pg_cron and
-- turns every due template into a normal expense plus its expense_splits, so
-- balances, the activity feed and notifications work unchanged.
--
-- Design:
--   - splits is a jsonb array of {user_id, amount_owed}; the function checks it
--     (sum equals amount, no duplicates, payer and everyone in it still members
--     of the group). An invalid template is deactivated instead of failing the
--     whole run.
--   - expenses.recurring_id + due_date with a partial unique index make
--     generation idempotent: a re-run or a concurrent run cannot create an
--     occurrence twice.
--   - After downtime the function catches up: it loops while next_due <=
--     current_date, creating one expense per missed due date, each dated at
--     12:00 UTC of its due date.
--   - Monthly due dates are anchor_date + n months, never previous + 1 month,
--     so a 31st becomes Feb 28/29 and then goes back to the 31st.
--   - The function is security definer and not executable by clients; only
--     pg_cron (postgres) runs it.
--
-- Rollback:
-- select cron.unschedule('generate-recurring-daily');
-- drop trigger if exists expenses_guard_recurring_fields on public.expenses;
-- drop function if exists public.guard_expense_recurring_fields();
-- drop function if exists public.generate_recurring_expenses();
-- drop index if exists public.expenses_recurring_id_due_date_key;
-- alter table public.expenses drop column if exists due_date;
-- alter table public.expenses drop column if exists recurring_id;
-- drop table if exists public.recurring_expenses;
-- delete from supabase_migrations.schema_migrations where version = '20261002150000';

begin;

-- 1. recurring_expenses -------------------------------------------------------

create table public.recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  paid_by uuid references public.profiles (id) on delete set null,
  description text not null,
  category text,
  amount numeric(12, 2) not null check (amount > 0),
  splits jsonb not null check (jsonb_typeof(splits) = 'array'),
  frequency text not null check (frequency in ('weekly', 'monthly')),
  anchor_date date not null,
  next_due date not null,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index recurring_expenses_group_id_idx on public.recurring_expenses (group_id);
create index recurring_expenses_due_idx on public.recurring_expenses (next_due) where active;

alter table public.recurring_expenses enable row level security;

create policy "recurring_expenses_select" on public.recurring_expenses
  for select using (is_group_member(group_id, auth.uid()));

create policy "recurring_expenses_insert" on public.recurring_expenses
  for insert with check (
    is_group_member(group_id, auth.uid())
    and created_by = auth.uid()
    and (paid_by is null or is_group_member(group_id, paid_by))
  );

create policy "recurring_expenses_update" on public.recurring_expenses
  for update
  using (is_group_member(group_id, auth.uid()) and created_by = auth.uid())
  with check (
    is_group_member(group_id, auth.uid())
    and created_by = auth.uid()
    and (paid_by is null or is_group_member(group_id, paid_by))
  );

create policy "recurring_expenses_delete" on public.recurring_expenses
  for delete using (is_group_member(group_id, auth.uid()) and created_by = auth.uid());

grant select, insert, update, delete on public.recurring_expenses to authenticated;

-- 2. expenses: link to the template, one expense per template and due date ----

alter table public.expenses
  add column recurring_id uuid references public.recurring_expenses (id) on delete set null,
  add column due_date date;

create unique index expenses_recurring_id_due_date_key
  on public.expenses (recurring_id, due_date)
  where recurring_id is not null;

-- Clients must not set these columns; only the generator (auth.uid() null) does.

create or replace function public.guard_expense_recurring_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if auth.uid() is not null then
    if tg_op = 'INSERT' then
      if new.recurring_id is not null or new.due_date is not null then
        raise exception 'recurring_id and due_date cannot be set by clients';
      end if;
    -- Setting recurring_id to null is allowed so ON DELETE SET NULL works when a
    -- template is deleted; clients still cannot set or change the values.
    elsif (new.recurring_id is not null and new.recurring_id is distinct from old.recurring_id)
       or new.due_date is distinct from old.due_date then
      raise exception 'recurring_id and due_date cannot be changed by clients';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function public.guard_expense_recurring_fields() from public, anon, authenticated;

create trigger expenses_guard_recurring_fields
  before insert or update of recurring_id, due_date on public.expenses
  for each row execute function public.guard_expense_recurring_fields();

-- 3. generate_recurring_expenses() --------------------------------------------

create or replace function public.generate_recurring_expenses()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t public.recurring_expenses%rowtype;
  v_due date;
  v_expense uuid;
  v_months int;
begin
  for t in
    select *
    from public.recurring_expenses
    where active
      and next_due <= current_date
    for update skip locked
  loop
    -- A template that can no longer produce a valid expense is switched off.
    if t.paid_by is null
       or not public.is_group_member(t.group_id, t.paid_by)
       or jsonb_array_length(t.splits) = 0
       or exists (
         select 1
         from jsonb_to_recordset(t.splits) as s(user_id uuid, amount_owed numeric)
         where s.user_id is null
            or s.amount_owed is null
            or s.amount_owed < 0
            or not public.is_group_member(t.group_id, s.user_id)
       )
       or (
         select count(*) <> count(distinct s.user_id)
         from jsonb_to_recordset(t.splits) as s(user_id uuid, amount_owed numeric)
       )
       or (
         select coalesce(sum(s.amount_owed), 0) <> t.amount
         from jsonb_to_recordset(t.splits) as s(user_id uuid, amount_owed numeric)
       )
    then
      update public.recurring_expenses set active = false where id = t.id;
      continue;
    end if;

    v_due := t.next_due;

    while v_due <= current_date loop
      insert into public.expenses
        (group_id, paid_by, description, category, amount, created_at, recurring_id, due_date)
      values
        (t.group_id, t.paid_by, t.description, t.category, t.amount,
         (v_due + time '12:00') at time zone 'UTC', t.id, v_due)
      on conflict (recurring_id, due_date) where recurring_id is not null do nothing
      returning id into v_expense;

      if v_expense is not null then
        insert into public.expense_splits (expense_id, user_id, amount_owed)
        select v_expense, s.user_id, s.amount_owed
        from jsonb_to_recordset(t.splits) as s(user_id uuid, amount_owed numeric);
      end if;
      v_expense := null;

      if t.frequency = 'weekly' then
        v_due := v_due + 7;
      else
        -- From the anchor, so month ends do not drift (31st -> 28th -> 31st).
        v_months := (extract(year from v_due)::int - extract(year from t.anchor_date)::int) * 12
                  + (extract(month from v_due)::int - extract(month from t.anchor_date)::int);
        v_due := (t.anchor_date + make_interval(months => v_months + 1))::date;
      end if;
    end loop;

    update public.recurring_expenses set next_due = v_due where id = t.id;
  end loop;
end;
$$;

revoke execute on function public.generate_recurring_expenses() from public, anon, authenticated;

-- 4. Daily schedule (03:15 UTC), idempotent ------------------------------------

-- pg_cron is already enabled by the demo reset migration; do not recreate the
-- extension here (it fails with 'dependent privileges exist' on Supabase).

do $$
begin
  if exists (select 1 from cron.job where jobname = 'generate-recurring-daily') then
    perform cron.unschedule('generate-recurring-daily');
  end if;
end
$$;

select cron.schedule('generate-recurring-daily', '15 3 * * *', 'select public.generate_recurring_expenses()');

commit;
