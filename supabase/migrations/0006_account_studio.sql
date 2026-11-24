-- Existing profiles and households stay in place. Historical edit times remain unknown.
begin;

create schema warming_up_private;
revoke all on schema warming_up_private from public, anon, authenticated;

create table warming_up_private.studio_operators (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table warming_up_private.studio_cases (
  member_id uuid primary key references auth.users(id) on delete cascade,
  stage text not null check (stage in ('new', 'review', 'done')),
  note text not null check (char_length(note) <= 500),
  saved_at timestamptz not null
);
alter table warming_up_private.studio_operators enable row level security;
alter table warming_up_private.studio_cases enable row level security;
revoke all on all tables in schema warming_up_private from public, anon, authenticated;
-- A project administrator enrolls an existing, verified Auth UID in studio_operators.
-- A guardian's app role, email domain, user_metadata and household role do not grant operator access.

alter table public.profiles add column warming_saved_at timestamptz;
alter table public.households add column warming_saved_at timestamptz;
alter table public.meal_profiles add column warming_saved_at timestamptz;
alter table public.alert_settings add column warming_saved_at timestamptz;

create function warming_up_private.stamp_preferences() returns trigger language plpgsql
set search_path = '' as $$
declare col text;
begin
  if tg_op = 'INSERT' then
    new.warming_saved_at := clock_timestamp();
    return new;
  end if;
  new.warming_saved_at := old.warming_saved_at;
  foreach col in array tg_argv loop
    if to_jsonb(new)->col is distinct from to_jsonb(old)->col then
      new.warming_saved_at := clock_timestamp();
      exit;
    end if;
  end loop;
  return new;
end;
$$;
create trigger warming_stamp before insert or update on public.profiles
  for each row execute function warming_up_private.stamp_preferences('name');
create trigger warming_stamp before insert or update on public.households
  for each row execute function warming_up_private.stamp_preferences(
    'senior_name','senior_relation','senior_phone','resident_count','has_pet','region','name');
create trigger warming_stamp before insert or update on public.meal_profiles
  for each row execute function warming_up_private.stamp_preferences(
    'meals_per_day','meal_windows','eat_out_per_week','uses_keep_warm','cooks_per_week');
create trigger warming_stamp before insert or update on public.alert_settings
  for each row execute function warming_up_private.stamp_preferences(
    'missed_meals_threshold','fasting_hours','emergency_hours','emergency_contact');

create function public.warming_studio_allowed() returns boolean language sql stable
security definer set search_path = '' as $$
  select exists (
    select 1 from warming_up_private.studio_operators o
    join auth.users u on u.id = o.user_id
    where o.user_id = (select auth.uid()) and u.email_confirmed_at is not null
      and u.deleted_at is null and (u.banned_until is null or u.banned_until <= now())
  )
$$;

create function warming_up_private.require_operator(actor uuid) returns void language plpgsql stable
set search_path = '' as $$
begin
  if actor is null or actor is distinct from auth.uid() or not public.warming_studio_allowed() then
    raise exception 'operator access required' using errcode='42501';
  end if;
end;
$$;

-- This view is private. The bounded public RPCs below project only selected fields.
create view warming_up_private.studio_members as
  select u.id, u.email, u.created_at,
    jsonb_build_object('uid', u.id, 'email', coalesce(u.email, ''), 'joined', u.created_at,
      'lastLogin', u.last_sign_in_at, 'verified', u.email_confirmed_at is not null,
      'disabled', coalesce(u.banned_until > now(), false)) as member,
    case when p.id is not null then jsonb_build_object('uid', p.id, 'email', coalesce(u.email, ''),
      'name', coalesce(p.name,''), 'saved', p.warming_saved_at,
      'version', coalesce(p.warming_saved_at,p.created_at)) end as profile
  from auth.users u left join public.profiles p on p.id=u.id where u.deleted_at is null;
revoke all on warming_up_private.studio_members from public, anon, authenticated;

create function public.warming_studio_overview(actor uuid) returns jsonb language plpgsql stable
security definer set search_path = '' as $$
declare kst_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  perform warming_up_private.require_operator(actor);
  return (select jsonb_build_object(
    'total',count(*),'verified',count(*) filter (where (member->>'verified')::boolean),
    'stored',count(profile),'syncedAt',statement_timestamp(),
    'latest',(select coalesce(jsonb_agg(recent.member order by recent.created_at desc, recent.id desc),'[]'::jsonb)
      from (select id,member,created_at from warming_up_private.studio_members
            order by created_at desc,id desc limit 5) recent),
    'days',(select jsonb_agg(jsonb_build_object('day',kst_today - age.n,'count',(
      select count(*) from auth.users u where u.deleted_at is null
       and u.created_at >= ((kst_today - age.n)::timestamp at time zone 'Asia/Seoul')
       and u.created_at < ((kst_today - age.n + 1)::timestamp at time zone 'Asia/Seoul')
    )) order by age.n desc) from generate_series(0,6) age(n)))
    from warming_up_private.studio_members);
end;
$$;

create function public.warming_studio_page(
  actor uuid, kind text, search_text text, after_at timestamptz, after_id uuid
) returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare needle text := trim(coalesce(search_text,''));
begin
  perform warming_up_private.require_operator(actor);
  if kind is null or kind not in ('members','profiles') or char_length(needle)>254
     or ((after_at is null) <> (after_id is null)) then
    raise exception 'invalid page' using errcode='22023';
  end if;
  return (with candidates as materialized (
    select m.id,m.created_at,case when kind='members' then m.member else m.profile end as item
    from warming_up_private.studio_members m
    where (kind='members' or m.profile is not null)
      and (needle='' or lower(m.email)=lower(needle) or m.id::text=lower(needle))
      and (after_at is null or (m.created_at,m.id)<(after_at,after_id))
    order by m.created_at desc,m.id desc limit 26
  ), batch as (select * from candidates order by created_at desc,id desc limit 25)
  select jsonb_build_object('rows',coalesce(jsonb_agg(item order by created_at desc,id desc),'[]'::jsonb),
    'next',case when (select count(*) from candidates)>25 then
      (select jsonb_build_object('at',created_at,'id',id) from batch order by created_at,id limit 1) end)
  from batch);
end;
$$;

create function public.warming_studio_detail(actor uuid, member_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare detail jsonb;
begin
  perform warming_up_private.require_operator(actor);
  select jsonb_build_object('member',m.member,'profile',m.profile,'stage',coalesce(c.stage,'new'),
    'note',coalesce(c.note,''),'caseAt',c.saved_at,'caseVersion',c.saved_at,
    'householdAt',prefs.household_at,'settingsAt',prefs.settings_at) into detail
  from warming_up_private.studio_members m
  left join warming_up_private.studio_cases c on c.member_id=m.id
  cross join lateral (
    select max(h.warming_saved_at) as household_at,
      greatest(max(mp.warming_saved_at),max(a.warming_saved_at)) as settings_at
    from public.household_guardians g join public.households h on h.id=g.household_id
    left join public.meal_profiles mp on mp.household_id=h.id
    left join public.alert_settings a on a.household_id=h.id where g.user_id=m.id
  ) prefs where m.id=$2;
  if detail is null then raise exception 'member not found' using errcode='P0002'; end if;
  return detail;
end;
$$;

create function public.warming_studio_save_case(
  actor uuid, subject uuid, next_stage text, next_note text, expected_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform warming_up_private.require_operator(actor);
  if next_stage is null or next_stage not in ('new','review','done')
     or next_note is null or char_length(trim(next_note))>500 then
    raise exception 'invalid case' using errcode='22023';
  end if;
  if not exists(select 1 from auth.users where id=subject and deleted_at is null) then
    raise exception 'member not found' using errcode='P0002';
  end if;
  if expected_at is null then
    insert into warming_up_private.studio_cases(member_id,stage,note,saved_at)
    values (subject,next_stage,trim(next_note),clock_timestamp()) on conflict do nothing;
  else
    update warming_up_private.studio_cases set stage=next_stage,note=trim(next_note),saved_at=clock_timestamp()
      where member_id=subject and saved_at=expected_at;
  end if;
  if not found then raise exception 'case changed' using errcode='40001'; end if;
end;
$$;

create function public.warming_save_name(actor uuid, subject uuid, next_name text, expected_at timestamptz)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if actor is null or actor is distinct from auth.uid() or subject is null then
    raise exception 'signed-in user required' using errcode='42501';
  end if;
  if actor<>subject then perform warming_up_private.require_operator(actor); end if;
  if next_name is null or char_length(trim(next_name)) not between 2 and 30 then
    raise exception 'invalid name' using errcode='22023';
  end if;
  if expected_at is null then
    insert into public.profiles(id,name) values (subject,trim(next_name)) on conflict do nothing;
  else
    update public.profiles set name=trim(next_name)
      where id=subject and coalesce(warming_saved_at,created_at)=expected_at;
  end if;
  if not found then raise exception 'profile changed' using errcode='40001'; end if;
end;
$$;

-- Runs with callers' original table grants and household RLS. No contact value leaves this RPC.
create function public.warming_account_summary(actor uuid) returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if actor is null or actor is distinct from auth.uid() then
    raise exception 'signed-in user required' using errcode='42501';
  end if;
  return jsonb_build_object('profile',(
    select jsonb_build_object('name',p.name,'savedAt',p.warming_saved_at,
      'version',coalesce(p.warming_saved_at,p.created_at)) from public.profiles p where p.id=actor
  ),'households',(
    select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'alias',coalesce(nullif(h.senior_name,''),h.name),
      'relation',h.senior_relation,'residents',h.resident_count,'pet',h.has_pet,
      'contact',coalesce(trim(h.senior_phone)<>'',false),'step',h.onboarding_step,'householdAt',h.warming_saved_at,
      'windows',case when jsonb_typeof(m.meal_windows)='array' then jsonb_array_length(m.meal_windows) end,
      'threshold',a.missed_meals_threshold,'settingsAt',greatest(m.warming_saved_at,a.warming_saved_at))
      order by h.created_at,h.id),'[]'::jsonb)
    from public.household_guardians g join public.households h on h.id=g.household_id
    left join public.meal_profiles m on m.household_id=h.id left join public.alert_settings a on a.household_id=h.id
    where g.user_id=actor
  ));
end;
$$;

revoke all on all functions in schema warming_up_private from public, anon, authenticated;
revoke all on function public.warming_account_summary(uuid), public.warming_studio_allowed(), public.warming_studio_overview(uuid),
  public.warming_studio_page(uuid,text,text,timestamptz,uuid), public.warming_studio_detail(uuid,uuid),
  public.warming_studio_save_case(uuid,uuid,text,text,timestamptz), public.warming_save_name(uuid,uuid,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.warming_account_summary(uuid), public.warming_studio_allowed(), public.warming_studio_overview(uuid),
  public.warming_studio_page(uuid,text,text,timestamptz,uuid), public.warming_studio_detail(uuid,uuid),
  public.warming_studio_save_case(uuid,uuid,text,text,timestamptz), public.warming_save_name(uuid,uuid,text,timestamptz)
  to authenticated;
commit;
