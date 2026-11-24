-- Paired-device Edge Function only. An action, its guardian notice and its
-- selected meal/absence are committed together, serialized with withdrawal.
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
    or selected_slot is null or selected_slot not in ('breakfast', 'lunch', 'dinner', 'fourth')
    or selected_label is null or selected_label not in ('첫 끼', '두 끼', '세 끼', '네 끼') then
    raise exception 'invalid selected meal' using errcode = '22023';
  end if;

  -- Resolve against the profile while holding the same household lock as setup.
  if not exists (
    select 1 from public.meal_profiles mp
    cross join lateral jsonb_array_elements(mp.meal_windows) with ordinality as window_info(w, pos)
    where mp.household_id = h and w->>'slot' = selected_slot
      and (array['첫 끼','두 끼','세 끼','네 끼'])[pos::int] = selected_label
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

create or replace function public.record_planned_senior_absence(h uuid, away_start date, away_end date) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  notice_id uuid;
  today date := (now() at time zone 'Asia/Seoul')::date;
begin
  perform 1 from public.households where id = h and senior_consent_at is not null for update;
  if not found then raise exception 'senior_consent_required' using errcode = '42501'; end if;
  if away_start is null or away_end is null or away_start not in (today, today + 1)
    or away_end < away_start or away_end > away_start + 29 then
    raise exception 'invalid planned absence' using errcode = '22023';
  end if;
  if exists (select 1 from public.absences where household_id = h and created_by = 'senior'
    and start_date = away_start and end_date = away_end) then return null; end if;
  -- A new plan must not truncate an overlapping period entered by the family.
  insert into public.absences (household_id, start_date, end_date, created_by)
    values (h, away_start, away_end, 'senior');
  insert into public.senior_actions (household_id, type) values (h, 'away');
  insert into public.alerts (household_id, type, payload) values (h, 'away', jsonb_build_object(
    'startDate', away_start, 'endDate', away_end)) returning id into notice_id;
  return notice_id;
end;
$$;

revoke all on function public.record_selected_senior_meal(uuid, date, text, text, timestamptz),
  public.record_planned_senior_absence(uuid, date, date) from public, anon, authenticated;
grant execute on function public.record_selected_senior_meal(uuid, date, text, text, timestamptz),
  public.record_planned_senior_absence(uuid, date, date) to service_role;

-- Editing the household and meal windows is one save in the UI. Roll back both
-- if a value fails constraints or if the signed-in guardian's membership changed.
create or replace function public.save_household_setup(h uuid, next_step int, patch jsonb) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  current_house public.households;
  confirmed boolean;
  meals jsonb := patch->'mealProfile';
  prefs jsonb := patch->'alertSettings';
begin
  if not public.is_guardian(h) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into strict current_house from public.households where id = h for update;
  if next_step is null or next_step not between 1 and 8 or jsonb_typeof(patch) is distinct from 'object' then
    raise exception 'invalid household set-up' using errcode = '22023';
  end if;
  confirmed := coalesce((patch->>'seniorConsent')::boolean, current_house.senior_consent_at is not null);
  if not confirmed and (next_step > 3 or patch ?| array['household','senior','mealProfile','alertSettings'])
    and not (next_step = current_house.onboarding_step and patch = '{"seniorConsent":false}'::jsonb) then
    raise exception 'senior_consent_required' using errcode = '42501';
  end if;
  if meals is not null then
    update public.meal_profiles set meal_windows = meals->'windows', meals_per_day = jsonb_array_length(meals->'windows'),
      eat_out_per_week = (meals->>'eatOutPerWeek')::int, uses_keep_warm = (meals->>'usesKeepWarm')::boolean,
      cooks_per_week = (meals->>'cooksPerWeek')::int where household_id = h;
    if not found then raise exception 'meal profile missing'; end if;
  end if;
  if prefs is not null then
    update public.alert_settings set missed_meals_threshold = (prefs->>'missedMealsThreshold')::int,
      fasting_hours = (prefs->>'fastingHours')::int, emergency_hours = (prefs->>'emergencyHours')::int where household_id = h;
    if not found then raise exception 'alert settings missing'; end if;
  end if;
  update public.households set
    onboarding_step = case when current_house.onboarding_step = 8 then 8 else next_step end,
    senior_name = coalesce(patch#>>'{senior,name}', senior_name),
    senior_relation = coalesce(patch#>>'{senior,relation}', senior_relation),
    senior_phone = coalesce(patch#>>'{senior,phone}', senior_phone),
    resident_count = coalesce((patch#>>'{household,residentCount}')::int, resident_count),
    has_pet = coalesce((patch#>>'{household,hasPet}')::boolean, has_pet),
    senior_consent_at = case when not (patch ? 'seniorConsent') then senior_consent_at
      when confirmed then coalesce(senior_consent_at, now()) else null end
    where id = h;
end;
$$;
revoke all on function public.save_household_setup(uuid, int, jsonb) from public, anon;
grant execute on function public.save_household_setup(uuid, int, jsonb) to authenticated;

-- Two first-load requests for the same account may arrive before a guardian
-- row exists. Lock the existing auth parent before the read-or-create step.
create or replace function public.ensure_household() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := (select auth.uid());
  selected uuid;
begin
  if caller is null then raise exception 'not signed in' using errcode = '42501'; end if;
  if not exists (select 1 from public.household_guardians where user_id = caller) then
    perform 1 from auth.users where id = caller for update;
    if not found then raise exception 'not signed in' using errcode = '42501'; end if;
  end if;
  select g.household_id into selected
    from public.household_guardians g join public.households h on h.id = g.household_id
    where g.user_id = caller order by h.created_at, g.household_id limit 1;
  if selected is not null then return selected; end if;
  insert into public.households default values returning id into selected;
  insert into public.household_guardians (household_id, user_id) values (selected, caller);
  insert into public.meal_profiles (household_id) values (selected);
  insert into public.alert_settings (household_id) values (selected);
  insert into public.profiles (id) values (caller) on conflict (id) do nothing;
  return selected;
end;
$$;
revoke all on function public.ensure_household() from public, anon;
grant execute on function public.ensure_household() to authenticated;
