-- 17_lifafa_per_person.sql
-- A family's lifafa exception can be set person by person ("Dadi ji ₹2,100, the rest as usual").
-- breakdown holds only the amounts that were changed, keyed by member id, or 'family' (one lifafa
-- for the whole family) or 'others' (guests counted but not named). lifafa_amount stays the total.
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table public.function_gift_overrides
  add column if not exists breakdown jsonb;
