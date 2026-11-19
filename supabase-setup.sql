-- Create your email/password account in Authentication > Users first.
-- This migration pins the owner by user ID. Change the email below if needed.
begin;

create table if not exists public.pc_ledger_owners (
  singleton boolean primary key default true check (singleton),
  user_id uuid not null unique references auth.users(id) on delete cascade
);
alter table public.pc_ledger_owners enable row level security;
revoke all on public.pc_ledger_owners from public, anon, authenticated;
grant select on public.pc_ledger_owners to authenticated;
drop policy if exists "owner can read membership" on public.pc_ledger_owners;
create policy "owner can read membership" on public.pc_ledger_owners
for select to authenticated using (user_id = (select auth.uid()));

do $$
declare target_id uuid;
begin
  select id into target_id from auth.users where lower(email) = lower('pee47409@gmail.com');
  if target_id is null then
    raise exception 'Create pee47409@gmail.com in Authentication > Users first, or change the email in this SQL.';
  end if;
  if exists (select 1 from public.pc_ledger_owners where user_id <> target_id) then
    raise exception 'A different owner already exists. Review the owner before changing access.';
  end if;
  insert into public.pc_ledger_owners(singleton,user_id) values(true,target_id)
  on conflict(singleton) do nothing;
end $$;

create table if not exists public.pc_ledger_state (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null check (
    jsonb_typeof(data) = 'object'
    and data->>'version' = '1'
    and jsonb_typeof(data->'rows') = 'array'
    and jsonb_typeof(data->'parts') = 'array'
    and octet_length(data::text) <= 10000000
  ),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.pc_ledger_state enable row level security;
revoke all on public.pc_ledger_state from public, anon, authenticated;
grant select, insert, update on public.pc_ledger_state to authenticated;
drop policy if exists "single owner access" on public.pc_ledger_state;
create policy "single owner access" on public.pc_ledger_state
for all to authenticated
using (
  owner_id = (select auth.uid())
  and exists(select 1 from public.pc_ledger_owners where user_id = (select auth.uid()))
)
with check (
  owner_id = (select auth.uid())
  and exists(select 1 from public.pc_ledger_owners where user_id = (select auth.uid()))
);

create or replace function public.save_pc_ledger(p_expected_revision bigint, p_data jsonb)
returns table(revision bigint)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.pc_ledger_owners where user_id = auth.uid()
  ) then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  if p_expected_revision = 0 then
    return query
    insert into public.pc_ledger_state as ledger(owner_id,data,revision)
    values(auth.uid(),p_data,1)
    on conflict(owner_id) do nothing
    returning ledger.revision;
  else
    return query
    update public.pc_ledger_state as ledger
    set data = p_data, revision = ledger.revision + 1, updated_at = now()
    where owner_id = auth.uid() and ledger.revision = p_expected_revision
    returning ledger.revision;
  end if;
end;
$$;
revoke all on function public.save_pc_ledger(bigint,jsonb) from public, anon;
grant execute on function public.save_pc_ledger(bigint,jsonb) to authenticated;

commit;
