# Progress Log & Handover Document

**Project Status:** Mid-Development
**Last Updated:** 2026-11-05

## Architecture & State Summary
We are building a Next.js (App Router) + Supabase application for wedding planning.
- **Side Separation:** The core tenet is strict separation between Groom (Ladkewale) and Bride (Ladkiwale) data.
- **Auth:** We are using Supabase Auth. The initial spec asked for Phone OTP, but we implemented Email Magic Link and Password-based Auth due to rate limit constraints (using Gmail SMTP). 
- **Important DB Schema:** We use a PostgreSQL trigger `handle_new_user()` to automatically insert a row in `public.users` when a new user signs up in `auth.users`, preserving their `side` and `role` ('regular' or 'admin').

## Completed Phases & Tasks

### ✅ Phase 0 — Foundation
- [x] Phase 0.1 — Repo + Supabase project setup
- [x] Phase 0.2 — Core schema migration (`families`, `users`, etc. executed via SQL)
- [x] Phase 0.3 — Auth (Email Magic Link + Password working via `/auth/callback`)
- [x] Phase 0.4 — Home shell (Countdown flip-clock + Feature grid built and styled)

### ✅ Phase 1 — Guest List Management (Complete)
- [x] Phase 1.1 — Add Family form (`/guests/add-family` UI & DB insert)
- [x] Phase 1.2 — Add Member form (`/guests/[familyId]/add-member` UI & DB insert)
- [x] Phase 1.3 — Guest List dashboard (`/guests` UI grouping families by side)
- [x] Phase 1.4 — RLS policies for Guest data (Strict Postgres Row-Level Security on `families` and `family_members` applied)
- [x] Phase 1.5 — Split expected counts into expected_adults_count and expected_kids_count
- [x] Phase 1.6 — Redesign Add Family with pill selects, dynamic pre-fills, and "Add Another" bulk mode
- [x] Phase 1.7 — Add real-time duplicate checks and "Delete Family Card" clean-up actions
- [x] Phase 1.8 — Implement Groom/Bride side tabs and spreadsheet-style Table View switcher (default density layout)

### ✅ Phase 2 — Budget Management (Complete)
- [x] Phase 2.1 — Category setup (Seed script `seed_categories.mjs` created, UI built at `/budget/setup`)
- [x] Phase 2.2 — Add Expense form (`/budget/add` UI & `expenses` DB insert)
- [x] Phase 2.3 — Budget Dashboard (`/budget` UI with Rangoli dial and progress bars)
- [x] Phase 2.4 — Combined/Master view: Admin toggle to view Groom, Bride, and Combined budgets.
- [x] Phase 2.5 — Edit history: SQL trigger logging updates to `expense_edit_history` and modifications log panel.
- [x] Phase 2.6 — Per-person Budget permissions: Toggles on setup page to grant budget view rights.

### ✅ Phase 3 — Functions Management (Complete)
- [x] Phase 3.1 — Add Function form (`/functions/add` UI & DB insert)
- [x] Phase 3.2 — Function Dashboard (`/functions` list view with live attendee counts)
- [x] Phase 3.3 — Function attendance tagging: Invite checklist sub-page at `/functions/[id]/manage`
- [x] Phase 3.4 — Required Guests: Indicators (Confirmed vs Missing) and warning alert banners.
- [x] Phase 3.5 — Activate Function linking on Expense form: Dropdown added, auto-derives splits (50/50 for joint).
- [x] Phase 3.6 — Function-level access control: Filtering by side and joint scope.

