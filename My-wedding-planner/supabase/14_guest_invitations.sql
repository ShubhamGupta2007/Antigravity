-- 14_guest_invitations.sql
-- Personal guest invitations: a private link per family, a one-time phone check,
-- only the functions that family is invited to, and RSVP per function written
-- straight into function_attendance. Guests never get table access: everything
-- goes through get_invitation() and submit_invitation_rsvp(), which take the code.
-- Requires 07, 10. Run once in the Supabase SQL editor. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Wedding-wide details shown on every invitation (one row)
-- ---------------------------------------------------------------------------
create table if not exists public.wedding_settings (
  id integer primary key default 1 check (id = 1),
  bride_name text not null default 'Swati',
  groom_name text not null default 'Satyam',
  wedding_date date default '2027-01-19',
  city text,
  rsvp_deadline date,
  greeting text,
  families_line text,
  groom_family_name text,
  bride_family_name text,
  contact_name text,
  contact_phone text,
  story text,
  updated_at timestamptz not null default now()
);
insert into public.wedding_settings (id) values (1) on conflict (id) do nothing;

alter table public.wedding_settings enable row level security;
drop policy if exists "Authenticated can view wedding settings" on public.wedding_settings;
create policy "Authenticated can view wedding settings" on public.wedding_settings
  for select to authenticated using (true);
drop policy if exists "Managers can edit wedding settings" on public.wedding_settings;
create policy "Managers can edit wedding settings" on public.wedding_settings
  for update to authenticated using (public.is_function_manager()) with check (public.is_function_manager());

-- ---------------------------------------------------------------------------
-- Guest-facing details per function
-- ---------------------------------------------------------------------------
alter table public.functions
  add column if not exists venue_name text,
  add column if not exists venue_address text,
  add column if not exists map_url text,
  add column if not exists dress_code text,
  add column if not exists dress_colors text[],
  add column if not exists guest_note text;

-- ---------------------------------------------------------------------------
-- A private invite code per family (+ lock-out for the phone check)
-- ---------------------------------------------------------------------------
alter table public.families
  add column if not exists invite_code text,
  add column if not exists invite_pin_failures integer not null default 0,
  add column if not exists invite_locked_until timestamptz,
  add column if not exists invite_opened_at timestamptz;

-- 16 hex characters from a random UUID: ~60 bits, unguessable
update public.families
   set invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 16)
 where invite_code is null;
alter table public.families
  alter column invite_code set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
create unique index if not exists families_invite_code_key on public.families(invite_code);

-- Names guests add themselves wait for the family's approval in the planner
alter table public.family_members
  add column if not exists added_by_guest boolean not null default false,
  add column if not exists pending_approval boolean not null default false;

alter table public.function_attendance
  add column if not exists responded_at timestamptz;

-- Every reply, kept for history (note, travel details, exactly what was sent)
create table if not exists public.invitation_responses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  submitted_at timestamptz not null default now(),
  payload jsonb not null,
  note text,
  travel text
);
create index if not exists invitation_responses_family_idx on public.invitation_responses(family_id, submitted_at desc);
alter table public.invitation_responses enable row level security;
drop policy if exists "Managers can view invitation responses" on public.invitation_responses;
create policy "Managers can view invitation responses" on public.invitation_responses
  for select to authenticated using (public.is_function_manager());

-- ---------------------------------------------------------------------------
-- Identify the family behind a code, applying the phone check.
-- Returns the family id, or a status: not_found / locked / needs_pin / wrong_pin.
-- ---------------------------------------------------------------------------
create or replace function public._invite_identify(p_code text, p_pin text, out family_id uuid, out status text, out hint text)
language plpgsql
security definer
set search_path = public
as $$
declare
  f record;
  digits text;
begin
  select * into f from public.families where invite_code = p_code;
  if not found or p_code is null or length(p_code) < 8 then
    status := 'not_found'; return;
  end if;
  if f.invite_locked_until is not null and f.invite_locked_until > now() then
    status := 'locked'; return;
  end if;

  digits := regexp_replace(coalesce(f.contact_phone, ''), '\D', '', 'g');
  if length(digits) >= 4 then
    hint := right(digits, 2);
    if p_pin is null or p_pin = '' then
      status := 'needs_pin'; return;
    end if;
    if p_pin <> right(digits, 4) then
      update public.families
         set invite_pin_failures = invite_pin_failures + 1,
             invite_locked_until = case when invite_pin_failures + 1 >= 5 then now() + interval '15 minutes' else invite_locked_until end
       where id = f.id;
      status := case when f.invite_pin_failures + 1 >= 5 then 'locked' else 'wrong_pin' end;
      return;
    end if;
  end if;

  update public.families
     set invite_pin_failures = 0, invite_locked_until = null, invite_opened_at = coalesce(invite_opened_at, now())
   where id = f.id and (invite_pin_failures <> 0 or invite_locked_until is not null or invite_opened_at is null);
  family_id := f.id;
  status := 'ok';
