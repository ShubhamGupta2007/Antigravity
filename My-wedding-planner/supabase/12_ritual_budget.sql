-- 12_ritual_budget.sql
-- Mirrors the estimated cost of each function's ritual items into its budget
-- category as an auto-managed "Ritual items" sub-budget (like "Lifafas & Gifts").
-- Requires 07 and 08. Run once in the Supabase SQL editor. Safe to re-run.

alter table public.functions
  add column if not exists planned_ritual_total numeric not null default 0;

create or replace function public.set_function_ritual_plan(p_function_id uuid, p_total numeric)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_category uuid;
  v_item uuid;
  v_total numeric := greatest(coalesce(p_total, 0), 0);
begin
  if not (public.can_edit_function(p_function_id) or coalesce(auth.role(), '') = 'service_role') then
    raise exception 'Not allowed to change this function';
  end if;

  update public.functions set planned_ritual_total = v_total where id = p_function_id;

  select id into v_category
    from public.categories
   where function_id = p_function_id
   order by name
   limit 1;
  if v_category is null then
    return null;
  end if;

  select id into v_item
    from public.category_sub_items
   where category_id = v_category
     and auto_source = 'function_rituals'
     and auto_function_id = p_function_id
   limit 1;

  if v_item is null then
    if v_total > 0 then
      insert into public.category_sub_items (category_id, name, target_budget, is_auto, auto_source, auto_function_id)
      values (v_category, 'Ritual items', v_total, true, 'function_rituals', p_function_id);
    end if;
  else
    update public.category_sub_items set target_budget = v_total where id = v_item;
  end if;

  return v_category;
end;
$$;

grant execute on function public.set_function_ritual_plan(uuid, numeric) to authenticated;
