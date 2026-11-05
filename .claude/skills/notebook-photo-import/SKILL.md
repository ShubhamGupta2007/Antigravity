---
name: notebook-photo-import
description: Update the wedding planner from photos of the family's handwritten notebook. Use whenever the user shares one or more photos (or pasted text) of lists — guest lists, families and members, who is coming to which function and how many, lifafa / shagun amounts, bhaji boxes or other gift items with prices — with or without saying what they are. Works out what each page is and which data it changes, transcribes and cross-checks totals, matches existing families so nothing is duplicated, shows a dry run, and writes only after the user confirms.
---

# Notebook photo import

The family plans on paper and shares photos. The user may send several pages at once, of different
kinds, and may or may not say what they are ("this is the engagement list", "these are the box
counts"). Your job: work out what each page is, turn it into the right changes in the app, and
apply them safely.

All database reads and writes go through the import tool; never write to Supabase any other way.
It only writes with `--commit`.

```bash
cd My-wedding-planner
T="node --experimental-strip-types --no-warnings tools/notebook-import.mts"
$T functions | snapshot [--function <id>] | match --file <labels.json> | apply --plan <plan.json> --as <email> [--commit]
```

Keep labels, snapshots and plans in your scratchpad, never in the repo.

## 0. Preconditions (once per session)

1. `My-wedding-planner/node_modules` exists (else `npm ci`).
2. Connection: `SUPABASE_URL` (project URL, e.g. `https://abcd.supabase.co`) and the project's
   **secret** key (`sb_secret_...`, Supabase → Project Settings → API Keys).
   - Laptop: `SUPABASE_URL=` and `SUPABASE_SECRET_KEY=` in `My-wedding-planner/.env.local` (git-ignored).
   - Claude cloud session: if `SUPABASE_URL` is unset, ask the user for the project URL and pass
     `--url`. For the key, use the credential tool for host `<project>.supabase.co`, header `apikey`,
     no prefix; the tool sends a placeholder the proxy replaces. Never ask for the key in chat.
3. `supabase/07_function_planning.sql` has been run (the tool says so if not).

You can read and transcribe photos before the connection is ready; you only need it from step 3.

## 1. Work out what each page is

Look at every photo first, then group them. Use the user's words when given; otherwise infer from
the title, date and columns. Kinds of page:

| Page shows | It changes | Needs a function? |
|---|---|---|
| Names of households and people, no function | families + their members | no |
| A function name/date with names and member counts | invites + headcount per family at that function (and families/members) | yes |
| Amounts per family (₹ column, "lifafa", "shagun") | lifafa amount per family at the function | yes |
| Boxes / items per family ("bhaji box", "mithai", "kambal") and/or an item price | a priced gift item on the function + quantity per family | yes |
| One page with several of these columns | all of the above in one plan | yes |

Pages that continue the same list (numbering carries on, totals at the end) are one list. Different
functions are separate plans, applied one at a time.

If a page is something this tool cannot store (expenses, vendor bills, rituals, tasks, menus),
say so plainly, list what it contains, and leave it out. Do not force it into guest data.

Map columns using `notebook-conventions.md` (next to this file). Anything not covered there: ask.

## 2. Transcribe and cross-check

For each list, read every line into a table: number, label exactly as written, and every column
(members, amount, boxes...), plus marks such as "+ Ex." or "2700 + 2200".

- Each line with its own count or amount is its own household, even an un-numbered sub-line
  under a numbered entry.
- Handwritten values often sit a little below their name. Line them up by counting: the number of
  values in a column must equal the number of rows that have one.
- **Cross-check totals**: sum each column and compare with totals written on the page. Report
  every mismatch, and which rows you are unsure of. Never guess silently.
- People: split the label into named members ("Akshat – Mitali, Aadhya" → Akshat, Mitali, Aadhya).
  Unnamed extras ("+ 2 children", "Chandan + 1") are counted in the headcount but not created as
  members. Mark a member as a kid only when the page says so; **everyone else is an adult by
  default** (the family can change kids later in the app).
- If a list has no member counts, the headcount is the number of named people.

Show the user each list as a table with the totals check, then ask, in one message, only what you
cannot infer: which function (offer the likely one from `functions`), which side and circle (tier)
new families belong to, what an amount column means, an item's price if it is not written, unclear
abbreviations. Record every confirmed answer in `notebook-conventions.md`.

## 3. Check against the database

```bash
$T snapshot --function <id> > <scratch>/snapshot.json     # or without --function for a families-only list
$T match --file <scratch>/labels.json                     # labels.json: JSON array of the row labels
```

For each row:
- **Existing family** (same household, even if spelled differently): use its `family_id`.
  Score 1 means every meaningful word matched; still check members/city agree. Lower scores need
  the user's confirmation; ask about all uncertain matches together in one question.
- **New family**: only when no existing family is that household. Family names are unique in the
  app (case-insensitive). Keep the notebook's wording, expand place abbreviations in brackets:
  `Chachi ji (Meerut)`. Groups like "Shubham's friends" are one family: `Shubham's Friends`.
- From `snapshot.invites`, call out anything this import would change: an existing headcount, a
  lifafa amount or a gift quantity that differs from the photo.

## 4. Build the plan

`<scratch>/plan.json` (one per function, or one without `function_id` for families only):

```json
{
  "source": "Ring Ceremony list, 2 pages",
  "function_id": "<id or omit for a families-only list>",
  "gift_items": [{ "name": "Bhaji box", "type": "return_gift", "unit_price": 450 }],
  "rows": [
    { "label": "Sunita di, Jija ji", "family_id": "<existing id>",
      "members": ["Sunita", "Jija ji"], "adults": 2, "kids": 0,
      "lifafa_amount": 2200, "gifts": { "Bhaji box": 1 } },
    { "label": "Gaurav, Gudiya + 2 children",
      "new_family": { "family_name": "Gaurav & Gudiya", "side": "groom", "relation_tier": "tier_2",
                      "city": "Meerut", "is_local": false },
      "members": ["Gaurav", "Gudiya"], "adults": 2, "kids": 2,
      "lifafa_amount": 3200, "gifts": { "Bhaji box": 1 }, "note": "2700 + 500 Ex." }
  ]
}
```

- `members`: named people; ones not already in that family are added (adult unless
  `{ "name": "...", "kid": true }`). Existing members are never changed or removed.
- `adults` / `kids`: the headcount at this function (required with a function).
- `lifafa_amount`: from the amount column; omit or null to leave an existing amount alone.
  "2700 + 2200" → 4900 and say so in `note`.
- `gift_items`: each priced item on the page. A new item needs `unit_price`; an existing one
  (same name on this function) keeps its price unless you pass a new one. `gifts` gives each
  family's quantity; a blank box column for a family is `0`, not omitted.
- `new_family.expected_*` default to the row's headcount; set them only if the page says otherwise.

## 5. Dry run, confirm, commit

```bash
$T apply --plan <scratch>/plan.json --as <user's app email>
```

It validates the plan (PLAN REJECTED → fix and re-run) and prints: gift items to create or
re-price, per row the family to create, members to add, invite/headcount, lifafa and gift
quantities, plus ⚠ warnings (existing amount changed, side mismatch, partial invite becoming
whole-family, other invited families that will get an item by default) and ℹ notices.

Tell the user, briefly: new families, members added, invites and amounts set, and every ⚠ line
verbatim. Get an explicit yes for this plan. Then run the same command with `--commit`. It writes,
re-syncs planned lifafas and gifts into the function's budget line ("Lifafas & Gifts"), re-reads
the database and verifies each row. Report the verify line and the function's new totals next to
the notebook's totals.

If it stops part way, fix the cause and re-run the same plan: finished rows show "no change", and
families it already created are reused.

## Rules

- Never delete anything; never change families, members or invites that are not on the pages.
- Never write without the user's explicit yes to the dry run, in this conversation, for this plan.
- Never invent a name, count, amount or price you could not read; list unread rows instead.
- Do not commit plans or snapshots. Do commit updates to `notebook-conventions.md`.
