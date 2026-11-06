-- 13_tasks_links.sql
-- Links tasks to functions, and turns every due payment into a task.
--   * tasks.function_id: a task can belong to a function (Haldi prep, Mehendi artist...)
--   * tasks.expense_id:  a "Pay ₹X to ..." task kept in step with a due payment
-- A payment saved as due (with a due date) creates its task; changing the amount, payee or
-- date updates it; marking the payment paid ticks the task off; deleting the payment
-- removes its task. Existing due payments get tasks when this script runs.
-- Run once in the Supabase SQL editor. Safe to re-run.

alter table public.tasks
  add column if not exists function_id uuid references public.functions(id) on delete set null,
  add column if not exists expense_id uuid references public.expenses(id) on delete cascade,
  add column if not exists source text not null default 'manual';

create unique index if not exists tasks_expense_id_key on public.tasks(expense_id) where expense_id is not null;
create index if not exists tasks_function_id_idx on public.tasks(function_id);

-- Title for a payment task: "Pay ₹25,000 – Photographer (Wedding)"
create or replace function public.payment_task_title(e public.expenses)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select 'Pay ₹' || to_char(round(coalesce(e.amount, 0)), 'FM99,99,99,99,999') || ' – ' ||
         coalesce(
           nullif(trim(e.vendor_quick_name), ''),
           (select name from public.category_sub_items where id = e.sub_item_id),
           (select name from public.categories where id = e.category_id),
           'payment'
         ) ||
         coalesce(' (' || (select name from public.functions where id = e.function_id) || ')', '');
$$;

create or replace function public.sync_payment_task()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_side text;
  v_task_side public.tasks.side%TYPE;
begin
  if new.status::text = 'due' and new.due_date is not null then
    -- Which side pays: the function's hosting side, else whoever logged it, else groom.
    -- (Refined from the expense's split once that is saved; see sync_payment_task_side.)
    select case when f.hosting_side::text in ('groom', 'bride') then f.hosting_side::text end
      into v_side from public.functions f where f.id = new.function_id;
    if v_side is null then
      select case when u.side::text in ('groom', 'bride') then u.side::text end
        into v_side from public.users u where u.id = new.created_by;
    end if;

    v_task_side := coalesce(v_side, 'groom');
    insert into public.tasks (title, description, priority_tier, deadline, side, status, created_by, function_id, expense_id, source)
    values (
      public.payment_task_title(new),
      nullif(trim(coalesce(new.notes, '')), ''),
      'urgent',
      new.due_date,
      v_task_side,
      'not_started',
      new.created_by,
      new.function_id,
      new.id,
      'payment'
    )
    on conflict (expense_id) where expense_id is not null do update
      set title = excluded.title,
          description = excluded.description,
          deadline = excluded.deadline,
          function_id = excluded.function_id,
          -- a payment that went back to "due" reopens its task
          status = case when public.tasks.status::text = 'done' then 'not_started' else public.tasks.status end;
  else
    -- Paid (or no longer has a due date): the payment task is done
    update public.tasks set status = 'done' where expense_id = new.id and status::text <> 'done';
  end if;
  return new;
end;
$$;

drop trigger if exists expenses_sync_payment_task on public.expenses;
create trigger expenses_sync_payment_task
  after insert or update of status, due_date, amount, vendor_quick_name, category_id, sub_item_id, function_id, notes
  on public.expenses
  for each row execute function public.sync_payment_task();

-- When an expense is funded by one side only, the payment task belongs to that side.
create or replace function public.sync_payment_task_side()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sides int;
  v_side text;
  v_task_side public.tasks.side%TYPE;
begin
  select count(distinct side::text), min(side::text) into v_sides, v_side
    from public.expense_splits where expense_id = new.expense_id and coalesce(amount, 0) > 0;
  if v_sides = 1 and v_side in ('groom', 'bride') then
    v_task_side := v_side;
    update public.tasks set side = v_task_side where expense_id = new.expense_id and side is distinct from v_task_side;
  end if;
  return new;
end;
$$;

drop trigger if exists expense_splits_sync_task_side on public.expense_splits;
create trigger expense_splits_sync_task_side
  after insert or update on public.expense_splits
  for each row execute function public.sync_payment_task_side();

-- Backfill: tasks for payments that are already due (touching the row fires the trigger)
update public.expenses e
   set due_date = e.due_date
 where e.status::text = 'due'
   and e.due_date is not null
   and not exists (select 1 from public.tasks t where t.expense_id = e.id);
