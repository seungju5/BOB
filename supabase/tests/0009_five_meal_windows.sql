-- Synthetic household fixtures run on a migrated test database only.
begin;
do $test$
declare
  h uuid;
  guardian uuid := gen_random_uuid();
  other_house uuid;
  today date := (now() at time zone 'Asia/Seoul')::date;
  fifth_at timestamptz := ((today - 1) + time '19:00') at time zone 'Asia/Seoul';
  five jsonb := '[{"slot":"breakfast","start":"06:00","end":"09:00"},
    {"slot":"lunch","start":"10:00","end":"12:00"},{"slot":"dinner","start":"12:30","end":"14:30"},
    {"slot":"fourth","start":"15:00","end":"17:00"},{"slot":"fifth","start":"18:00","end":"21:00"}]';
  two jsonb := jsonb_build_array(five->0, five->2);
  invalid jsonb;
begin
  insert into auth.users(id) values(guardian);
  insert into public.households(senior_consent_at) values (now()) returning id into h;
  insert into public.households default values returning id into other_house;
  insert into public.meal_profiles(household_id) values (other_house);
  assert (select meals_per_day from public.meal_profiles where household_id=other_house) = 3;
  insert into public.meal_profiles(household_id, meals_per_day, meal_windows) values(h,5,five);
  insert into public.household_guardians(household_id,user_id) values(h,guardian);
  perform set_config('request.jwt.claim.sub', guardian::text, true);
  set local role authenticated;
  assert not exists(select 1 from public.meal_profiles where household_id=other_house);
  update public.meal_profiles set meal_windows=five - 4, meals_per_day=4 where household_id=h;
  update public.meal_profiles set meal_windows=two, meals_per_day=2, window_history='[]' where household_id=h;
  assert (select window_history from public.meal_profiles where household_id=h)
    = jsonb_build_array(jsonb_build_object('through', today-1, 'windows', five));

  for invalid in select value from jsonb_array_elements(jsonb_build_array(
    '[]'::jsonb, five || (five->4), jsonb_set(five,'{4,slot}','"sixth"'), jsonb_set(five,'{4,slot}','"dinner"'),
    jsonb_set(five,'{4,start}','"16:59"'), jsonb_set(five,'{4,end}','"24:00"'), '{"unexpected":true}'::jsonb
  )) loop
    begin
      update public.meal_profiles set meal_windows=invalid, meals_per_day=5 where household_id=h;
      raise exception 'invalid meal schedule accepted';
    exception when check_violation then null; end;
  end loop;
  assert (select meal_windows from public.meal_profiles where household_id=h) = two;
  begin
    update public.meal_profiles set meal_windows=five, meals_per_day=4 where household_id=h;
    raise exception 'incorrect meal count accepted';
  exception when check_violation then null; end;

  reset role;
  -- A later report of yesterday's last meal preserves its measured source and all other meals.
  perform public.save_meter_day_summary(h,today-1,'[{"slot":"fifth","status":"confirmed","source":"cooker","meter_observed":true}]',1,0);
  assert public.record_selected_senior_meal(h,today-1,'fifth','다섯 끼',fifth_at) is not null;
  assert public.record_selected_senior_meal(h,today-1,'fifth','다섯 끼',fifth_at) is null;
  assert (select source from public.meal_slots where household_id=h and date=today-1 and slot='fifth') = 'cooker';
  assert (select count(*) from public.senior_actions where household_id=h and type='eat_out') = 1;
  assert (select count(*) from public.alerts where household_id=h and type='eat_out') = 1;
  begin
    perform public.record_selected_senior_meal(h,today-1,'fifth','두 끼',fifth_at);
    raise exception 'incorrect historical meal label accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.record_selected_senior_meal(other_house,today-1,'fifth','다섯 끼',fifth_at);
    raise exception 'missing senior consent accepted';
  exception when insufficient_privilege then null; end;
  assert not has_function_privilege('authenticated','public.record_selected_senior_meal(uuid,date,text,text,timestamptz)','execute');
  assert has_function_privilege('service_role','public.record_selected_senior_meal(uuid,date,text,text,timestamptz)','execute');
end;
$test$;
rollback;
