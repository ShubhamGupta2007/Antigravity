-- 21_open_invitation.sql
-- One general invitation link for people who aren't on the guest list yet (friends,
-- colleagues, neighbours). It shows only the functions marked "show on the general invite"
-- for one side (the groom's side for now), and anyone can reply with their name, phone,
-- which days, how many, and whether they need help with a room. Replies wait in an inbox
-- until a planner adds them to the guest list. Guests never get table access: everything
-- goes through get_open_invitation() and submit_open_rsvp(), which take the link's code.
-- Requires 14. Run once in the Supabase SQL editor. Safe to re-run.

alter table public.wedding_settings
  add column if not exists open_invite_code text,
  add column if not exists open_invite_enabled boolean not null default false,
  add column if not exists open_invite_side text not null default 'groom';

update public.wedding_settings
   set open_invite_code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)
 where id = 1 and open_invite_code is null;

alter table public.functions
  add column if not exists open_to_all boolean not null default false;

-- ---------------------------------------------------------------------------
-- Replies to the general link (one per phone number; replying again updates it)
-- ---------------------------------------------------------------------------
create table if not exists public.open_rsvps (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  attending boolean not null default true,
  function_ids uuid[] not null default '{}',
  people integer not null default 1 check (people between 0 and 50),
  kids integer not null default 0 check (kids >= 0),
  needs_help boolean not null default false,
  message text,
  side text not null default 'groom',
  -- new: not looked at · added: in the guest list · updated: replied again after being added · dismissed
  status text not null default 'new' check (status in ('new', 'added', 'updated', 'dismissed')),
  family_id uuid references public.families(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.open_rsvps enable row level security;
drop policy if exists "Managers can see open replies" on public.open_rsvps;
create policy "Managers can see open replies" on public.open_rsvps
  for select to authenticated using (public.is_function_manager());
drop policy if exists "Managers can handle open replies" on public.open_rsvps;
create policy "Managers can handle open replies" on public.open_rsvps
  for all to authenticated using (public.is_function_manager()) with check (public.is_function_manager());

-- ---------------------------------------------------------------------------
-- What the general link shows
-- ---------------------------------------------------------------------------
create or replace function public.get_open_invitation(p_code text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s record;
begin
  select * into s from public.wedding_settings where id = 1;
  if s is null or not s.open_invite_enabled or s.open_invite_code is null or p_code is distinct from s.open_invite_code then
    return jsonb_build_object('status', 'not_found');
  end if;

  return jsonb_build_object(
    'status', 'ok',
    'side', s.open_invite_side,
    'settings', (to_jsonb(s) - 'id' - 'updated_at' - 'open_invite_code' - 'open_invite_enabled'),
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
                   'dress_colors', f.dress_colors,
                   -- from 20_dress_themes.sql when it has been run
                   'dress_theme', to_jsonb(f)->'dress_theme',
                   'dress_style', to_jsonb(f)->'dress_style',
                   'guest_note', f.guest_note,
                   'segments', coalesce((
                      select jsonb_agg(jsonb_build_object('name', sg.name, 'start_time', sg.start_time, 'end_time', sg.end_time, 'location', sg.location, 'notes', sg.notes)
                                       order by sg.start_time nulls last, sg.sort_order)
                        from public.function_segments sg where sg.function_id = f.id), '[]'::jsonb)
                 ) as fn
            from public.functions f
           where f.open_to_all
             and f.hosting_side::text in (s.open_invite_side, 'joint')
        ) t
    ), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.get_open_invitation(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- A reply from the general link: name, phone, coming or not, which functions,
-- how many, need help with a room or travel, a message. Same phone = update.
-- ---------------------------------------------------------------------------
create or replace function public.submit_open_rsvp(p_code text, p_payload jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  s record;
  v_name text := left(trim(coalesce(p_payload->>'name', '')), 80);
  v_phone text := right(regexp_replace(coalesce(p_payload->>'phone', ''), '\D', '', 'g'), 10);
  v_attending boolean := coalesce((p_payload->>'attending')::boolean, true);
  v_people integer := greatest(0, least(30, coalesce((p_payload->>'people')::integer, 1)));
  v_kids integer := greatest(0, coalesce((p_payload->>'kids')::integer, 0));
  v_functions uuid[];
begin
  select * into s from public.wedding_settings where id = 1;
  if s is null or not s.open_invite_enabled or p_code is distinct from s.open_invite_code then
    return jsonb_build_object('status', 'not_found');
  end if;
  if s.rsvp_deadline is not null and current_date > s.rsvp_deadline then
    return jsonb_build_object('status', 'closed');
  end if;
  if v_name = '' then
    return jsonb_build_object('status', 'invalid', 'field', 'name');
  end if;
  if length(v_phone) < 10 then
    return jsonb_build_object('status', 'invalid', 'field', 'phone');
  end if;

  -- Only functions this link actually shows
  select coalesce(array_agg(f.id), '{}') into v_functions
    from public.functions f
   where f.open_to_all
     and f.hosting_side::text in (s.open_invite_side, 'joint')
     and f.id::text in (select jsonb_array_elements_text(coalesce(p_payload->'function_ids', '[]'::jsonb)));

  if not v_attending then
    v_functions := '{}';
    v_people := 0;
    v_kids := 0;
  else
    v_people := greatest(1, v_people);
    v_kids := least(v_kids, v_people - 1);
  end if;

  insert into public.open_rsvps (name, phone, attending, function_ids, people, kids, needs_help, message, side)
  values (v_name, v_phone, v_attending, v_functions, v_people, v_kids,
          coalesce((p_payload->>'needs_help')::boolean, false),
          nullif(left(trim(coalesce(p_payload->>'message', '')), 1000), ''),
          s.open_invite_side)
  on conflict (phone) do update
    set name = excluded.name,
        attending = excluded.attending,
        function_ids = excluded.function_ids,
        people = excluded.people,
        kids = excluded.kids,
        needs_help = excluded.needs_help,
        message = excluded.message,
        updated_at = now(),
        status = case public.open_rsvps.status when 'added' then 'updated' when 'dismissed' then 'new' else public.open_rsvps.status end;

  return jsonb_build_object('status', 'ok');
end;
$$;
grant execute on function public.submit_open_rsvp(text, jsonb) to anon, authenticated;
