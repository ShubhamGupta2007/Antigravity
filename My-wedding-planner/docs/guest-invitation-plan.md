# Guest invitation: plan

A personal, animated wedding invitation that each family opens from a private link (WhatsApp),
showing only the functions they are invited to, and letting them RSVP per function. Replies go
straight into the planner (headcounts, lifafas, gift counts, rooms).

Mock (clickable, phone-sized): https://claude.ai/artifact/BDpuU9FwgiPxwTx32KA758

## Principles

- **No sign-up for guests.** Relatives open a link and are in.
- **Only their functions.** The server sends a family only the functions they are invited to;
  nothing is hidden in the browser after loading (avoids the common "guests can see private
  events" leak on wedding sites).
- **No numbers that feel like limits.** We never show "invited for 4 adults & 2 children" or
  "3 of 5 functions".
- **Replies are data, not messages.** RSVP writes RSVP status and headcount per function into the
  planner; nobody re-types replies.
- **Very visual from the first second.** Envelope with wax seal that opens, slowly turning
  mandalas, falling marigold petals, gold-foil names, staggered entrances, sections that rise
  into view on scroll. Respects "reduce motion".

## Identity: making sure it is the right family

1. **Each family gets its own link** `/invite/<code>` with a long random code tied to its row in
   the guest list. We never look families up by name, so two families called "Sharma" (or two
   people with the same name) are never confused.
2. **One-time check on a new phone:** if we have a mobile number for the family, the first visit
   asks for its last 4 digits. A forwarded link does not work for someone else. Repeated wrong
   tries lock the link for a while.
3. **Number changed / wrong family?** The screen shows who to call; we send the right link.

## Guest screens

1. **Envelope**: "॥ श्री गणेशाय नमः ॥", "With love, for The Sharma Family", wax seal to tap; the
   flap opens and the card slides out; then *Enter*.
2. **Quick check** (only first visit on a phone, only if we have their number).
3. **Invitation**: full-screen hero (names, date, city), personal "Dear Sharma Family" note,
   couple photo, **Celebrate with us** (only their functions: date, time, venue, dress colours,
   their reply status, *Details & map*), *Will you join us?* reply band, **Your stay** (only for
   families with rooms), our story photos, both families, Good to know, footer.
4. **RSVP** – picked automatically per family:
   - **4a, we know their names:** tap the names of who is coming to each function, *Everyone*,
     *Can't make it*, **+ Add someone** (added names come to the planner as "added by guest" for
     approval). A gentle total: "4 guests · 1 child" / "We'll miss you".
   - **4b, we don't know their names:** "How many from your family?" tap **1 … 8+**, then "Any
     children among them?" **None · 1 · 2 · 3+**; optional names for place cards.
   - Optional note and "Arriving by" (station pickup). Can be changed until the RSVP deadline.
5. **Function detail**: when to arrive (the function's timed parts), venue with *Open in Maps* and
   *Add to calendar*, what to wear (colour swatches), their reply.

## Data

- `families.invite_code` (random, unique), lock-out counters for the phone check.
- `family_members.added_by_guest` / `pending_approval` for names guests add.
- Guest-facing function details: venue name, address, map link, dress code + colours, a short note.
- `function_attendance`: RSVP status and adults/kids counts per family per function (existing),
  plus which named members are coming (member rows, existing).
- `invitation_responses`: every reply submitted (history, note, travel details).
- `wedding_settings`: couple's names, wedding date and city, RSVP deadline, contact for travel,
  both families' names, greeting text.
- All guest reads/writes go through two database functions that accept the invite code (and the
  phone check): `get_invitation` and `submit_invitation_rsvp`. Guests never get table access.

## Planner side

- Guest list: **Copy invite link** and **Share on WhatsApp** per family; RSVP status at a glance.
- Function page: guest-facing details (venue, map, dress code); who replied / who to chase.
- Approve names guests added.
- Settings: wedding details used on every invitation.
- Photos: upload yours; they replace the placeholders (couple portrait, story, venue).

## Build order (separate pushes)

1. This plan.
2. Database: `supabase/14_guest_invitations.sql`.
3. Guest pages at `/invite/[code]`: envelope, check, invitation, RSVP (4a/4b), function detail.
4. Planner tools: invite links + WhatsApp share, guest-facing function details, wedding settings,
   RSVP overview, approving added names.
5. Photos (after the family shares them).
