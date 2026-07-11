# Progress Log & Handover Document

**Project Status:** Mid-Development
**Last Updated:** 2026-07-11

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

### ✅ Phase 2 — Budget Management (Partially Complete)
- [x] Phase 2.1 — Category setup (Seed script `seed_categories.mjs` created, UI built at `/budget/setup`)
  - *Note: Manual SQL run is needed to bypass RLS for seeding categories.*
- [x] Phase 2.2 — Add Expense form (`/budget/add` UI & `expenses` DB insert)
- [x] Phase 2.3 — Budget Dashboard (`/budget` UI with Rangoli dial and progress bars)
- [ ] **Phase 2.4 — Combined/Master view (PENDING)**: Admin toggle to view both sides' budgets.
- [ ] **Phase 2.5 — Edit history (PENDING)**: Trigger + UI for expense audit logs.
- [ ] **Phase 2.6 — Per-person Budget permissions (PENDING)**: Specific access grants.

### ✅ Phase 3 — Functions Management (Partially Complete)
- [x] Phase 3.1 — Add Function form (`/functions/add` UI & DB insert)
- [x] Phase 3.2 — Function Dashboard (`/functions` list view)
- [x] Phase 3.3 — Function attendance tagging (Placeholder UI at `/functions/[id]`)
- [ ] **Phase 3.4 — Required Guests (PENDING)**
- [x] Phase 3.5 — Activate Function linking on Expense form (`?function_id=...` added to Add Expense)
- [ ] **Phase 3.6 — Function-level access control (PENDING)**: RLS hiding other side's non-joint functions.

### ✅ Phase 4 — Tasks & Todo (Partially Complete)
- [x] Phase 4.1 — Add Task form (`/tasks/add` UI)
- [x] Phase 4.2 — Tasks Dashboard (`/tasks` split Ladkewale/Ladkiwale list with toggleable checkboxes)

## 🚧 Next Up / Pending Work
If you are picking up this project, here is exactly what needs to happen next:

1. **Security & RLS (Phase 1.4 & 3.6)**: 
   - Apply proper Supabase RLS policies across all tables (`families`, `family_members`, `functions`, `tasks`, `expenses`) to restrict read/write access based on the user's `side` and `role` in `public.users`.
2. **Finish Phase 2 & 3 Features**:
   - Implement the Combined/Master view for Admins.
   - Implement Function Attendance Tagging and Required Guests.
3. **Phase 5+ (Bookings, Gifts, Rooms)**:
   - Begin implementing the `bookings`, `lifafas`/`dabbas` (Gifts), and `rooms` tables per the SQL schema in the build spec.

## Decisions & Deviations Log
- (2026-07-11) Switched from Phone OTP to Email Magic Link + Password due to rate limits.
- (2026-07-11) Adjusted `/auth/callback` in `middleware.ts` to prevent premature redirects to `/login` during the Magic Link PKCE flow.
- (2026-07-11) Replaced RangoliDial with a standard flip-clock style Countdown for better readability on desktop.
- (2026-07-11) Made Add Family/Add Member buttons conditionally render based on the user's role and side on the frontend, pending full backend RLS enforcement.
