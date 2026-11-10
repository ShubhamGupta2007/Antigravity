-- 22_wedding_plan_tasks.sql
-- The wedding plan as tasks with deadlines, worked back from lead times (outfits need weeks of
-- stitching, cards need Pandit ji's timings, bhaji boxes are delivered fresh on 15 Jan).
-- Planning ends on Sun 10 Jan; 28 Nov – 2 Dec (Chandan's wedding) and 15 Dec are kept free.
-- They show in Tasks and in the home page's Weekend planner, where you can tick them off,
-- change dates or add more.
-- Run in the Supabase SQL editor (after 13). Safe to re-run: new plan tasks are added, plan tasks
-- you haven't started get this version's dates, and a plan task no longer in the plan is removed
-- if it hasn't been started. Tasks you added yourself are never touched.

do $$
declare
  v_owner uuid;
begin
  select id into v_owner from public.users where role::text = 'admin' limit 1;
  if v_owner is null then select id into v_owner from public.users limit 1; end if;
  if v_owner is null then raise exception 'No user found to own the tasks'; end if;

  create temporary table plan_rows (title text, deadline date, priority text, description text) on commit drop;
  insert into plan_rows values
      ('Confirm muhurat & every function''s timings with Pandit ji', date '2026-11-15', 'urgent', 'Needed before the cards are printed. Also get the samagri list for each ritual.'),
      ('Car: shortlist 2–3 models and take test drives', date '2026-11-22', 'must_have', 'Test drives this weekend and next; compare on-road price, waiting period and colour.'),
      ('Finalise the guest list for every function', date '2026-11-22', 'urgent', 'Who is invited to which function, in the app. It decides the card count, catering, gifts and bhaji boxes.'),
      ('Bhai''s wedding outfit: order the sherwani', date '2026-11-22', 'urgent', 'A custom sherwani takes 4–6 weeks plus a trial. Order now so it is ready by early January. Include safa, mojdi and stole.'),
      ('Wedding cards: finalise design, wording and quantity', date '2026-11-22', 'urgent', 'Use Pandit ji''s timings and the guest count, plus about 10% spare.'),
      ('Dance performances: pick songs and who is dancing', date '2026-11-22', 'good_to_have', 'One list per function: performers and song.'),
      ('Mummy''s shopping: sarees / lehenga', date '2026-11-24', 'urgent', 'Weekend of 21–22 Nov plus the Guru Nanak Jayanti holiday. Blouse stitching, fall and pico take about three weeks, so fittings finish by 27 December.'),
      ('Car: book it (ask for the year-end offer)', date '2026-11-24', 'must_have', 'Book on the Guru Nanak Jayanti holiday. Ask for delivery and registration by early January.'),
      ('Wedding cards: place the print order', date '2026-11-27', 'urgent', 'Before leaving for Chandan''s wedding. Printing takes about two weeks; collect by 13 December.'),
      ('Parlour: finalise and book for every function', date '2026-11-27', 'urgent', 'Before leaving for Chandan''s wedding; can be done by phone. January is peak season.'),
      ('Mehendi: finalise and book the artists', date '2026-11-27', 'urgent', 'Before leaving; by phone. Fix how many artists by the number of ladies, plus the date and hours.'),
      ('Decoration: finalise the decorator', date '2026-11-27', 'urgent', 'Before leaving. Share the function list, venues and colour themes; get the quote in writing.'),
      ('Dance performances: book the choreographer', date '2026-11-27', 'good_to_have', 'Practice on weekends from 19 December.'),
      ('Papa''s shopping: sherwani / kurta and safa', date '2026-12-06', 'must_have', 'First weekend back. Stitching takes about three weeks.'),
      ('Finish the wedding invitation website', date '2026-12-06', 'must_have', 'Theme, Hindi version, music, colour themes, timings and venues for every function.'),
      ('Decide what to give whom at each function', date '2026-12-06', 'must_have', 'In the app''s Lifafa & Gifts plan. Gives the counts for comforters, hampers and bhaji boxes.'),
      ('Shubham''s shopping', date '2026-12-13', 'must_have', 'Outfits for every function; leave time for alterations.'),
      ('Gifts: buy comforters / bedsheet sets', date '2026-12-13', 'must_have', 'Buy in bulk from the wholesale market; quantity from the gifting plan.'),
      ('Bhaji boxes: choose the halwai and the box, fix the price', date '2026-12-13', 'must_have', 'Final count on 3 January; delivery on 15 January so the sweets are fresh.'),
      ('Decoration: finalise theme, colours and flowers', date '2026-12-13', 'must_have', 'Per function and venue.'),
      ('Wedding cards: collect the printed cards', date '2026-12-13', 'urgent', 'Check the spelling and the count before taking delivery.'),
      ('Gifts: order the gift hampers', date '2026-12-20', 'must_have', 'Delivery by 10 January.'),
      ('Gifts: order the wedding return gifts', date '2026-12-20', 'must_have', 'Delivery by 10 January.'),
      ('Invitations: start giving cards, calling and sharing the links', date '2026-12-20', 'urgent', 'Elders and outstation families first. Send the invitation video, then the website link.'),
      ('Dance practice starts (every weekend till 10 Jan)', date '2026-12-20', 'good_to_have', 'Plus a couple of weekday evenings.'),
      ('Parlour trial', date '2026-12-27', 'must_have', 'Christmas long weekend.'),
      ('Mummy''s outfits: fittings and alterations', date '2026-12-27', 'must_have', 'Christmas long weekend.'),
      ('Invitations: every family called and link shared', date '2027-01-03', 'urgent', 'Two weeks before the first function. Check the Replies in the app.'),
      ('Final fittings for Papa, Bhai and Shubham', date '2027-01-03', 'must_have', 'New Year long weekend.'),
      ('Bhaji boxes: place the order with the final count', date '2027-01-03', 'must_have', 'Count from the gifting plan. Ask the halwai to deliver home on 15 January.'),
      ('Car: delivery and registration', date '2027-01-03', 'must_have', 'New Year long weekend.'),
      ('Decoration: final walkthrough at each venue', date '2027-01-10', 'must_have', 'Last planning weekend.'),
      ('Mehendi: reconfirm artists and timing', date '2027-01-10', 'must_have', 'Last planning weekend.'),
      ('Final headcounts to the caterer', date '2027-01-10', 'urgent', 'From the replies in the app, per function.'),
      ('Collect hampers and return gifts; pack the lifafas', date '2027-01-10', 'must_have', 'Label by family using the Give & track list.'),
      ('Reconfirm Pandit ji and keep the samagri ready', date '2027-01-10', 'urgent', 'Last planning weekend.'),
      ('Dance performances: final rehearsal', date '2027-01-10', 'good_to_have', 'Last planning weekend.');

  insert into public.tasks (title, deadline, priority_tier, description, side, status, created_by, source)
  select p.title, p.deadline, p.priority::priority_tier, p.description, 'groom', 'not_started', v_owner, 'plan'
    from plan_rows p
   where not exists (select 1 from public.tasks t where t.title = p.title);

  update public.tasks t
     set deadline = p.deadline, priority_tier = p.priority::priority_tier, description = p.description
    from plan_rows p
   where t.title = p.title and t.source = 'plan' and t.status::text = 'not_started';

  delete from public.tasks t
   where t.source = 'plan' and t.status::text = 'not_started'
     and not exists (select 1 from plan_rows p where p.title = t.title);
end $$;
