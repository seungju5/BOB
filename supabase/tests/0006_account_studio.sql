-- Run on a local Supabase database with migrations applied, as the migration owner.
-- Deliberately rolls back every synthetic membership, profile and operator assignment.
begin;
insert into auth.users(id,email,email_confirmed_at,created_at)
select ('d6b00000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'fixture-studio-'||n||'@example.invalid', case when n<>4 then now() end, now()
from generate_series(1,32) s(n);
insert into warming_up_private.studio_operators(user_id) values
 ('d6b00000-0000-4000-8000-000000000001'), ('d6b00000-0000-4000-8000-000000000004');
insert into public.profiles(id,name) values ('d6b00000-0000-4000-8000-000000000002','기존 보호자');
insert into public.households(id,name,senior_phone) values
 ('d6b00000-1000-4000-8000-000000000001','내 가구','000-000-0000'),
 ('d6b00000-1000-4000-8000-000000000002','다른 가구','000-000-0001');
insert into public.household_guardians(household_id,user_id) values
 ('d6b00000-1000-4000-8000-000000000001','d6b00000-0000-4000-8000-000000000002'),
 ('d6b00000-1000-4000-8000-000000000002','d6b00000-0000-4000-8000-000000000003');
insert into public.meal_profiles(household_id) values ('d6b00000-1000-4000-8000-000000000001');
insert into public.alert_settings(household_id) values ('d6b00000-1000-4000-8000-000000000001');

do $$
begin
  if has_function_privilege('anon','public.warming_studio_page(uuid,text,text,timestamptz,uuid)','execute')
     or has_function_privilege('anon','public.warming_account_summary(uuid)','execute')
     or has_schema_privilege('authenticated','warming_up_private','usage')
     or has_table_privilege('authenticated','auth.users','select') then
    raise exception 'operator data exposed outside gated paths';
  end if;
end;
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub','d6b00000-0000-4000-8000-000000000002',true);
do $$
declare own uuid := auth.uid(); other uuid := 'd6b00000-0000-4000-8000-000000000003';
        old_version timestamptz; summary jsonb;
begin
  if public.warming_studio_allowed() then raise exception 'guardian recognized as operator'; end if;
  begin perform public.warming_studio_overview(own); raise exception 'ordinary guardian listed users';
    exception when insufficient_privilege then null; end;
  begin perform public.warming_studio_overview('d6b00000-0000-4000-8000-000000000001'); raise exception 'spoofed actor';
    exception when insufficient_privilege then null; end;
  begin perform public.warming_save_name(own,other,'다른 이름',null); raise exception 'cross-account name write';
    exception when insufficient_privilege then null; end;
  begin perform public.warming_account_summary(other); raise exception 'cross-account read';
    exception when insufficient_privilege then null; end;
  begin perform public.warming_studio_save_case(own,own,'done','forbidden',null); raise exception 'guardian case write';
    exception when insufficient_privilege then null; end;
  summary := public.warming_account_summary(own);
  if jsonb_array_length(summary->'households') <> 1 or summary#>>'{households,0,alias}' <> '내 가구'
     or (summary#>>'{households,0,contact}')::boolean is not true
     or summary::text like '%000-000-%' or summary::text like '%다른 가구%' then
    raise exception 'household access or minimization failed';
  end if;
  old_version := (summary#>>'{profile,version}')::timestamptz;
  perform public.warming_save_name(own,own,'수정 보호자',old_version);
  begin perform public.warming_save_name(own,own,'오래된 수정',old_version); raise exception 'stale owner write';
    exception when serialization_failure then null; end;
  if public.warming_account_summary(own)#>>'{profile,name}' <> '수정 보호자' then raise exception 'owner save failed'; end if;
  update public.profiles set name='기존 경로 수정' where id=own;
  if public.warming_account_summary(own)#>>'{profile,name}' <> '기존 경로 수정' then raise exception 'legacy profile editor stopped working'; end if;
  update public.households set resident_count=2 where id='d6b00000-1000-4000-8000-000000000001';
  if public.warming_account_summary(own)#>>'{households,0,residents}' <> '2' then raise exception 'legacy household editor stopped working'; end if;
  update public.households set resident_count=42 where id='d6b00000-1000-4000-8000-000000000002';
  if found then raise exception 'cross-household settings update'; end if;
end;
$$;
select set_config('request.jwt.claim.sub','d6b00000-0000-4000-8000-000000000004',true);
do $$ begin
  if public.warming_studio_allowed() then raise exception 'unverified operator allowed'; end if;
end; $$;
select set_config('request.jwt.claim.sub','d6b00000-0000-4000-8000-000000000001',true);
do $$
declare own uuid := auth.uid(); subject uuid := 'd6b00000-0000-4000-8000-000000000002';
        data jsonb; first_page jsonb; next_page jsonb; named_version timestamptz;
begin
  if not public.warming_studio_allowed() then raise exception 'operator denied'; end if;
  data := public.warming_studio_overview(own);
  if (data->>'total')::int < 32 or jsonb_array_length(data->'days')<>7 or jsonb_array_length(data->'latest')<>5 then
    raise exception 'overview incorrect';
  end if;
  first_page := public.warming_studio_page(own,'members','',null,null);
  next_page := public.warming_studio_page(own,'members','',(first_page#>>'{next,at}')::timestamptz,(first_page#>>'{next,id}')::uuid);
  if jsonb_array_length(first_page->'rows')<>25 or jsonb_array_length(next_page->'rows')<7
     or exists(select 1 from jsonb_array_elements(first_page->'rows') a cross join jsonb_array_elements(next_page->'rows') b
               where a->>'uid'=b->>'uid') then raise exception 'unstable keyset pagination'; end if;
  data := public.warming_studio_page(own,'profiles','FIXTURE-STUDIO-2@example.invalid',null,null);
  if jsonb_array_length(data->'rows')<>1 or (data#>>'{rows,0,uid}')::uuid<>subject then raise exception 'exact search'; end if;
  data := public.warming_studio_detail(own,subject);
  if data::text like '%000-000-%' or data::text like '%내 가구%' or data::text like '%다른 가구%' then
    raise exception 'guardian settings leaked to operator'; end if;
  named_version := (data#>>'{profile,version}')::timestamptz;
  perform public.warming_save_name(own,subject,'운영 수정',named_version);
  begin perform public.warming_save_name(own,subject,'중복 수정',named_version); raise exception 'operator stale name write';
    exception when serialization_failure then null; end;
  perform public.warming_studio_save_case(own,subject,'review','테스트 기록',null);
  begin perform public.warming_studio_save_case(own,subject,'done','겹친 메모',null); raise exception 'operator stale case write';
    exception when serialization_failure then null; end;
  data := public.warming_studio_detail(own,subject);
  perform public.warming_studio_save_case(own,subject,'done','확인 완료',(data->>'caseVersion')::timestamptz);
  if public.warming_studio_detail(own,subject)->>'stage'<>'done' then raise exception 'case not saved'; end if;
  begin perform public.warming_studio_save_case(own,subject,'missing','',null); raise exception 'bad stage accepted';
    exception when invalid_parameter_value then null; end;
end;
$$;
reset role;
delete from warming_up_private.studio_operators where user_id='d6b00000-0000-4000-8000-000000000001';
set local role authenticated;
do $$ begin
  if public.warming_studio_allowed() then raise exception 'operator revocation ignored'; end if;
  begin perform public.warming_studio_detail(auth.uid(),'d6b00000-0000-4000-8000-000000000002'); raise exception 'revoked operator read';
    exception when insufficient_privilege then null; end;
end; $$;
rollback;
