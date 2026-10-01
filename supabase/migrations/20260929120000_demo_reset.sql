-- Phase 6: 6.36 public demo privacy and nightly reset.
--
-- The public demo account (demo@spliteasy.dev, password in the README) is
-- shared by every visitor. public.reset_demo() puts it back into a known state:
--   - every group the demo user created is deleted (cascade: members,
--     expenses, splits, settlements, invites, their notifications); from
--     groups it only joined, the demo user is removed, never the group;
--   - all notifications of the three demo accounts are deleted;
--   - display names are reset to "Demo User", "Alex" and "Sam";
--   - "Weekend in Amsterdam" is recreated with the demo expenses;
--   - the demo password is restored.
-- pg_cron runs it every night at 03:00 UTC.
--
-- Password: the migration stores the demo user's CURRENT bcrypt hash (the
-- README password at the time the migration is applied) in
-- demo_private.settings, and reset_demo() writes it back. The plaintext
-- password is never in this file. Apply this migration only while the demo
-- password still matches the README.
--
-- Storage objects (receipts uploaded by visitors) are not removed by SQL;
-- files of deleted groups stay in the "receipts" bucket without a reference.

begin;

-- 1. pg_cron (Supabase: installed in pg_catalog, jobs live in schema cron) ---

create extension if not exists pg_cron with schema pg_catalog;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- 2. Private settings (not exposed through the API) -------------------------

create schema if not exists demo_private;
revoke all on schema demo_private from public, anon, authenticated;

create table if not exists demo_private.settings (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);
revoke all on table demo_private.settings from public, anon, authenticated;
alter table demo_private.settings enable row level security;

-- Snapshot of the demo password hash; skipped (notice) if the demo user does
-- not exist, as on a fresh database.
do $$
declare
  v_hash text;
begin
  select encrypted_password into v_hash
  from auth.users
  where lower(email) = 'demo@spliteasy.dev';

  if v_hash is null then
    raise notice 'demo@spliteasy.dev not found or has no password, skipping hash snapshot';
    return;
  end if;

  insert into demo_private.settings (key, value)
  values ('demo_password_hash', v_hash)
  on conflict (key) do update set value = excluded.value, updated_at = now();
end
$$;

-- 3. reset_demo() -------------------------------------------------------------

create or replace function public.reset_demo()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_demo  uuid;
  v_alex  uuid;
  v_sam   uuid;
  v_group uuid;
  v_expense uuid;
  v_hash  text;
begin
  select id into v_demo from auth.users where lower(email) = 'demo@spliteasy.dev';
  select id into v_alex from auth.users where lower(email) = 'alex@spliteasy.dev';
  select id into v_sam  from auth.users where lower(email) = 'sam@spliteasy.dev';

  -- A fresh database has no demo accounts: skip instead of failing, so the
  -- migrations replay from scratch.
  if v_demo is null then raise notice 'reset_demo: demo@spliteasy.dev not found, skipping'; return; end if;
  if v_alex is null then raise notice 'reset_demo: alex@spliteasy.dev not found, skipping'; return; end if;
  if v_sam  is null then raise notice 'reset_demo: sam@spliteasy.dev not found, skipping'; return; end if;

  -- Only groups the demo user CREATED are deleted. From any other group the
  -- demo user joined (for example through an invite link to a real group),
  -- the demo user is only removed, so real groups are never deleted.
  delete from groups where created_by = v_demo;
  delete from group_members where user_id = v_demo;

  delete from notifications where user_id in (v_demo, v_alex, v_sam);

  update profiles set display_name = 'Demo User', avatar_url = null where id = v_demo;
  update profiles set display_name = 'Alex', avatar_url = null where id = v_alex;
  update profiles set display_name = 'Sam', avatar_url = null where id = v_sam;

  -- "Weekend in Amsterdam", same data as the original demo seed:
  --   Airbnb, 2 nights       360.00  paid by Demo  equal   120.00 each
  --   Train from Schiphol     51.60  paid by Alex  equal    17.20 each
  --   Dinner at Foodhallen    94.50  paid by Sam   custom   Demo 38.00, Alex 31.50, Sam 25.00
  --   Rijksmuseum tickets     67.50  paid by Demo  equal    22.50 each
  --   Alex pays Demo 50.00 (partial settlement)
  -- Net: Demo +179.80, Alex -89.60, Sam -90.20.
  insert into groups (name, created_by, currency, created_at)
  values ('Weekend in Amsterdam', v_demo, 'EUR', now() - interval '4 days')
  returning id into v_group;

  insert into group_members (group_id, user_id, role, joined_at) values
    (v_group, v_demo, 'admin',  now() - interval '4 days'),
    (v_group, v_alex, 'member', now() - interval '4 days' + interval '1 hour'),
    (v_group, v_sam,  'member', now() - interval '4 days' + interval '2 hours');

  insert into expenses (group_id, paid_by, description, amount, created_at)
  values (v_group, v_demo, 'Airbnb, 2 nights', 360.00, now() - interval '3 days 20 hours')
  returning id into v_expense;
  insert into expense_splits (expense_id, user_id, amount_owed) values
    (v_expense, v_demo, 120.00), (v_expense, v_alex, 120.00), (v_expense, v_sam, 120.00);

  insert into expenses (group_id, paid_by, description, amount, created_at)
  values (v_group, v_alex, 'Train from Schiphol', 51.60, now() - interval '3 days 6 hours')
  returning id into v_expense;
  insert into expense_splits (expense_id, user_id, amount_owed) values
    (v_expense, v_demo, 17.20), (v_expense, v_alex, 17.20), (v_expense, v_sam, 17.20);

  insert into expenses (group_id, paid_by, description, amount, created_at)
  values (v_group, v_sam, 'Dinner at Foodhallen', 94.50, now() - interval '3 days 1 hour')
  returning id into v_expense;
  insert into expense_splits (expense_id, user_id, amount_owed) values
    (v_expense, v_demo, 38.00), (v_expense, v_alex, 31.50), (v_expense, v_sam, 25.00);

  insert into expenses (group_id, paid_by, description, amount, created_at)
  values (v_group, v_demo, 'Rijksmuseum tickets', 67.50, now() - interval '2 days 5 hours')
  returning id into v_expense;
  insert into expense_splits (expense_id, user_id, amount_owed) values
    (v_expense, v_demo, 22.50), (v_expense, v_alex, 22.50), (v_expense, v_sam, 22.50);

  insert into settlements (group_id, from_user, to_user, amount, settled_at, kind)
  values (v_group, v_alex, v_demo, 50.00, now() - interval '1 day', 'payment');

  if exists (
    select 1
    from expenses e
    join expense_splits s on s.expense_id = e.id
    where e.group_id = v_group
    group by e.id, e.amount
    having sum(s.amount_owed) <> e.amount
  ) then
    raise exception 'reset_demo: split totals do not match expense amounts';
  end if;

  -- Restore the demo password (hash saved by this migration).
  select value into v_hash from demo_private.settings where key = 'demo_password_hash';
  if v_hash is not null then
    update auth.users
    set encrypted_password = v_hash, updated_at = now()
    where id = v_demo
      and encrypted_password is distinct from v_hash;
  end if;
