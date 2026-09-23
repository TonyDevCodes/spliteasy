-- Phase 4.1: multiple currencies (display only, per group, no exchange rates).

-- Existing groups keep working and become EUR via the default backfill.
alter table groups
  add column currency text not null default 'EUR';

alter table groups
  add constraint groups_currency_check
  check (currency in ('EUR', 'USD', 'GBP', 'CHF', 'ALL', 'TRY', 'PLN', 'SEK', 'NOK', 'DKK'));

-- An UPDATE policy on groups already exists (groups_update, added in
-- 20260914224457_initial_schema.sql): it lets any group member update the
-- group row. Left untouched per instructions; no new UPDATE policy is added.

-- Make sure realtime clients are notified when a group's currency changes.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'groups'
  ) then
    alter publication supabase_realtime add table groups;
  end if;
end
$$;
