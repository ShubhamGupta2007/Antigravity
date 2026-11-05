-- 11_shagun_received.sql
-- Shagun / gifts RECEIVED from guests at a function (separate from the lifafas
-- the family gives). Requires 08 (public.can_edit_function). Run once in the
-- Supabase SQL editor. Safe to re-run.

create table if not exists public.shagun_received (
  id uuid primary key default gen_random_uuid(),
  function_id uuid not null references public.functions(id) on delete cascade,
  family_id uuid references public.families(id) on delete set null,
  giver_name text,
  amount numeric check (amount is null or amount >= 0),
  item text,
  notes text,
  received_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check (family_id is not null or nullif(trim(giver_name), '') is not null),
  check (amount is not null or nullif(trim(item), '') is not null)
);

create index if not exists shagun_received_function_id_idx on public.shagun_received(function_id);

alter table public.shagun_received enable row level security;

-- Money received is private to the people who run the function.
drop policy if exists "Hosts can view shagun received" on public.shagun_received;
create policy "Hosts can view shagun received" on public.shagun_received
  for select to authenticated using (public.can_edit_function(function_id));

drop policy if exists "Hosts can write shagun received" on public.shagun_received;
create policy "Hosts can write shagun received" on public.shagun_received
  for all to authenticated
  using (public.can_edit_function(function_id))
  with check (public.can_edit_function(function_id));
