-- 16_gifts.sql
-- Gifts beyond lifafas, prices per circle and per family, gifts for chosen people,
-- and a handover checklist of what each family has been given.
--   * function_gifting_rules.type: 'lifafa' (cash), 'bhaji' (bhaji / mithai box),
--     'gift' (shawl, suit, dry fruits…) or 'return_gift' (what guests take home)
--   * function_gifting_rules.tier_amounts: a different price per circle, e.g.
--     {"tier_1": 800, "tier_2": 800, "tier_3": 500}; a circle left out uses `amount`
--   * function_gifting_rules.target_member_ids: only these people get it (jiju's suit…);
--     side / circle / age filters are ignored when it is set
--   * function_gift_counts.unit_amount: this family's price for the item (Dadi ji's ₹1,500 box);
--     quantity may now be empty (= the usual count) when only the price changes
--   * function_gift_handover: one row per gift line ticked off as given to a family
-- Run once in the Supabase SQL editor. Safe to re-run.

-- 1. Gift types --------------------------------------------------------------
do $$
declare c record;
begin
  -- Drop any older check that only allowed lifafa / return_gift
  for c in
    select conname from pg_constraint
     where conrelid = 'public.function_gifting_rules'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%type%'
       and conname <> 'function_gifting_rules_type_check16'
  loop
    execute format('alter table public.function_gifting_rules drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'function_gifting_rules_type_check16') then
    alter table public.function_gifting_rules
      add constraint function_gifting_rules_type_check16 check (type in ('lifafa', 'bhaji', 'gift', 'return_gift'));
  end if;
end $$;

-- 2. Price per circle, and gifts for chosen people -----------------------------
alter table public.function_gifting_rules
  add column if not exists tier_amounts jsonb,
  add column if not exists target_member_ids uuid[];

-- 3. Per-family price (and optional quantity) -----------------------------------
alter table public.function_gift_counts
  add column if not exists unit_amount numeric check (unit_amount is null or unit_amount >= 0);
alter table public.function_gift_counts alter column quantity drop not null;

-- 4. Handover checklist ---------------------------------------------------------
create table if not exists public.function_gift_handover (
  id uuid primary key default gen_random_uuid(),
  function_id uuid not null references public.functions(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  -- the gifting rule's id, or 'lifafa-exception' for a family's fixed lifafa
  line_key text not null,
  given_at timestamptz not null default now(),
  given_by uuid default auth.uid(),
  unique (function_id, family_id, line_key)
);

create index if not exists function_gift_handover_function_id_idx on public.function_gift_handover(function_id);

alter table public.function_gift_handover enable row level security;

drop policy if exists "Authenticated can view gift handover" on public.function_gift_handover;
create policy "Authenticated can view gift handover" on public.function_gift_handover
  for select to authenticated using (true);

-- Whoever can edit the function (its hosts, and managers) can tick gifts off on the day
drop policy if exists "Hosts can tick gift handover" on public.function_gift_handover;
create policy "Hosts can tick gift handover" on public.function_gift_handover
  for all to authenticated
  using (public.can_edit_function(function_id))
  with check (public.can_edit_function(function_id));

grant select, insert, update, delete on public.function_gift_handover to authenticated;
