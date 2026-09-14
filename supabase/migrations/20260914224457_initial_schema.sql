-- Initial schema for SplitEasy: profiles, groups, expenses, splits, and settlements.
-- All tables have RLS enabled; access is scoped to a user's group memberships.

create type group_role as enum ('owner', 'admin', 'member');

-- 1. profiles ----------------------------------------------------------

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- Auto-create a profiles row whenever a new auth.users row is created.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data ->> 'display_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- 2. groups --------------------------------------------------------------

create table groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table groups enable row level security;

-- 3. group_members --------------------------------------------------------

create table group_members (
  group_id uuid not null references groups (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  role group_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index group_members_user_id_idx on group_members (user_id);

alter table group_members enable row level security;

-- 4. group_invites ---------------------------------------------------------

create table group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  token text not null unique default gen_random_uuid()::text,
  expires_at timestamptz not null,
  created_by uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index group_invites_group_id_idx on group_invites (group_id);

alter table group_invites enable row level security;

-- 5. expenses ---------------------------------------------------------------

create table expenses (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  paid_by uuid not null references profiles (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  description text not null,
  category text,
  receipt_url text,
  created_at timestamptz not null default now()
);

create index expenses_group_id_idx on expenses (group_id);
create index expenses_paid_by_idx on expenses (paid_by);

alter table expenses enable row level security;

-- 6. expense_splits -----------------------------------------------------------

create table expense_splits (
  expense_id uuid not null references expenses (id) on delete cascade,
  user_id uuid not null references profiles (id) on delete cascade,
  amount_owed numeric(12, 2) not null check (amount_owed >= 0),
  primary key (expense_id, user_id)
);

create index expense_splits_user_id_idx on expense_splits (user_id);

alter table expense_splits enable row level security;

-- 7. settlements ------------------------------------------------------------

create table settlements (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references groups (id) on delete cascade,
  from_user uuid not null references profiles (id) on delete cascade,
  to_user uuid not null references profiles (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  settled_at timestamptz not null default now(),
  check (from_user <> to_user)
);

create index settlements_group_id_idx on settlements (group_id);

alter table settlements enable row level security;

-- Helper function ------------------------------------------------------------
-- security definer + stable so it can be used inside the group_members RLS
-- policies themselves without recursively re-evaluating group_members' own RLS.

create or replace function is_group_member(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from group_members
    where group_id = p_group_id
      and user_id = p_user_id
  );
$$;

-- Same recursion-avoidance reasoning as is_group_member, restricted to
-- owner/admin roles for permission checks that need elevated privileges.
create or replace function is_group_admin(p_group_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from group_members
    where group_id = p_group_id
      and user_id = p_user_id
      and role in ('owner', 'admin')
  );
$$;

-- RLS policies ----------------------------------------------------------------

-- profiles: a user can see their own profile and the profiles of anyone who
-- shares at least one group with them; only they can edit their own profile.
create policy "profiles_select" on profiles
  for select using (
    id = auth.uid()
    or exists (
      select 1
      from group_members gm1
      join group_members gm2 on gm1.group_id = gm2.group_id
      where gm1.user_id = auth.uid()
        and gm2.user_id = profiles.id
    )
  );

create policy "profiles_insert" on profiles
  for insert with check (id = auth.uid());

create policy "profiles_update" on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

create policy "profiles_delete" on profiles
  for delete using (id = auth.uid());

-- groups: visible/editable only to members.
create policy "groups_select" on groups
  for select using (is_group_member(id, auth.uid()));

create policy "groups_insert" on groups
  for insert with check (created_by = auth.uid());

create policy "groups_update" on groups
  for update using (is_group_member(id, auth.uid())) with check (is_group_member(id, auth.uid()));

create policy "groups_delete" on groups
  for delete using (is_group_admin(id, auth.uid()));

-- group_members: visible/editable only to members of that group; a user may
-- also insert/delete their own membership row (join/leave).
create policy "group_members_select" on group_members
  for select using (is_group_member(group_id, auth.uid()));

create policy "group_members_insert" on group_members
  for insert with check (
    user_id = auth.uid() or is_group_member(group_id, auth.uid())
  );

create policy "group_members_update" on group_members
  for update using (is_group_admin(group_id, auth.uid())) with check (is_group_admin(group_id, auth.uid()));

create policy "group_members_delete" on group_members
  for delete using (
    user_id = auth.uid() or is_group_admin(group_id, auth.uid())
  );

-- group_invites: visible/editable only to members of the parent group.
create policy "group_invites_select" on group_invites
  for select using (is_group_member(group_id, auth.uid()));

create policy "group_invites_insert" on group_invites
  for insert with check (is_group_member(group_id, auth.uid()) and created_by = auth.uid());

create policy "group_invites_update" on group_invites
  for update using (is_group_member(group_id, auth.uid())) with check (is_group_member(group_id, auth.uid()));

create policy "group_invites_delete" on group_invites
  for delete using (is_group_member(group_id, auth.uid()));

-- expenses: visible/editable only to members of the parent group.
create policy "expenses_select" on expenses
  for select using (is_group_member(group_id, auth.uid()));

create policy "expenses_insert" on expenses
  for insert with check (is_group_member(group_id, auth.uid()));

create policy "expenses_update" on expenses
  for update using (is_group_member(group_id, auth.uid())) with check (is_group_member(group_id, auth.uid()));

create policy "expenses_delete" on expenses
  for delete using (is_group_member(group_id, auth.uid()));

-- expense_splits: scoped via the parent expense's group.
create policy "expense_splits_select" on expense_splits
  for select using (
    exists (
      select 1 from expenses e
      where e.id = expense_splits.expense_id
        and is_group_member(e.group_id, auth.uid())
    )
  );

create policy "expense_splits_insert" on expense_splits
  for insert with check (
    exists (
      select 1 from expenses e
      where e.id = expense_splits.expense_id
        and is_group_member(e.group_id, auth.uid())
    )
  );

create policy "expense_splits_update" on expense_splits
  for update using (
    exists (
      select 1 from expenses e
      where e.id = expense_splits.expense_id
        and is_group_member(e.group_id, auth.uid())
    )
  ) with check (
    exists (
      select 1 from expenses e
      where e.id = expense_splits.expense_id
        and is_group_member(e.group_id, auth.uid())
    )
  );

create policy "expense_splits_delete" on expense_splits
  for delete using (
    exists (
      select 1 from expenses e
      where e.id = expense_splits.expense_id
        and is_group_member(e.group_id, auth.uid())
    )
  );

-- settlements: visible/editable only to members of the parent group.
create policy "settlements_select" on settlements
  for select using (is_group_member(group_id, auth.uid()));

create policy "settlements_insert" on settlements
  for insert with check (is_group_member(group_id, auth.uid()));

create policy "settlements_update" on settlements
  for update using (is_group_member(group_id, auth.uid())) with check (is_group_member(group_id, auth.uid()));

create policy "settlements_delete" on settlements
  for delete using (is_group_member(group_id, auth.uid()));
