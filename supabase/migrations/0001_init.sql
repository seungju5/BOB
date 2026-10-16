-- 밥뭇나 초기 스키마 (design.md 3장)
-- 원칙: 원시 전력값은 판정 후 삭제, 가족에게는 끼니 상태 요약만.

-- 테이블 -------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  phone text,
  created_at timestamptz not null default now()
);

create table public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default '우리 집',
  senior_name text not null default '',
  senior_relation text not null default '어머니',
  senior_phone text not null default '',
  resident_count int not null default 1,
  has_pet boolean not null default false,
  region text,
  onboarding_step int not null default 1,     -- 1~7 진행 중, 8 = 완료
  last_cooker_at timestamptz,                 -- 마지막 취사·뚜껑 열림
  last_activity_at timestamptz,               -- 위 + 시니어 버튼
  senior_consent_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.household_guardians (
  household_id uuid references public.households on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'member')),
  primary key (household_id, user_id)
);
create index on public.household_guardians (user_id);

create table public.senior_devices (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  pairing_code text unique,
  pairing_expires_at timestamptz,
  device_token_hash text unique,
  paired_at timestamptz,
  last_seen_at timestamptz
);
create index on public.senior_devices (household_id);

create table public.smart_plugs (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null unique references public.households on delete cascade,
  st_device_id text not null,
  st_token_secret_id uuid,                    -- Vault secret id. 토큰 평문 저장 금지
  status text not null default 'unknown' check (status in ('online', 'offline', 'unknown')),
  last_reading_at timestamptz
);

create table public.meal_profiles (
  household_id uuid primary key references public.households on delete cascade,
  meals_per_day int not null default 3,
  meal_windows jsonb not null default '[{"slot":"breakfast","start":"06:00","end":"10:00"},{"slot":"lunch","start":"11:00","end":"14:30"},{"slot":"dinner","start":"17:00","end":"21:00"}]',
  eat_out_per_week int not null default 1,
  uses_keep_warm boolean not null default true,
  cooks_per_week int not null default 7
);

create table public.alert_settings (
  household_id uuid primary key references public.households on delete cascade,
  missed_meals_threshold int not null default 2 check (missed_meals_threshold between 1 and 6),
  fasting_hours int not null default 48 check (fasting_hours between 12 and 108),
  emergency_hours int not null default 72 check (emergency_hours between 24 and 120),
  emergency_contact jsonb
);

-- 임시: 판정 창(90분)이 지나면 삭제, 어떤 경우에도 24시간 넘게 두지 않음
create table public.power_readings_raw (
  id bigserial primary key,
  plug_id uuid not null references public.smart_plugs on delete cascade,
  measured_at timestamptz not null,
  watts numeric not null,
  unique (plug_id, measured_at)
);

-- 다음 날 00:00에 daily_cooker_stats로 집계 후 삭제
create table public.cooker_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  type text not null check (type in ('cook', 'lid_open')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  unique (household_id, type, started_at)
);

create table public.daily_cooker_stats (
  household_id uuid references public.households on delete cascade,
  date date,
  cook_count int not null default 0,
  lid_open_count int not null default 0,
  primary key (household_id, date)
);

create table public.meal_slots (
  household_id uuid references public.households on delete cascade,
  date date,
  slot text check (slot in ('breakfast', 'lunch', 'dinner')),
  status text not null check (status in ('confirmed', 'unconfirmed', 'eat_out', 'away', 'pending')),
  source text check (source in ('cooker', 'senior_check', 'absence')),
  primary key (household_id, date, slot)
);

-- 시니어 버튼 기록 (외식 체크는 끼니 판정에 쓰임)
create table public.senior_actions (
  id bigserial primary key,
  household_id uuid not null references public.households on delete cascade,
  type text not null check (type in ('eat_out', 'away', 'help')),
  at timestamptz not null default now()
);
create index on public.senior_actions (household_id, at);

create table public.absences (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  start_date date not null,
  end_date date not null,
  created_by text not null default 'guardian' check (created_by in ('senior', 'guardian')),
  check (end_date >= start_date)
);
create index on public.absences (household_id);

create table public.alerts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households on delete cascade,
  type text not null check (type in ('missed_meals', 'fasting', 'emergency', 'help_request', 'device_offline')),
  triggered_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  payload jsonb
);
create index on public.alerts (household_id, triggered_at desc);
-- 같은 종류의 열린 알림은 하나만 (help_request 제외)
create unique index alerts_one_open on public.alerts (household_id, type)
  where resolved_at is null and type <> 'help_request';

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  endpoint text not null unique,
  keys jsonb not null
);
create index on public.push_subscriptions (user_id);

-- RLS -----------------------------------------------------------------------
-- 정책이 없는 테이블(power_readings_raw, cooker_events, senior_actions)은 service role 전용

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_guardians enable row level security;
alter table public.senior_devices enable row level security;
alter table public.smart_plugs enable row level security;
alter table public.meal_profiles enable row level security;
alter table public.alert_settings enable row level security;
alter table public.power_readings_raw enable row level security;
alter table public.cooker_events enable row level security;
alter table public.daily_cooker_stats enable row level security;
alter table public.meal_slots enable row level security;
alter table public.senior_actions enable row level security;
alter table public.absences enable row level security;
alter table public.alerts enable row level security;
alter table public.push_subscriptions enable row level security;

