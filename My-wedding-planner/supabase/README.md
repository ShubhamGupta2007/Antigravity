# Database scripts

The app's database lives in Supabase. Scripts 01–06 were run by hand earlier and are not stored
here. Run the scripts below **once each, in order**, in the Supabase SQL editor
(Dashboard → SQL Editor → New query → paste → Run). Every script is safe to re-run.

| Script | Adds |
|---|---|
| `07_function_planning.sql` | per-function headcounts, lifafa exceptions, box counts, schedule (timed parts), budget sync |
| `08_function_rituals.sql` | rituals and who gives what to whom |
| `09_data_integrity.sql` | removes duplicate invites and prevents new ones; locks down `exec_sql`; only admins change a family's side |
| `10_rsvp.sql` | RSVP status (invited / confirmed / declined) per family per function |
| `11_shagun_received.sql` | shagun / gifts received from guests, per function (hosts only) |
| `12_ritual_budget.sql` | ritual items' estimated cost as an auto "Ritual items" budget line |
| `13_tasks_links.sql` | tasks linked to functions; every due payment becomes a task (kept in step automatically) |
| `14_guest_invitations.sql` | personal guest invitations: invite link per family, phone check, guest-facing function details, RSVP from the invitation |
| `15_ritual_activities.sql` | ritual entries can be something done (tilak, chunni chadhana), not only something given |
| `16_gifts.sql` | gift types (lifafa, bhaji, gift item, return gift), prices per circle and per family, gifts for chosen people, and the Give & track checklist |

Deploy the app code only after the scripts it needs have been run; the pages show a
"Database update needed" message otherwise.
