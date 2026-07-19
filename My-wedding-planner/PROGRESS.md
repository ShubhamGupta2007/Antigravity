# Progress Log & Handover Document

**Project Status:** Mid-Development
**Last Updated:** 2026-07-18

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

### ✅ Phase 4 — Tasks & Todo (Partially Complete)
- [x] Phase 4.1 — Add Task form (`/tasks/add` UI)
- [x] Phase 4.2 — Tasks Dashboard (`/tasks` split Ladkewale/Ladkiwale list with toggleable checkboxes)

## 🚧 Next Up / Pending Work
If you are picking up this project, here is exactly what needs to happen next:

1. **Phase 4 - Tasks Completion**:
   - Link tasks to functions/budgets as needed.
2. **Phase 5+ (Bookings, Gifts, Rooms)**:
   - Begin implementing the `bookings`, `lifafas`/`dabbas` (Gifts), and `rooms` tables per the SQL schema in the build spec.

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
