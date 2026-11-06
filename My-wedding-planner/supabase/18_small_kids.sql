-- 18_small_kids.sql
-- A third age group for gifting: small kids (e.g. Adults ₹1,100 · Kids ₹500 · Small kids ₹250).
--   * functions.small_kid_age: kids under this age are "small kids" (default 5)
--   * gifting rules can target 'SmallKids' (under that age) and 'OlderKids' (the rest of the kids)
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table public.functions
  add column if not exists small_kid_age integer not null default 5;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'functions_small_kid_age_check') then
    alter table public.functions add constraint functions_small_kid_age_check check (small_kid_age between 1 and 25);
  end if;
end $$;

-- If an older check limits who a rule can target, widen it to include the new groups
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
     where conrelid = 'public.function_gifting_rules'::regclass and contype = 'c'
       and pg_get_constraintdef(oid) ilike '%target_gender%'
       and conname <> 'function_gifting_rules_target_group_check18'
  loop
    execute format('alter table public.function_gifting_rules drop constraint %I', c.conname);
  end loop;
  if not exists (select 1 from pg_constraint where conname = 'function_gifting_rules_target_group_check18') then
    alter table public.function_gifting_rules add constraint function_gifting_rules_target_group_check18
      check (target_gender in ('All', 'Adults', 'Kids', 'SmallKids', 'OlderKids', 'Seniors', 'Male', 'Female'));
  end if;
end $$;

-- Lets managers change the small-kid age without general update rights on functions
create or replace function public.set_function_small_kid_age(p_function_id uuid, p_age integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_function_manager() then
    raise exception 'Only admins, planners, bride or groom can change this';
  end if;
  update public.functions set small_kid_age = p_age where id = p_function_id;
end;
$$;

grant execute on function public.set_function_small_kid_age(uuid, integer) to authenticated;
