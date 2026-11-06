-- 08_function_rituals.sql
-- Rituals for each function, and what is given in each ritual: by which side /
-- person, to which side / person. Run once in the Supabase SQL editor before
-- deploying the matching app code. Requires 07_function_planning.sql (uses
-- public.is_function_manager). Safe to re-run.

create table if not exists public.function_rituals (
  id uuid primary key default gen_random_uuid(),
  function_id uuid not null references public.functions(id) on delete cascade,
  name text not null,
  start_time time,
  description text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists function_rituals_function_id_idx on public.function_rituals(function_id);

create table if not exists public.ritual_items (
  id uuid primary key default gen_random_uuid(),
  ritual_id uuid not null references public.function_rituals(id) on delete cascade,
  item text not null,
  quantity text,
  given_by_side text check (given_by_side in ('groom', 'bride', 'joint')),
  given_by text,
  given_to_side text check (given_to_side in ('groom', 'bride', 'joint', 'other')),
  given_to text,
  est_cost numeric check (est_cost is null or est_cost >= 0),
  status text not null default 'pending' check (status in ('pending', 'arranged', 'given')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists ritual_items_ritual_id_idx on public.ritual_items(ritual_id);

-- Who may edit: admin / planner / bride / groom, or anyone on the hosting side
-- (or anyone, for joint functions). Everyone signed in can view.
create or replace function public.can_edit_function(p_function_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_function_manager() or exists (
    select 1 from public.functions f
    join public.users u on u.id = auth.uid()
    where f.id = p_function_id
      and (f.hosting_side::text = 'joint' or f.hosting_side::text = u.side::text)
  );
$$;

grant execute on function public.can_edit_function(uuid) to authenticated;

alter table public.function_rituals enable row level security;
alter table public.ritual_items enable row level security;

drop policy if exists "Authenticated can view rituals" on public.function_rituals;
create policy "Authenticated can view rituals" on public.function_rituals
  for select to authenticated using (true);

drop policy if exists "Hosts can write rituals" on public.function_rituals;
create policy "Hosts can write rituals" on public.function_rituals
  for all to authenticated
  using (public.can_edit_function(function_id))
  with check (public.can_edit_function(function_id));

drop policy if exists "Authenticated can view ritual items" on public.ritual_items;
create policy "Authenticated can view ritual items" on public.ritual_items
  for select to authenticated using (true);

drop policy if exists "Hosts can write ritual items" on public.ritual_items;
create policy "Hosts can write ritual items" on public.ritual_items
  for all to authenticated
  using (exists (select 1 from public.function_rituals r where r.id = ritual_items.ritual_id and public.can_edit_function(r.function_id)))
  with check (exists (select 1 from public.function_rituals r where r.id = ritual_items.ritual_id and public.can_edit_function(r.function_id)));
