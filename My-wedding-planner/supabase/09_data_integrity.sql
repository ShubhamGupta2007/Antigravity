-- 09_data_integrity.sql
-- Run once in the Supabase SQL editor (after 07 and 08). Safe to re-run.
--
-- 1. Removes duplicate invite rows and stops new ones (a family invited twice to
--    the same function was counted twice in headcounts and lifafas).
-- 2. Locks down the old `exec_sql` debug function, if it exists.
-- 3. Only admins can change which side a family is on (the app already hides
--    the control; this enforces it in the database too).

-- ---------------------------------------------------------------------------
-- 1. Duplicate function_attendance rows
-- ---------------------------------------------------------------------------
-- See what will be removed first, if you like:
--   select function_id, family_id, member_id, count(*)
--   from function_attendance
--   group by 1, 2, 3 having count(*) > 1;

-- Keep one row per (function, family, member), preferring one with a headcount set.
with ranked as (
  select id,
         row_number() over (
           partition by function_id, family_id, member_id
           order by (adults_count is not null or kids_count is not null) desc, id
         ) as rn
  from public.function_attendance
)
delete from public.function_attendance fa
using ranked
where fa.id = ranked.id and ranked.rn > 1;

-- Replace the existing unique rule with one that also treats two whole-family
-- rows (member_id = null) as duplicates.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    where con.conrelid = 'public.function_attendance'::regclass
      and con.contype = 'u'
      and con.conname <> 'function_attendance_one_row_per_member'
  loop
    execute format('alter table public.function_attendance drop constraint %I', c.conname);
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.function_attendance'::regclass
      and conname = 'function_attendance_one_row_per_member'
  ) then
    alter table public.function_attendance
      add constraint function_attendance_one_row_per_member
      unique nulls not distinct (function_id, family_id, member_id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. exec_sql debug function: nobody signed in (or anonymous) may call it
-- ---------------------------------------------------------------------------
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'exec_sql'
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    raise notice 'Locked down %', f.sig;
  end loop;
end $$;
-- If nothing else uses it, you can remove it entirely:
--   drop function if exists public.exec_sql(text);

-- ---------------------------------------------------------------------------
-- 3. Only admins can change a family's side
-- ---------------------------------------------------------------------------
create or replace function public.guard_family_side()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- auth.uid() is null for the server secret key (imports, maintenance): allowed.
  if new.side is distinct from old.side and auth.uid() is not null then
    if not exists (select 1 from public.users where id = auth.uid() and role::text = 'admin') then
      raise exception 'Only an admin can change which side a family is on';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists families_guard_side on public.families;
create trigger families_guard_side
  before update of side on public.families
  for each row execute function public.guard_family_side();
