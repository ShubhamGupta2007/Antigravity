-- 07_function_planning.sql
-- Per-function headcounts, lifafa overrides, function schedule (timed parts),
-- and syncing planned gifting totals into each function's budget category.
--
-- Run this once in the Supabase SQL editor BEFORE deploying the matching app code.
-- It only adds columns, tables, policies and functions; it is safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Helper: is the current user allowed to manage gifting? (admin/planner/bride/groom)
-- ---------------------------------------------------------------------------
create or replace function public.is_function_manager()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid()
      and role::text in ('admin', 'planner', 'bride', 'groom')
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Functions: kid age cut-off + stored planned gifting totals
-- ---------------------------------------------------------------------------
alter table public.functions
  add column if not exists kid_age_threshold integer not null default 12,
  add column if not exists planned_lifafa_total numeric not null default 0,
  add column if not exists planned_return_gift_total numeric not null default 0,
  add column if not exists gifting_updated_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'functions_kid_age_threshold_check') then
    alter table public.functions
      add constraint functions_kid_age_threshold_check check (kid_age_threshold between 1 and 25);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Per-function headcount on the family-level attendance row
--    (null = use the family's usual expected counts)
-- ---------------------------------------------------------------------------
alter table public.function_attendance
  add column if not exists adults_count integer,
  add column if not exists kids_count integer;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'function_attendance_headcount_check') then
    alter table public.function_attendance
      add constraint function_attendance_headcount_check
      check ((adults_count is null or adults_count >= 0) and (kids_count is null or kids_count >= 0));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Per-family lifafa override for a function (replaces rule-based lifafa amount)