end;
$$;
revoke all on function public._invite_identify(text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- What a family sees: their details, only their functions, their current reply.
-- ---------------------------------------------------------------------------
create or replace function public.get_invitation(p_code text, p_pin text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  who record;
  fam record;
  result jsonb;
begin
  select * into who from public._invite_identify(p_code, p_pin);
  if who.status <> 'ok' then
    return jsonb_build_object(
      'status', who.status,
      'hint', who.hint,
      'family_name', case when who.status in ('needs_pin', 'wrong_pin') then (select family_name from public.families where invite_code = p_code) end,
      'contact', (select jsonb_build_object('name', contact_name, 'phone', contact_phone) from public.wedding_settings where id = 1)
    );
  end if;

  select * into fam from public.families where id = who.family_id;

  select jsonb_build_object(
    'status', 'ok',
    'family', jsonb_build_object(
      'name', fam.family_name,
      'side', fam.side,
      'is_local', fam.is_local,
      'city', fam.city,
      'needs_room', coalesce(fam.needs_room, false),
      'rooms_assigned', fam.rooms_assigned,
      'room_numbers', fam.room_numbers,
      'members', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', m.id,
                 'name', m.name,
                 'is_kid', coalesce(m.is_kid_for_gifting, false) or coalesce(m.age < 12, false),
                 'added_by_guest', m.added_by_guest)
               order by m.added_by_guest, coalesce(m.age, 999) desc, m.name)
          from public.family_members m where m.family_id = fam.id
      ), '[]'::jsonb)
    ),
    'settings', (select to_jsonb(s) - 'id' - 'updated_at' from public.wedding_settings s where s.id = 1),
    'functions', coalesce((
      select jsonb_agg(fn order by (fn->>'event_date'), (fn->>'start_time') nulls last)
        from (
          select jsonb_build_object(
                   'id', f.id,
                   'name', f.name,
                   'event_date', f.event_date,
                   'start_time', f.start_time,
                   'end_time', f.end_time,
                   'location', f.location,
                   'venue_name', f.venue_name,
                   'venue_address', f.venue_address,
                   'map_url', f.map_url,
                   'dress_code', f.dress_code,
                   'dress_colors', f.dress_colors,
                   'guest_note', f.guest_note,
                   'segments', coalesce((
                      select jsonb_agg(jsonb_build_object('name', s.name, 'start_time', s.start_time, 'end_time', s.end_time, 'location', s.location, 'notes', s.notes)
                                       order by s.start_time nulls last, s.sort_order)
                        from public.function_segments s where s.function_id = f.id), '[]'::jsonb),
                   'rsvp', (
                      select jsonb_build_object(
                               'status', fa.rsvp_status,
                               'adults', fa.adults_count,
                               'kids', fa.kids_count,
                               'responded_at', fa.responded_at,
                               'member_ids', coalesce((
                                  select jsonb_agg(ma.member_id) from public.function_attendance ma
                                   where ma.function_id = f.id and ma.family_id = fam.id and ma.member_id is not null), '[]'::jsonb))
                        from public.function_attendance fa
                       where fa.function_id = f.id and fa.family_id = fam.id and fa.member_id is null)
                 ) as fn
            from public.functions f
           where exists (select 1 from public.function_attendance a where a.function_id = f.id and a.family_id = fam.id)
        ) t
    ), '[]'::jsonb),
    -- the most recent note and travel details they gave (a later reply may leave them blank)
    'last_response', (
      select jsonb_build_object(
               'note', (select r.note from public.invitation_responses r where r.family_id = fam.id and r.note is not null order by r.submitted_at desc limit 1),
               'travel', (select r.travel from public.invitation_responses r where r.family_id = fam.id and r.travel is not null order by r.submitted_at desc limit 1),
               'submitted_at', max(r.submitted_at))
        from public.invitation_responses r where r.family_id = fam.id
      having count(*) > 0)
  ) into result;

  return result;
