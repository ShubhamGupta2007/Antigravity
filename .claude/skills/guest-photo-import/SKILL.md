---
name: guest-photo-import
description: Import a function's guest list from photos of a handwritten notebook page (family names, member counts, lifafa amounts, boxes) into the wedding planner's Supabase database. Use when the user shares photos of a guest list, lifafa / shagun list or "bhaji box" list and wants the app updated. Transcribes, cross-checks totals, matches against existing families to avoid duplicates, shows a dry run, and only writes after the user confirms.
---

# Guest list photo import

The family keeps guest lists in a notebook and shares photos. This skill turns those photos into
invites on a function in the app (headcount per family + lifafa amount), without creating
duplicate families or silently overwriting amounts that are already in the app.

All database work goes through `My-wedding-planner/tools/guest-import.mts`. Never write to
Supabase any other way. The script only writes with `--commit`.

```bash
cd My-wedding-planner
node --experimental-strip-types tools/guest-import.mts <functions|snapshot|match|apply> ...
```

Keep working files (labels, plan) in your scratchpad, never in the repo.

## 0. Preconditions (check once per session)

1. `node_modules` exists in `My-wedding-planner/` (else `npm ci`).
2. Connection: the script needs `SUPABASE_URL` (the project URL, e.g. `https://abcd.supabase.co`)
   and the project's **secret** key (`sb_secret_...`, Supabase → Project Settings → API Keys).
   - On a laptop: put `SUPABASE_URL=` and `SUPABASE_SECRET_KEY=` in `My-wedding-planner/.env.local`
     (git-ignored).
   - In a Claude cloud session: if `SUPABASE_URL` is not set, ask the user for the project URL and
     pass it with `--url`. For the key, use the credential tool for host `<project>.supabase.co`
     with header `apikey` (no prefix); the script then sends a placeholder that the proxy replaces.
     Never ask the user to paste the key into chat.
3. `supabase/07_function_planning.sql` has been run. If `snapshot` fails with a missing
   column/table error, stop and tell the user to run it.

## 1. Transcribe the photos

Read every line on every page into a table: notebook number, label exactly as written, members,
boxes, amount, and any marks (e.g. "+ Ex.", "2700 + 2200").

- Each line that has its own count or amount is its own household row, even if it is an
  un-numbered sub-line under a numbered entry (e.g. "Akshat – Mitali, Aadhya" under "Pinki di").
- Handwritten amounts often sit slightly below their name. Line them up by counting: the number of
  amounts must equal the number of rows that have one.
- **Cross-check totals.** Sum members, boxes and amounts and compare with any totals written on the
  page. Report each mismatch and which rows you are unsure about. Do not guess silently.
- Expand abbreviations using `notebook-conventions.md` (next to this file). Unknown ones: ask.

Show the user the full table (it is what they will check against the notebook) with the totals
comparison, and ask only what you cannot infer, usually:
- which function this is (run `functions` and offer the likely match by name/date),
- which side these guests are on, and which circle (tier) new families belong to,
- what the amount column means (lifafa given to them, or shagun received) if not in the conventions,
- unclear abbreviations or marks.

Record every confirmed answer in `notebook-conventions.md` so it is not asked again.

## 2. Check against the database

```bash
node --experimental-strip-types tools/guest-import.mts snapshot --function <id> > <scratch>/snapshot.json
# labels.json = JSON array of the row labels
node --experimental-strip-types tools/guest-import.mts match --function <id> --file <scratch>/labels.json
```

For each row decide:
- **Existing family** (same household already in the app, even if spelled differently):
  use its `family_id`. A candidate with score 1 is an exact name match. Partial matches
  ("Sunita di" vs "Sunita & Jija ji Family") need the user's confirmation; list them together in
  one question rather than one at a time.
- **New family**: only when no existing family is that household. The app treats family names as
  unique (case-insensitive), so pick a name that does not collide: keep the notebook's wording,
  expand place abbreviations in brackets, e.g. `Chachi ji (Meerut)`.
- Note anything already in the app for this function from `snapshot.invites`: existing headcounts
  and existing lifafa amounts that differ from the photo must be called out to the user.

## 3. Build the plan

Write `<scratch>/plan.json`:

```json
{
  "function_id": "<id>",
  "source": "Ring Ceremony notebook, 2 pages",
  "rows": [
    { "label": "Sunita di, Jija ji", "family_id": "<existing id>", "adults": 2, "kids": 0,
      "lifafa_amount": 2200, "note": "Bhaji box: 1" },
    { "label": "Chachi ji (Mrt.)",
      "new_family": { "family_name": "Chachi ji (Meerut)", "side": "groom", "relation_tier": "tier_2",
                      "city": "Meerut", "is_local": false, "expected_adults_count": 1, "expected_kids_count": 0 },
      "adults": 1, "kids": 0, "lifafa_amount": 2100, "note": "Bhaji box: 1" }
  ]
}
```

- `adults`/`kids`: the members count is adults unless the line says otherwise ("+ 2 children",
  "2 chhote") or the family's members in the app show who is a kid.
- `lifafa_amount`: the amount column (null to leave any existing amount untouched).
  "2700 + 2200" → 4900 and say so in `note`.
- `note`: boxes as `Bhaji box: N`, plus marks like "Ex." with their meaning. Keep it short.
- Groups like "Shubham's friends 10" are one row each, as a family named e.g. `Shubham's Friends`.
- Merge rows that turn out to be the same household; the script rejects duplicates.

## 4. Dry run, confirm, commit

```bash
node --experimental-strip-types tools/guest-import.mts apply --plan <scratch>/plan.json --as <user's app email>
```

The dry run validates the plan and prints, per row: families to create, invites/headcounts to set,
lifafa amounts to set or change, and warnings (side mismatch, partial invite becoming whole-family,
existing amount changed). If it says PLAN REJECTED, fix the plan and run it again.

Show the user a short summary of the dry run: how many new families, how many updates, and every
warning line verbatim. Get an explicit yes. Then:

```bash
node --experimental-strip-types tools/guest-import.mts apply --plan <scratch>/plan.json --as <email> --commit
```

It writes, re-syncs the function's planned gifting into the budget ("Lifafas & Gifts"), and
re-reads the database to verify each row. Report: rows written, the verify line, and the new
function totals next to the notebook totals. If it stopped part way, it is safe to re-run the same
plan; already-written rows show as "no change".

## Rules

- Never delete families, invites or lifafa amounts; never touch families that are not in the photos.
- Never write without the user's explicit confirmation of the dry run in this conversation.
- Never invent a member count or amount you could not read; leave the row out and list it as unread.
- Do not commit plan or snapshot files. Do commit updates to `notebook-conventions.md`.
