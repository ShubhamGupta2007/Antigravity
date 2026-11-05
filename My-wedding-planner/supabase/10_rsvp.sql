-- 10_rsvp.sql
-- RSVP status per family per function (on the whole-family invite row).
-- 'invited' (default) and 'confirmed' count towards headcounts and lifafas;
-- 'declined' does not. Run once in the Supabase SQL editor. Safe to re-run.

alter table public.function_attendance
  add column if not exists rsvp_status text not null default 'invited';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'function_attendance_rsvp_status_check') then
    alter table public.function_attendance
      add constraint function_attendance_rsvp_status_check
      check (rsvp_status in ('invited', 'confirmed', 'declined'));
  end if;
end $$;