-- ---------------------------------------------------------------------------
create table if not exists public.function_gift_overrides (
  id uuid primary key default gen_random_uuid(),
  function_id uuid not null references public.functions(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  lifafa_amount numeric not null check (lifafa_amount >= 0),
  note text,
  created_at timestamptz not null default now(),
  unique (function_id, family_id)
);

alter table public.function_gift_overrides enable row level security;

drop policy if exists "Authenticated can view gift overrides" on public.function_gift_overrides;
create policy "Authenticated can view gift overrides" on public.function_gift_overrides
  for select to authenticated using (true);

drop policy if exists "Managers can write gift overrides" on public.function_gift_overrides;
create policy "Managers can write gift overrides" on public.function_gift_overrides
  for all to authenticated
  using (public.is_function_manager())
  with check (public.is_function_manager());

-- Planners (and admin/bride/groom) can manage gifting rules. Policies are OR'd,
-- so this adds access without removing any existing policy, and it does not
-- change whether RLS is enabled on the table.
drop policy if exists "Managers can write gifting rules" on public.function_gifting_rules;
create policy "Managers can write gifting rules" on public.function_gifting_rules
  for all to authenticated
  using (public.is_function_manager())
  with check (public.is_function_manager());

-- Per-family quantity for a gifting rule, e.g. "Sharma family gets 2 bhaji boxes".
-- When set, it replaces the rule's automatic count for that family (0 = none).
create table if not exists public.function_gift_counts (
  id uuid primary key default gen_random_uuid(),
  function_id uuid not null references public.functions(id) on delete cascade,
  rule_id uuid not null references public.function_gifting_rules(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  quantity integer not null check (quantity >= 0),
  created_at timestamptz not null default now(),
  unique (rule_id, family_id)
);

create index if not exists function_gift_counts_function_id_idx on public.function_gift_counts(function_id);

alter table public.function_gift_counts enable row level security;

drop policy if exists "Authenticated can view gift counts" on public.function_gift_counts;
create policy "Authenticated can view gift counts" on public.function_gift_counts
  for select to authenticated using (true);

drop policy if exists "Managers can write gift counts" on public.function_gift_counts;
create policy "Managers can write gift counts" on public.function_gift_counts
  for all to authenticated
  using (public.is_function_manager())
  with check (public.is_function_manager());

-- ---------------------------------------------------------------------------
-- 5. Function schedule: timed parts within a function (Baraat, Milni, Pheras...)
-- ---------------------------------------------------------------------------
create table if not exists public.function_segments (
  id uuid primary key default gen_random_uuid(),
  function_id uuid not null references public.functions(id) on delete cascade,
  name text not null,
  start_time time,
  end_time time,
  location text,
  notes text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists function_segments_function_id_idx on public.function_segments(function_id);

alter table public.function_segments enable row level security;

drop policy if exists "Authenticated can view function segments" on public.function_segments;
create policy "Authenticated can view function segments" on public.function_segments
  for select to authenticated using (true);

drop policy if exists "Hosts can write function segments" on public.function_segments;
create policy "Hosts can write function segments" on public.function_segments
  for all to authenticated
  using (
    public.is_function_manager() or exists (
      select 1 from public.functions f
      join public.users u on u.id = auth.uid()
      where f.id = function_segments.function_id
        and (f.hosting_side::text = 'joint' or f.hosting_side::text = u.side::text)
    )
  )
  with check (
    public.is_function_manager() or exists (
      select 1 from public.functions f
      join public.users u on u.id = auth.uid()
      where f.id = function_segments.function_id
        and (f.hosting_side::text = 'joint' or f.hosting_side::text = u.side::text)
    )
  );

-- ---------------------------------------------------------------------------
-- 6. Auto-managed budget sub-items ("Lifafas & Gifts" under a function's category)
-- ---------------------------------------------------------------------------
alter table public.category_sub_items
  add column if not exists is_auto boolean not null default false,
  add column if not exists auto_source text,
  add column if not exists auto_function_id uuid references public.functions(id) on delete set null;

-- Saves a function's planned gifting totals and mirrors them into the
-- "Lifafas & Gifts" sub-budget of the budget category linked to that function.
-- Returns the linked category id, or null when no category is linked yet.
create or replace function public.set_function_gifting_plan(
  p_function_id uuid,
  p_lifafa numeric,
  p_return_gift numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category uuid;
  v_item uuid;
  v_total numeric := greatest(coalesce(p_lifafa, 0), 0) + greatest(coalesce(p_return_gift, 0), 0);
begin
  -- Signed-in users, or the server-side secret key (used by the guest photo import skill)
  if auth.uid() is null and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Not authenticated';
  end if;

  update public.functions
     set planned_lifafa_total = greatest(coalesce(p_lifafa, 0), 0),
         planned_return_gift_total = greatest(coalesce(p_return_gift, 0), 0),
         gifting_updated_at = now()
   where id = p_function_id;

  select id into v_category
    from public.categories
   where function_id = p_function_id
   order by name
   limit 1;

  if v_category is null then
    return null;
  end if;

  select id into v_item
    from public.category_sub_items
   where category_id = v_category
     and auto_source = 'function_gifting'
     and auto_function_id = p_function_id
   limit 1;

  if v_item is null then
    if v_total > 0 then
      insert into public.category_sub_items (category_id, name, target_budget, is_auto, auto_source, auto_function_id)
      values (v_category, 'Lifafas & Gifts', v_total, true, 'function_gifting', p_function_id);
    end if;
  else
    update public.category_sub_items set target_budget = v_total where id = v_item;
  end if;

  return v_category;
end;
$$;

grant execute on function public.set_function_gifting_plan(uuid, numeric, numeric) to authenticated;
grant execute on function public.is_function_manager() to authenticated;

-- Lets managers (incl. planners) change who counts as a kid for a function's
-- gifting, without needing general update rights on the functions table.
create or replace function public.set_function_kid_age(p_function_id uuid, p_age integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_function_manager() then
    raise exception 'Only admins, planners, bride or groom can change this';
  end if;
  update public.functions set kid_age_threshold = p_age where id = p_function_id;
end;
$$;

grant execute on function public.set_function_kid_age(uuid, integer) to authenticated;
