-- 15_ritual_activities.sql
-- A ritual entry can be something GIVEN (lifafa, bhaji box, ring) or something DONE
-- (tilak by the bride's brother, chunni chadhana by the groom's mother, milni hugs).
-- Activities have no quantity or cost and stay off the shopping checklist.
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table public.ritual_items
  add column if not exists kind text not null default 'gift';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ritual_items_kind_check') then
    alter table public.ritual_items add constraint ritual_items_kind_check check (kind in ('gift', 'activity'));
  end if;
end $$;