end;
$$;
grant execute on function public.get_invitation(text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Save a family's reply.
-- p_payload: {
--   "functions": [ { "function_id": "...", "status": "confirmed" | "declined",
--                    "member_ids": [...], "new_names": ["Nani ji"],   -- names mode
--                    "adults": 3, "kids": 1 } ],                      -- headcount mode
--   "note": "...", "travel": "..." }
-- ---------------------------------------------------------------------------
create or replace function public.submit_invitation_rsvp(p_code text, p_pin text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  who record;
  deadline date;
  item jsonb;
  v_fn uuid;
  v_status text;
  v_selected uuid[];
  v_name text;
  v_new_id uuid;
  v_adults integer;
  v_kids integer;
  v_names_mode boolean;
  v_saved integer := 0;
begin
  select * into who from public._invite_identify(p_code, p_pin);
  if who.status <> 'ok' then
    return jsonb_build_object('status', who.status);
  end if;

  select rsvp_deadline into deadline from public.wedding_settings where id = 1;
  if deadline is not null and current_date > deadline then
    return jsonb_build_object('status', 'closed');
  end if;

  for item in select * from jsonb_array_elements(coalesce(p_payload->'functions', '[]'::jsonb)) loop
    v_fn := nullif(item->>'function_id', '')::uuid;
    v_status := item->>'status';
    if v_status not in ('confirmed', 'declined') then continue; end if;
    -- only functions this family is invited to
    if not exists (select 1 from public.function_attendance a where a.function_id = v_fn and a.family_id = who.family_id) then
      continue;
    end if;

    -- make sure there is a whole-family row to hold the reply
    insert into public.function_attendance (function_id, family_id, member_id, is_attending)
    values (v_fn, who.family_id, null, true)
    on conflict (function_id, family_id, member_id) do nothing;

    if v_status = 'declined' then
      update public.function_attendance
         set rsvp_status = 'declined', responded_at = now()
       where function_id = v_fn and family_id = who.family_id and member_id is null;
      v_saved := v_saved + 1;
      continue;
    end if;

    v_names_mode := jsonb_typeof(item->'member_ids') = 'array' or jsonb_typeof(item->'new_names') = 'array';
    if v_names_mode then
      -- the family's own members only
      select coalesce(array_agg(m.id), '{}') into v_selected
        from public.family_members m
       where m.family_id = who.family_id
         and m.id::text in (select jsonb_array_elements_text(coalesce(item->'member_ids', '[]'::jsonb)));

      -- names the guest added: create once (pending approval), then select them
      for v_name in select trim(x) from jsonb_array_elements_text(coalesce(item->'new_names', '[]'::jsonb)) as x loop
        if v_name = '' or length(v_name) > 80 then continue; end if;
        select id into v_new_id from public.family_members
         where family_id = who.family_id and lower(trim(name)) = lower(v_name) limit 1;
        if v_new_id is null then
          insert into public.family_members (family_id, name, gender, is_kid_for_gifting, added_by_guest, pending_approval)
          values (who.family_id, v_name, 'Unknown', false, true, true)
          returning id into v_new_id;
        end if;
        v_selected := array_append(v_selected, v_new_id);
        v_new_id := null;
      end loop;

      -- attending members = exactly the ones selected
      delete from public.function_attendance
       where function_id = v_fn and family_id = who.family_id and member_id is not null
         and not (member_id = any (v_selected));
      insert into public.function_attendance (function_id, family_id, member_id, is_attending)
      select v_fn, who.family_id, sel, true from unnest(v_selected) as sel
      on conflict (function_id, family_id, member_id) do nothing;

      select count(*) filter (where not (coalesce(m.is_kid_for_gifting, false) or coalesce(m.age < 12, false))),
             count(*) filter (where coalesce(m.is_kid_for_gifting, false) or coalesce(m.age < 12, false))
        into v_adults, v_kids
        from public.family_members m where m.id = any (v_selected);
      if v_adults + v_kids = 0 then
        v_status := 'declined';
      end if;
    else
      v_adults := least(greatest(coalesce((item->>'adults')::integer, 0), 0), 50);
      v_kids := least(greatest(coalesce((item->>'kids')::integer, 0), 0), 50);
      if v_adults + v_kids = 0 then
        v_status := 'declined';
      end if;
    end if;

    update public.function_attendance
       set rsvp_status = v_status,
           adults_count = case when v_status = 'confirmed' then v_adults else adults_count end,
           kids_count = case when v_status = 'confirmed' then v_kids else kids_count end,
           responded_at = now()
     where function_id = v_fn and family_id = who.family_id and member_id is null;
    v_saved := v_saved + 1;
  end loop;

  insert into public.invitation_responses (family_id, payload, note, travel)
  values (who.family_id, p_payload,
          nullif(left(trim(coalesce(p_payload->>'note', '')), 2000), ''),
          nullif(left(trim(coalesce(p_payload->>'travel', '')), 500), ''));

  return jsonb_build_object('status', 'ok', 'saved', v_saved);
end;
$$;
grant execute on function public.submit_invitation_rsvp(text, text, jsonb) to anon, authenticated;