end;
$$;

revoke execute on function public.reset_demo() from public, anon, authenticated;

-- 4. Nightly schedule (03:00 UTC), idempotent --------------------------------

do $$
begin
  if exists (select 1 from cron.job where jobname = 'reset-demo-nightly') then
    perform cron.unschedule('reset-demo-nightly');
  end if;
end
$$;

select cron.schedule('reset-demo-nightly', '0 3 * * *', 'select public.reset_demo()');

-- 5. Reset once now, replacing any earlier "Weekend in Amsterdam" (for
--    example the one seeded with test accounts) with the Alex/Sam version.
select public.reset_demo();

commit;

-- 6. Verification ------------------------------------------------------------
-- Expected: pg_cron installed; reset_demo security definer with
-- search_path=public and no client execute; one active 'reset-demo-nightly'
-- job at '0 3 * * *'; the password hash stored; the three accounts present;
-- exactly one demo group with 3 members, 4 expenses and 1 settlement.

select 'extension'::text as kind, extname::text as name, 'schema ' || extnamespace::regnamespace::text as detail
from pg_extension
where extname = 'pg_cron'
union all
select 'function', p.proname::text,
       'security definer=' || p.prosecdef::text
       || ' config=' || coalesce(array_to_string(p.proconfig, ','), '-')
       || ' public/anon/authenticated can execute='
       || has_function_privilege('public', p.oid, 'execute')::text || '/'
       || has_function_privilege('anon', p.oid, 'execute')::text || '/'
       || has_function_privilege('authenticated', p.oid, 'execute')::text
from pg_proc p
where p.pronamespace = 'public'::regnamespace and p.proname = 'reset_demo'
union all
select 'cron job', jobname::text, schedule || ' | ' || command || ' | active=' || active::text
from cron.job
where jobname = 'reset-demo-nightly'
union all
select 'setting', key, 'stored=' || (value like '$2%')::text || ' at ' || updated_at::text
from demo_private.settings
where key = 'demo_password_hash'
union all
select 'demo account', email::text, 'id ' || id::text
from auth.users
where lower(email) in ('demo@spliteasy.dev', 'alex@spliteasy.dev', 'sam@spliteasy.dev')
union all
select 'demo group', g.name,
       (select count(*) from public.group_members m where m.group_id = g.id)::text || ' members, '
       || (select count(*) from public.expenses e where e.group_id = g.id)::text || ' expenses, '
       || (select count(*) from public.settlements s where s.group_id = g.id)::text || ' settlements'
from public.groups g
where g.created_by = (select id from auth.users where lower(email) = 'demo@spliteasy.dev')
order by 1, 2;
