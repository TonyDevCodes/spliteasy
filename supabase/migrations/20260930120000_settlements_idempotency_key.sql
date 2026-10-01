-- Idempotent settlements: a client-generated key per submit intent lets the
-- database reject a duplicate insert (double-submit, retry) with 23505.
-- Nullable so existing rows and older clients keep working.

alter table public.settlements
  add column idempotency_key uuid;

create unique index settlements_group_idempotency_key_uidx
  on public.settlements (group_id, idempotency_key)
  where idempotency_key is not null;