create function public.is_guardian(h uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.household_guardians
    where household_id = h and user_id = (select auth.uid())
  )
$$;
revoke execute on function public.is_guardian(uuid) from public, anon;
grant execute on function public.is_guardian(uuid) to authenticated;

create policy "own profile" on public.profiles for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "own subscriptions" on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "own links" on public.household_guardians for select to authenticated
  using (user_id = (select auth.uid()));

create policy "guardian read" on public.households for select to authenticated using (public.is_guardian(id));
create policy "guardian update" on public.households for update to authenticated
  using (public.is_guardian(id)) with check (public.is_guardian(id));
create policy "guardian plugs" on public.smart_plugs for select to authenticated using (public.is_guardian(household_id));
create policy "guardian devices" on public.senior_devices for select to authenticated using (public.is_guardian(household_id));
create policy "guardian meal profile" on public.meal_profiles for all to authenticated
  using (public.is_guardian(household_id)) with check (public.is_guardian(household_id));
create policy "guardian alert settings" on public.alert_settings for all to authenticated
  using (public.is_guardian(household_id)) with check (public.is_guardian(household_id));
create policy "guardian stats" on public.daily_cooker_stats for select to authenticated using (public.is_guardian(household_id));
create policy "guardian slots" on public.meal_slots for select to authenticated using (public.is_guardian(household_id));
create policy "guardian absences" on public.absences for all to authenticated
  using (public.is_guardian(household_id)) with check (public.is_guardian(household_id));
create policy "guardian alerts read" on public.alerts for select to authenticated using (public.is_guardian(household_id));
create policy "guardian alerts ack" on public.alerts for update to authenticated
  using (public.is_guardian(household_id)) with check (public.is_guardian(household_id));

-- RPC: 보호자 ----------------------------------------------------------------

-- 내 가구 id. 없으면 기본값으로 새로 만든다 (온보딩 시작).
create function public.ensure_household() returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  uid uuid := (select auth.uid());
  h uuid;
begin
  if uid is null then raise exception 'not signed in'; end if;
  select household_id into h from public.household_guardians where user_id = uid limit 1;
  if h is not null then return h; end if;
  insert into public.households default values returning id into h;
  insert into public.household_guardians (household_id, user_id) values (h, uid);
  insert into public.meal_profiles (household_id) values (h);
  insert into public.alert_settings (household_id) values (h);
  insert into public.profiles (id) values (uid) on conflict do nothing;
  return h;
end;
$$;
revoke execute on function public.ensure_household() from public, anon;
grant execute on function public.ensure_household() to authenticated;

-- 시니어 기기 연결 숫자 발급 (24시간 유효). 아직 연결 안 된 기존 코드는 지운다.
create function public.issue_pairing_code(h uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  code text;
begin
  if not public.is_guardian(h) then raise exception 'forbidden'; end if;
  delete from public.senior_devices where household_id = h and paired_at is null;
  loop
    code := lpad((floor(random() * 1000000))::int::text, 6, '0');
    exit when not exists (select 1 from public.senior_devices where pairing_code = code);
  end loop;
  insert into public.senior_devices (household_id, pairing_code, pairing_expires_at)
  values (h, code, now() + interval '24 hours');
  return code;
end;
$$;
revoke execute on function public.issue_pairing_code(uuid) from public, anon;
grant execute on function public.issue_pairing_code(uuid) to authenticated;

-- RPC: service role 전용 (Edge Functions) -------------------------------------

create function public.store_plug_token(h uuid, device_id text, token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  old_secret uuid;
  secret uuid;
  plug uuid;
begin
  select st_token_secret_id into old_secret from public.smart_plugs where household_id = h;
  secret := vault.create_secret(token, 'plug_' || h::text || '_' || extract(epoch from now())::bigint::text);
  insert into public.smart_plugs (household_id, st_device_id, st_token_secret_id, status)
  values (h, device_id, secret, 'unknown')
  on conflict (household_id) do update
    set st_device_id = excluded.st_device_id, st_token_secret_id = excluded.st_token_secret_id, status = 'unknown'
  returning id into plug;
  if old_secret is not null then delete from vault.secrets where id = old_secret; end if;
  return plug;
end;
$$;

create function public.get_plug_token(plug uuid) returns text
language sql stable security definer set search_path = '' as $$
  select s.decrypted_secret from public.smart_plugs p
  join vault.decrypted_secrets s on s.id = p.st_token_secret_id
  where p.id = plug
$$;

create function public.job_secret() returns text
language sql stable security definer set search_path = '' as $$
  select decrypted_secret from vault.decrypted_secrets where name = 'job_secret'
$$;

revoke execute on function public.store_plug_token(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.get_plug_token(uuid) from public, anon, authenticated;
revoke execute on function public.job_secret() from public, anon, authenticated;
grant execute on function public.store_plug_token(uuid, text, text) to service_role;
grant execute on function public.get_plug_token(uuid) to service_role;
grant execute on function public.job_secret() to service_role;
