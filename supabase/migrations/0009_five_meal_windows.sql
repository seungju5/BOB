-- Existing days and meal slot IDs stay in place. Every new household still starts with three meals.
alter table public.meal_slots drop constraint meal_slots_slot_check;
alter table public.meal_slots add constraint meal_slots_slot_check
  check (slot in ('breakfast', 'lunch', 'dinner', 'fourth', 'fifth'));

alter table public.meal_profiles add column window_history jsonb not null default '[]';

-- Validate the complete schedule as one unit, including writes through the older guardian RPC.
create function warming_up_private.valid_meal_schedule(windows jsonb, meal_count int) returns boolean
language plpgsql immutable set search_path = '' as $$
declare
  w jsonb;
  seen text[] := '{}';
  last_end text := '';
begin
  if jsonb_typeof(windows) is distinct from 'array' then return false; end if;
  if meal_count is null or meal_count not between 1 and 5 or jsonb_array_length(windows) <> meal_count then return false; end if;
  for w in select value from jsonb_array_elements(windows) loop
    if jsonb_typeof(w) is distinct from 'object'
      or not (w ?& array['slot','start','end'])
      or (w - array['slot','start','end']) <> '{}'::jsonb
      or jsonb_typeof(w->'slot') is distinct from 'string'
      or w->>'slot' not in ('breakfast','lunch','dinner','fourth','fifth') or w->>'slot' = any(seen)
      or jsonb_typeof(w->'start') is distinct from 'string' or jsonb_typeof(w->'end') is distinct from 'string'
      or w->>'start' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' or w->>'end' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or w->>'start' < last_end or w->>'start' >= w->>'end'
    then return false; end if;
    seen := array_append(seen,w->>'slot');
    last_end := w->>'end';
  end loop;
  return true;
end;
$$;
alter table public.meal_profiles add constraint meal_schedule_valid
  check (warming_up_private.valid_meal_schedule(meal_windows, meals_per_day)) not valid;

-- Only the database writes snapshots. On a second edit the same day, yesterday's schedule stays the same.
create function warming_up_private.remember_meal_schedule() returns trigger
language plpgsql set search_path = '' as $$
declare
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if tg_op = 'INSERT' then
    new.window_history := '[]';
  else
    new.window_history := old.window_history;
    if old.meal_windows is distinct from new.meal_windows then
      select coalesce(jsonb_agg(entry order by entry->>'through'), '[]'::jsonb) into new.window_history
        from jsonb_array_elements(old.window_history) as entry where entry->>'through' >= (today - 35)::text;
      if new.window_history->-1->>'through' is distinct from (today - 1)::text then
        new.window_history := new.window_history || jsonb_build_array(jsonb_build_object('through', today - 1, 'windows', old.meal_windows));
      end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger meal_schedule_history before insert or update on public.meal_profiles
  for each row execute function warming_up_private.remember_meal_schedule();

create or replace function public.record_selected_senior_meal(
  h uuid, selected_date date, selected_slot text, selected_label text, recorded_at timestamptz
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  notice_id uuid;
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  perform 1 from public.households where id = h and senior_consent_at is not null for update;
  if not found then raise exception 'senior_consent_required' using errcode = '42501'; end if;
  if selected_date not in (today, today - 1) or recorded_at is null
    or (recorded_at at time zone 'Asia/Seoul')::date is distinct from selected_date or recorded_at > now()
    or selected_slot is null or selected_slot not in ('breakfast', 'lunch', 'dinner', 'fourth', 'fifth')
    or selected_label is null or selected_label not in ('첫 끼', '두 끼', '세 끼', '네 끼', '다섯 끼') then
    raise exception 'invalid selected meal' using errcode = '22023';
  end if;

  -- Resolve against the profile while holding the same household lock as setup.
  if not exists (
    select 1 from public.meal_profiles mp
    cross join lateral jsonb_array_elements(coalesce((
      select snapshot->'windows' from jsonb_array_elements(mp.window_history) as snapshot
      where snapshot->>'through' >= selected_date::text order by snapshot->>'through' limit 1
    ), mp.meal_windows)) with ordinality as window_info(w, pos)
    where mp.household_id = h and w->>'slot' = selected_slot
      and (array['첫 끼','두 끼','세 끼','네 끼','다섯 끼'])[pos::int] = selected_label
      and (recorded_at at time zone 'Asia/Seoul')::time >= (w->>'start')::time
      and (recorded_at at time zone 'Asia/Seoul')::time < (w->>'end')::time
  ) then raise exception 'meal schedule changed' using errcode = '22023'; end if;

  if exists (select 1 from public.alerts where household_id = h and type = 'eat_out'
    and payload->'meal'->>'date' = selected_date::text and payload->'meal'->>'slot' = selected_slot) then
    return null;
  end if;
  insert into public.senior_actions (household_id, type, at) values (h, 'eat_out', recorded_at);
  -- Retained aggregates outlive raw signals. Change only this slot and preserve
  -- already-confirmed cooker evidence and every other slot/cooker statistic.
  insert into public.meal_slots as ms (household_id, date, slot, status, source)
    values (h, selected_date, selected_slot, 'eat_out', 'senior_check')
    on conflict (household_id, date, slot) do update set status = excluded.status, source = excluded.source
    where ms.status <> 'confirmed' or not ms.meter_observed;
  insert into public.alerts (household_id, type, payload) values (h, 'eat_out', jsonb_build_object(
    'meal', jsonb_build_object('date', selected_date, 'slot', selected_slot, 'label', selected_label)))
    returning id into notice_id;
  return notice_id;
end;
$$;

revoke all on function public.record_selected_senior_meal(uuid, date, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.record_selected_senior_meal(uuid, date, text, text, timestamptz) to service_role;