### ✅ Phase 3b — Function Planning (2026-11-05)
- [x] Per-function headcounts: adults/kids per family per function (Manage Invites + family's Manage Functions page). Blank = family's usual counts.
- [x] Shared headcount/gifting maths in `src/lib/functionPlanning.ts` used by every functions screen.
- [x] Lifafa rules: starter presets (₹1100 close circle / ₹500 extended / ₹250 kids), per-function kid age, per-family lifafa exceptions. Planners can edit.
- [x] Planned gifting saved on the function and mirrored into the linked budget category as an auto "Lifafas & Gifts" sub-budget.
- [x] Function schedule: timed parts (Baraat, Milni, Pheras...) per function; Timeline view on `/functions` grouped by day with overlap warnings.
- [x] Rituals per function (Tilak, Milni, Ring Exchange...): items given, by which side/person, to which side/person, qty, est. cost, status (to arrange / arranged / given).
- [x] Per-family gift quantities (e.g. bhaji boxes × price) on Manage Invites, counted in planned gifting and the budget.
- [x] RSVP per family per function (invited / confirmed / declined); declined families are not counted.
- [x] Shagun received tracker per function (hosts only).
- [x] Ritual item costs flow into the budget as an auto "Ritual items" line.
- [x] Ritual Checklist across all functions (`/functions/checklist`) and a printable / WhatsApp Day Sheet per function.
- [x] Adult / Kid one-tap toggle on members (imports default everyone to adult).
- [x] `notebook-photo-import` skill + `tools/notebook-import.mts`: update the app from photos of the family's notebook.
- [x] Tasks linked to functions (Tasks filter, function page section); every due payment becomes a task automatically (13).
- **Database scripts:** run `supabase/07` → `13` in order (see `supabase/README.md`) before deploying this code.

### ✅ Phase 4 — Tasks & Todo (Partially Complete)
- [x] Phase 4.1 — Add Task form (`/tasks/add` UI)
- [x] Phase 4.2 — Tasks Dashboard (`/tasks` split Ladkewale/Ladkiwale list with toggleable checkboxes)

## 🚧 Next Up / Pending Work
If you are picking up this project, here is exactly what needs to happen next:

0. **Run database scripts 07–14** in the Supabase SQL editor (see `supabase/README.md`), then test `dev`.
   - 07 is done on the live database (2026-11-06, after the enum fix in `28324f0`); 08–14 next.
   - Export the current Supabase schema (01–06 were run by hand and are not in the repo) into `supabase/`.
   - Rooms per night (rooms are stored once per family today).
   - Remaining lint: ~50 loose `any` types and unused locals in older pages.

1. **Phase 4 - Tasks Completion**: done. Tasks link to functions, and due payments become tasks (13).
2. **Phase 5+ (Bookings, Gifts, Rooms)**:
   - Begin implementing the `bookings`, `lifafas`/`dabbas` (Gifts), and `rooms` tables per the SQL schema in the build spec.

## 💡 Future ideas (not started)
- **Wardrobe planner**: outfits per person per function (who wears what, colour coordination with each function's dress code, tailoring/trial dates, status). Reference for the look and catalogue feel: https://weddingwardrobe.store/ (noted by the user on 2026-11-06; nothing built yet).

## Decisions & Deviations Log
- (2026-07-11) Switched from Phone OTP to Email Magic Link + Password due to rate limits.
- (2026-07-11) Adjusted `/auth/callback` in `middleware.ts` to prevent premature redirects to `/login` during the Magic Link PKCE flow.
- (2026-07-11) Replaced RangoliDial with a standard flip-clock style Countdown for better readability on desktop.
- (2026-07-11) Made Add Family/Add Member buttons conditionally render based on the user's role and side on the frontend, pending full backend RLS enforcement.
- (2026-07-11) Used native checkboxes in `ManageInvitesClient.tsx` to bypass missing shadcn dependencies and maintain reliability.
- (2026-07-11) Implemented automatic 50/50 expense splits for joint functions added through the Add Expense page.
- (2026-07-11) Restructured budget setup permissions list with search filter and vertical scroll bounds to handle multiple signups dynamically, and made toggles green/active for better visual contrast. Added automatic reversion and error feedback on DB permission toggling failure.
- (2026-07-11) Added inline custom category creation form to `/budget/setup` to let families add custom categories directly without database SQL or terminal intervention.
- (2026-07-11) Kept the budget setup save button ("Save & Exit") enabled at all times so that admins can easily save permissions and navigate back even if no categories are seeded yet.
- (2026-07-11) Cleaned up budget dashboard header by replacing confusing icon-only buttons with labeled text buttons (e.g. "Setup" and "Log Expense") and hiding them entirely when the budget is empty to prioritize a single descriptive setup card.
- (2026-07-11) Implemented unified interactive slider-based budget cards on `/budget/setup` synced with numeric inputs, live unallocated limits warnings, and delete triggers.
- (2026-07-11) Added category description notes column to database and setup cards UI to hold descriptive text details for categories.
- (2026-07-11) Built the visual color-coded horizontal stacked progress allocation strip ("Where the money goes") on `/budget` planner tab.
- (2026-07-11) Setup separate `/budget/settings` page to manage visibility permissions.
- (2026-07-11) Created database trigger function to automatically synchronize new calendar functions to matching budget category chunks.
- (2026-07-18) Built comprehensive Selection Stats ("Invited Guests Overview") panel for the Function Invites page mimicking the Guest List dashboard.
- (2026-07-18) Implemented advanced Relationship and Tier filters in Manage Invites page.
- (2026-07-18) Resolved atomic database deletion constraints on Budget Categories, displaying graceful toast errors when attempting to delete categories with active expenses.
- (2026-07-18) Integrated `sonner` for global popup toast notifications.
- (2026-07-18) Added dynamic unallocated budget usage calculator to `/functions/add` and explicit "Events vs Categories" UI guidance banners on `/budget/setup`.
- (2026-07-19) Implemented Family-level Room tracking logic inside `ManageInvitesClient.tsx` with dedicated database columns and real-time floating save banners.
- (2026-07-19) Resolved `function_gifting_rules` check constraints to properly handle gender/age target groupings in the database layer.
- (2026-07-19) Refined Auto-Invite helpers with interactive `window.confirm` dialogues and toggle functionality.
- (2026-11-05) "Adults" in gifting rules now includes seniors (Adults and Kids are complementary); "Seniors" is a 60+ subset for extra rules.
- (2026-11-05) Auto-managed sub-budgets (`category_sub_items.is_auto`) are read-only in Budget Setup and Edit Allocation and are skipped by Setup's clear-and-reinsert save.
- (2026-11-05) function_attendance uniqueness is now NULLS NOT DISTINCT (09), so whole-family invites can't be duplicated.
- (2026-11-05) A function's budget on its page comes from the linked Budget Setup category; functions.max_budget is only a fallback.
- (2026-11-05) Budget Setup saves sub-budgets in place (keeps ids) so expense links survive.
