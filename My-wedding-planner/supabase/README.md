# Database scripts

The app's database lives in Supabase. Scripts 01–06 were run by hand earlier and are not stored
here. Run the scripts below **once each, in order**, in the Supabase SQL editor
(Dashboard → SQL Editor → New query → paste → Run). Every script is safe to re-run.

| Script | Adds |
|---|---|
| `07_function_planning.sql` | per-function headcounts, lifafa exceptions, box counts, schedule (timed parts), budget sync |
| `08_function_rituals.sql` | rituals and who gives what to whom |
| `09_data_integrity.sql` | removes duplicate invites and prevents new ones; locks down `exec_sql`; only admins change a family's side |

Deploy the app code only after the scripts it needs have been run; the pages show a
"Database update needed" message otherwise.
