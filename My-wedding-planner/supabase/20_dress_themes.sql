-- 20_dress_themes.sql
-- A colour theme for each function on the guest invitation: a name (on top of the colours
-- already saved in dress_colors) and an optional style.
--   functions.dress_theme  e.g. "Pastels"
--   functions.dress_style  'indian' | 'western' | 'indo_western' | 'any'
-- get_invitation() is re-created unchanged apart from returning these two fields.
-- Run once in the Supabase SQL editor (after 14). Safe to re-run.

alter table public.functions
  add column if not exists dress_theme text,
  add column if not exists dress_style text;

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
                   'dress_theme', f.dress_theme,
                   'dress_style', f.dress_style,
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
