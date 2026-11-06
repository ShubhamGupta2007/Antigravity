-- 19_estimated_guests.sql
-- Big functions (Mata ki Chowki, a jagran, a reception) often have guests who aren't on the
-- guest list. A function can carry an estimate of them, added to its expected headcount
-- (not to lifafas, which go to named families).
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table public.functions
  add column if not exists estimated_adults integer not null default 0,
  add column if not exists estimated_kids integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'functions_estimated_guests_check') then
    alter table public.functions add constraint functions_estimated_guests_check
      check (estimated_adults >= 0 and estimated_kids >= 0);
  end if;
end $$;
