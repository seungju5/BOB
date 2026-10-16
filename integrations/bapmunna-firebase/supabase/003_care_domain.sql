-- Complete care-domain schema for Bapmunna. Existing private accounts/CRM remain intact.
-- Raw device events, passwords, phone numbers and health notes are intentionally absent.
begin;
create table if not exists public.bapmunna_households(
 id uuid primary key default gen_random_uuid(),
 owner_uid uuid not null unique references public.bapmunna_accounts(owner_uid) on delete cascade,
 senior_name text not null check(length(btrim(senior_name)) between 2 and 30),
 timezone text not null default 'Asia/Seoul' check(timezone='Asia/Seoul'),
 consent_enabled boolean not null default false,
 consent_version text not null check(consent_version='2026-10-16'),
 shared_from timestamptz,
 created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create table if not exists public.bapmunna_memberships(
 household_id uuid not null references public.bapmunna_households(id) on delete cascade,
 member_uid uuid not null references auth.users(id) on delete cascade,
 role text not null check(role in ('caregiver','viewer')),
 alias text not null check(length(btrim(alias)) between 2 and 30),
 joined_at timestamptz not null default now(),primary key(household_id,member_uid)
);
create table if not exists public.bapmunna_invitations(
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.bapmunna_households(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[a-f0-9]{64}$'),
 role text not null check(role in ('caregiver','viewer')),
 label text not null check(length(btrim(label)) between 2 and 30),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),
 expires_at timestamptz not null,accepted_by uuid references auth.users(id) on delete set null,
 accepted_at timestamptz,revoked_at timestamptz,
 check(expires_at>created_at and expires_at<=created_at+interval '24 hours')
);
create or replace function public.bapmunna_valid_windows(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$declare item jsonb;names text[]='{}';start_min integer;end_min integer;prev_end integer=-1;begin
 if jsonb_typeof(value)<>'array' or jsonb_array_length(value)<>3 then return false;end if;
 for item in select x from jsonb_array_elements(value) x order by (x->>'start')::integer loop
  if jsonb_typeof(item)<>'object' or not item ?& array['meal','start','end'] or item-array['meal','start','end']<>'{}'::jsonb then return false;end if;
  if item->>'meal' not in ('breakfast','lunch','dinner') or (item->>'meal')=any(names) then return false;end if;
  if jsonb_typeof(item->'start')<>'number' or jsonb_typeof(item->'end')<>'number' then return false;end if;
  start_min=(item->>'start')::integer;end_min=(item->>'end')::integer;
  if (item->>'start')::numeric<>start_min or (item->>'end')::numeric<>end_min or start_min<0 or end_min>1440 or start_min>=end_min or start_min<prev_end then return false;end if;
  names=array_append(names,item->>'meal');prev_end=end_min;
 end loop;return array_length(names,1)=3;
 exception when others then return false;
end;$$;
create or replace function public.bapmunna_valid_meals(value text[]) returns boolean
language sql immutable set search_path='' as $$select cardinality(value) between 1 and 3 and value<@array['breakfast','lunch','dinner']::text[] and array_position(value,null) is null and cardinality(value)=(select count(distinct x) from unnest(value) x);$$;
create table if not exists public.bapmunna_preferences(
 household_id uuid primary key references public.bapmunna_households(id) on delete cascade,
 meal_windows jsonb not null default '[{"meal":"breakfast","start":420,"end":600},{"meal":"lunch","start":660,"end":840},{"meal":"dinner","start":1020,"end":1200}]' check(public.bapmunna_valid_windows(meal_windows)),
 grace_minutes integer not null default 30 check(grace_minutes between 0 and 180),
 household_type text not null default 'alone' check(household_type in ('alone','together')),
 age_band text check(age_band in ('60s','70s','80plus')),
 rice_routine text not null default 'daily' check(rice_routine in ('daily','sometimes','rare')),
 meals_enabled text[] not null default array['breakfast','lunch','dinner'] check(public.bapmunna_valid_meals(meals_enabled)),
 primary_device text not null default 'cooker' check(primary_device in ('cooker','fridge','microwave','kettle')),
 eat_out_weekly integer not null default 0 check(eat_out_weekly between 0 and 21),
 cook_every_days integer not null default 1 check(cook_every_days between 1 and 7),
 baseline_days integer not null default 14 check(baseline_days in (7,14,21,28)),
 consecutive_missed integer not null default 2 check(consecutive_missed between 1 and 6),
 fasting_hours integer not null default 16 check(fasting_hours between 4 and 48),
 inactive_hours integer not null default 4 check(inactive_hours between 1 and 71),
 followup_hours integer not null default 12 check(followup_hours between 2 and 72 and followup_hours>inactive_hours),
 updated_at timestamptz not null default now()
);
create table if not exists public.bapmunna_devices(
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.bapmunna_households(id) on delete cascade,
 kind text not null check(kind in ('cooker','fridge','microwave','kettle')),
 label text not null check(length(btrim(label)) between 2 and 40),
 connection_status text not null default 'unconfigured' check(connection_status in ('unconfigured','online','offline')),
 last_seen_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 unique(id,household_id)
);
create table if not exists public.bapmunna_device_daily(
 household_id uuid not null references public.bapmunna_households(id) on delete cascade,
 device_id uuid not null,day date not null,
 cook_count integer not null default 0 check(cook_count between 0 and 10000),
 lid_count integer not null default 0 check(lid_count between 0 and 10000),
 use_count integer not null default 0 check(use_count between 0 and 10000),
 observed boolean not null default false,last_activity_at timestamptz,
 updated_at timestamptz not null default now(),
 foreign key(device_id,household_id) references public.bapmunna_devices(id,household_id) on delete cascade,
 primary key(household_id,device_id,day)
);
create table if not exists public.bapmunna_alerts(
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.bapmunna_households(id) on delete cascade,
 kind text not null check(kind in ('meal_unconfirmed','device_offline','inactivity','help_request','social')),
 level text not null default 'notice' check(level in ('notice','attention','followup','help')),
 title text not null check(length(title) between 1 and 160),detail text not null default '' check(length(detail)<=500),
 meal text check(meal in ('breakfast','lunch','dinner')),
 status text not null default 'open' check(status in ('open','acknowledged','resolved')),
 created_at timestamptz not null default now(),acknowledged_by uuid references auth.users(id) on delete set null,
 acknowledged_at timestamptz,resolved_at timestamptz
);
create table if not exists public.bapmunna_away_periods(
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.bapmunna_households(id) on delete cascade,
 starts_at timestamptz not null,ends_at timestamptz not null,
 cancelled_at timestamptz,created_at timestamptz not null default now(),
 check(ends_at>starts_at and ends_at<=starts_at+interval '7 days')
);
create table if not exists public.bapmunna_consent_events(
 id uuid primary key default gen_random_uuid(),
 household_id uuid not null references public.bapmunna_households(id) on delete cascade,
 actor_uid uuid not null references auth.users(id) on delete cascade,
 enabled boolean not null,version text not null check(version='2026-10-16'),
 created_at timestamptz not null default now()
);
create index if not exists bapmunna_members_uid_idx on public.bapmunna_memberships(member_uid,household_id);
create index if not exists bapmunna_invites_house_idx on public.bapmunna_invitations(household_id,created_at desc);
create index if not exists bapmunna_daily_day_idx on public.bapmunna_device_daily(household_id,day desc);
create index if not exists bapmunna_alerts_open_idx on public.bapmunna_alerts(household_id,status,created_at desc);
create index if not exists bapmunna_away_range_idx on public.bapmunna_away_periods(household_id,starts_at,ends_at);

create or replace function public.bapmunna_household_role(hid uuid) returns text
language sql stable security definer set search_path='' as $$select case when h.owner_uid=auth.uid() then 'owner' when h.consent_enabled then (select m.role from public.bapmunna_memberships m where m.household_id=h.id and m.member_uid=auth.uid()) else null end from public.bapmunna_households h where h.id=hid and public.bapmunna_verified();$$;
create or replace function public.bapmunna_owns_household(hid uuid) returns boolean
language sql stable security definer set search_path='' as $$select coalesce(public.bapmunna_household_role(hid)='owner',false);$$;
create or replace function public.bapmunna_shared_household(hid uuid) returns boolean
language sql stable security definer set search_path='' as $$select exists(select 1 from public.bapmunna_households h where h.id=hid and h.consent_enabled and public.bapmunna_household_role(hid) is not null);$$;
create or replace function public.bapmunna_household_stamp() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if new.owner_uid is distinct from auth.uid() or not public.bapmunna_verified() then raise exception 'Verified owner required';end if;
 new.senior_name=btrim(new.senior_name);new.updated_at=now();
 if tg_op='INSERT' then new.created_at=now();new.shared_from=case when new.consent_enabled then now() else null end;
 else
  if new.owner_uid is distinct from old.owner_uid then raise exception 'Owner transfer is not allowed';end if;
  new.created_at=old.created_at;
  if new.consent_enabled is distinct from old.consent_enabled then new.shared_from=case when new.consent_enabled then now() else null end;else new.shared_from=old.shared_from;end if;
 end if;return new;
end;$$;
create or replace function public.bapmunna_household_after() returns trigger
language plpgsql security definer set search_path='' as $$begin
 if tg_op='INSERT' then insert into public.bapmunna_preferences(household_id) values(new.id);end if;
 if tg_op='INSERT' or new.consent_enabled is distinct from old.consent_enabled then
  insert into public.bapmunna_consent_events(household_id,actor_uid,enabled,version) values(new.id,auth.uid(),new.consent_enabled,new.consent_version);
  if not new.consent_enabled then
   delete from public.bapmunna_invitations where household_id=new.id;
   delete from public.bapmunna_memberships where household_id=new.id;
   delete from public.bapmunna_device_daily where household_id=new.id;
   delete from public.bapmunna_alerts where household_id=new.id;
   delete from public.bapmunna_away_periods where household_id=new.id;
  end if;
 end if;return new;
end;$$;
create or replace function public.bapmunna_updated_stamp() returns trigger
language plpgsql set search_path='' as $$begin new.updated_at=now();return new;end;$$;
create or replace function public.bapmunna_away_stamp() returns trigger
language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.bapmunna_households where id=new.household_id and consent_enabled and owner_uid=auth.uid() for update;
 if not found or not public.bapmunna_verified() then raise exception 'Sharing owner required';end if;
 if new.starts_at<now()-interval '1 minute' or new.starts_at>now()+interval '7 days' then raise exception 'Away period must start now or in the next 7 days';end if;
 new.created_at=now();new.cancelled_at=null;return new;
end;$$;
-- Serialize ingestion with consent changes so delayed device uploads cannot restore stopped sharing.
create or replace function public.bapmunna_daily_stamp() returns trigger
language plpgsql security definer set search_path='' as $$declare shared timestamptz;begin
 select shared_from into shared from public.bapmunna_households where id=new.household_id and consent_enabled for update;
 if not found then raise exception 'Active sharing required';end if;
 if new.day<(shared at time zone 'Asia/Seoul')::date or new.day>(now() at time zone 'Asia/Seoul')::date or new.last_activity_at>now() then raise exception 'Invalid observation date';end if;
 new.updated_at=now();return new;
end;$$;
create or replace function public.bapmunna_alert_stamp() returns trigger
language plpgsql security definer set search_path='' as $$begin
 perform 1 from public.bapmunna_households where id=new.household_id and consent_enabled for update;
 if not found then raise exception 'Active sharing required';end if;
 new.created_at=now();new.status='open';new.acknowledged_by=null;new.acknowledged_at=null;new.resolved_at=null;return new;
end;$$;
drop trigger if exists bapmunna_household_stamp on public.bapmunna_households;
create trigger bapmunna_household_stamp before insert or update on public.bapmunna_households for each row execute function public.bapmunna_household_stamp();
drop trigger if exists bapmunna_household_after on public.bapmunna_households;
create trigger bapmunna_household_after after insert or update on public.bapmunna_households for each row execute function public.bapmunna_household_after();
drop trigger if exists bapmunna_preferences_stamp on public.bapmunna_preferences;
create trigger bapmunna_preferences_stamp before update on public.bapmunna_preferences for each row execute function public.bapmunna_updated_stamp();
drop trigger if exists bapmunna_devices_stamp on public.bapmunna_devices;
create trigger bapmunna_devices_stamp before update on public.bapmunna_devices for each row execute function public.bapmunna_updated_stamp();
drop trigger if exists bapmunna_away_stamp on public.bapmunna_away_periods;
create trigger bapmunna_away_stamp before insert on public.bapmunna_away_periods for each row execute function public.bapmunna_away_stamp();
drop trigger if exists bapmunna_daily_stamp on public.bapmunna_device_daily;
create trigger bapmunna_daily_stamp before insert or update on public.bapmunna_device_daily for each row execute function public.bapmunna_daily_stamp();
drop trigger if exists bapmunna_alert_stamp on public.bapmunna_alerts;
create trigger bapmunna_alert_stamp before insert on public.bapmunna_alerts for each row execute function public.bapmunna_alert_stamp();

-- Invites are random, stored hashed, valid for one use and at most 24 hours.
create or replace function public.bapmunna_create_invite(hid uuid,invite_role text,invite_label text) returns jsonb
language plpgsql security definer set search_path='' as $$declare token text;rid uuid;expiry timestamptz=now()+interval '24 hours';begin
 if not public.bapmunna_owns_household(hid) or not public.bapmunna_shared_household(hid) then raise exception 'Sharing owner required';end if;
 if invite_role not in ('caregiver','viewer') or length(btrim(invite_label)) not between 2 and 30 then raise exception 'Invalid invite';end if;
 perform 1 from public.bapmunna_households where id=hid and consent_enabled for update;
 if not found then raise exception 'Sharing owner required';end if;
 update public.bapmunna_invitations set revoked_at=now() where household_id=hid and accepted_at is null and revoked_at is null;
 token=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into public.bapmunna_invitations(household_id,token_hash,role,label,created_by,expires_at)
 values(hid,encode(sha256(convert_to(token,'UTF8')),'hex'),invite_role,btrim(invite_label),auth.uid(),expiry) returning id into rid;
 return jsonb_build_object('id',rid,'token',token,'expiresAt',expiry);
end;$$;
create or replace function public.bapmunna_accept_invite(invite_token text,member_alias text) returns uuid
language plpgsql security definer set search_path='' as $$declare inv public.bapmunna_invitations;begin
 if not public.bapmunna_verified() or invite_token !~ '^[a-f0-9]{64}$' or length(btrim(member_alias)) not between 2 and 30 then raise exception 'Invalid or unavailable invitation';end if;
 -- Lock the household before its invite, matching create/withdrawal lock order.
 select * into inv from public.bapmunna_invitations where token_hash=encode(sha256(convert_to(invite_token,'UTF8')),'hex');
 if inv.id is null or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at<=now() then raise exception 'Invalid or unavailable invitation';end if;
 perform 1 from public.bapmunna_households h where h.id=inv.household_id and h.consent_enabled and h.owner_uid<>auth.uid() for update;
 if not found then raise exception 'Invalid or unavailable invitation';end if;
 select * into inv from public.bapmunna_invitations where token_hash=encode(sha256(convert_to(invite_token,'UTF8')),'hex') for update;
 if inv.id is null or inv.accepted_at is not null or inv.revoked_at is not null or inv.expires_at<=now() then raise exception 'Invalid or unavailable invitation';end if;
 insert into public.bapmunna_memberships(household_id,member_uid,role,alias) values(inv.household_id,auth.uid(),inv.role,btrim(member_alias))
 on conflict(household_id,member_uid) do update set role=excluded.role,alias=excluded.alias;
 update public.bapmunna_invitations set accepted_by=auth.uid(),accepted_at=now() where id=inv.id;
 return inv.household_id;
end;$$;
create or replace function public.bapmunna_change_member_role(hid uuid,member uuid,new_role text) returns void
language plpgsql security definer set search_path='' as $$begin
 if not public.bapmunna_owns_household(hid) or not public.bapmunna_shared_household(hid) or new_role not in ('caregiver','viewer') then raise exception 'Sharing owner required';end if;
 update public.bapmunna_memberships set role=new_role where household_id=hid and member_uid=member;
end;$$;
create or replace function public.bapmunna_acknowledge_alert(alert_id uuid) returns void
language plpgsql security definer set search_path='' as $$declare hid uuid;begin
 select household_id into hid from public.bapmunna_alerts where id=alert_id;
 if hid is null or not public.bapmunna_shared_household(hid) or public.bapmunna_household_role(hid) not in ('owner','caregiver') then raise exception 'Caregiver permission required';end if;
 update public.bapmunna_alerts set status='acknowledged',acknowledged_by=auth.uid(),acknowledged_at=now() where id=alert_id and status='open';
end;$$;
create or replace function public.bapmunna_request_contact(hid uuid,request_kind text) returns uuid
language plpgsql security definer set search_path='' as $$declare rid uuid;begin
 if not public.bapmunna_owns_household(hid) or not public.bapmunna_shared_household(hid) or request_kind not in ('help_request','social') then raise exception 'Sharing owner required';end if;
 perform 1 from public.bapmunna_households where id=hid and consent_enabled for update;
 if not found then raise exception 'Sharing owner required';end if;
 insert into public.bapmunna_alerts(household_id,kind,level,title,detail) values(hid,request_kind,case when request_kind='help_request' then 'help' else 'notice' end,'연락을 부탁했어요.','앱 안의 연락 요청입니다. 실제 전화나 긴급 신고는 전달하지 않습니다.') returning id into rid;return rid;
end;$$;
create or replace function public.bapmunna_cancel_away(away_id uuid) returns void
language plpgsql security definer set search_path='' as $$declare hid uuid;begin
 select household_id into hid from public.bapmunna_away_periods where id=away_id;
 if hid is null or not public.bapmunna_owns_household(hid) then raise exception 'Owner required';end if;
 update public.bapmunna_away_periods set cancelled_at=now() where id=away_id and cancelled_at is null;
end;$$;
create or replace function public.bapmunna_family_summary(hid uuid,from_day date,to_day date) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare h public.bapmunna_households;member_role text;result jsonb;begin
 member_role=public.bapmunna_household_role(hid);
 select * into h from public.bapmunna_households where id=hid;
 if member_role is null or not h.consent_enabled or from_day is null or to_day is null or from_day>to_day or to_day-from_day>29 or to_day>(now() at time zone 'Asia/Seoul')::date then raise exception 'Shared summary permission or date range invalid';end if;
 select jsonb_build_object('meals',coalesce((select jsonb_agg(jsonb_build_object('day',m.day,'meal',m.meal,'confirmed',true,'outside',m.kind='outside') order by m.day,m.meal) from public.bapmunna_meals m where m.owner_uid=h.owner_uid and m.day between from_day and to_day and m.updated_at>=h.shared_from),'[]'::jsonb),
 'devices',coalesce((select jsonb_agg(jsonb_build_object('day',d.day,'kind',v.kind,'cook',d.cook_count,'lid',d.lid_count,'observed',d.observed,'lastActivity',d.last_activity_at) order by d.day) from public.bapmunna_device_daily d join public.bapmunna_devices v on v.id=d.device_id where d.household_id=hid and d.day between from_day and to_day and d.updated_at>=h.shared_from),'[]'::jsonb),
 'away',exists(select 1 from public.bapmunna_away_periods a where a.household_id=hid and a.cancelled_at is null and now() between a.starts_at and a.ends_at)) into result;
 if member_role in ('owner','caregiver') then result=result||jsonb_build_object('contactRequested',exists(select 1 from public.bapmunna_alerts where household_id=hid and kind='help_request' and status='open'));end if;
 return result;
end;$$;

alter table public.bapmunna_households enable row level security;
alter table public.bapmunna_memberships enable row level security;
alter table public.bapmunna_invitations enable row level security;
alter table public.bapmunna_preferences enable row level security;
alter table public.bapmunna_devices enable row level security;
alter table public.bapmunna_device_daily enable row level security;
alter table public.bapmunna_alerts enable row level security;
alter table public.bapmunna_away_periods enable row level security;
alter table public.bapmunna_consent_events enable row level security;
revoke all on public.bapmunna_households,public.bapmunna_memberships,public.bapmunna_invitations,public.bapmunna_preferences,public.bapmunna_devices,public.bapmunna_device_daily,public.bapmunna_alerts,public.bapmunna_away_periods,public.bapmunna_consent_events from anon,authenticated;
grant select on public.bapmunna_households,public.bapmunna_memberships,public.bapmunna_invitations,public.bapmunna_preferences,public.bapmunna_devices,public.bapmunna_device_daily,public.bapmunna_alerts,public.bapmunna_away_periods,public.bapmunna_consent_events to authenticated;
grant insert(owner_uid,senior_name,consent_enabled,consent_version),update(senior_name,consent_enabled,consent_version) on public.bapmunna_households to authenticated;
grant update(meal_windows,grace_minutes,household_type,age_band,rice_routine,meals_enabled,primary_device,eat_out_weekly,cook_every_days,baseline_days,consecutive_missed,fasting_hours,inactive_hours,followup_hours) on public.bapmunna_preferences to authenticated;
grant insert(household_id,kind,label),update(label),delete on public.bapmunna_devices to authenticated;
grant insert(household_id,starts_at,ends_at) on public.bapmunna_away_periods to authenticated;
grant delete on public.bapmunna_memberships to authenticated;

drop policy if exists bapmunna_household_read on public.bapmunna_households;
create policy bapmunna_household_read on public.bapmunna_households for select to authenticated using((select public.bapmunna_verified()) and (owner_uid=(select auth.uid()) or (select public.bapmunna_household_role(id)) is not null));
drop policy if exists bapmunna_household_insert on public.bapmunna_households;
create policy bapmunna_household_insert on public.bapmunna_households for insert to authenticated with check(owner_uid=(select auth.uid()) and (select public.bapmunna_verified()));
drop policy if exists bapmunna_household_update on public.bapmunna_households;
create policy bapmunna_household_update on public.bapmunna_households for update to authenticated using((select public.bapmunna_owns_household(id))) with check(owner_uid=(select auth.uid()));
drop policy if exists bapmunna_member_read on public.bapmunna_memberships;
create policy bapmunna_member_read on public.bapmunna_memberships for select to authenticated using((select public.bapmunna_owns_household(household_id)) or (member_uid=(select auth.uid()) and (select public.bapmunna_shared_household(household_id))));
drop policy if exists bapmunna_member_delete on public.bapmunna_memberships;
create policy bapmunna_member_delete on public.bapmunna_memberships for delete to authenticated using((select public.bapmunna_owns_household(household_id)) or member_uid=(select auth.uid()));
drop policy if exists bapmunna_invite_owner on public.bapmunna_invitations;
create policy bapmunna_invite_owner on public.bapmunna_invitations for select to authenticated using((select public.bapmunna_owns_household(household_id)));
drop policy if exists bapmunna_preferences_owner on public.bapmunna_preferences;
create policy bapmunna_preferences_owner on public.bapmunna_preferences for all to authenticated using((select public.bapmunna_owns_household(household_id))) with check((select public.bapmunna_owns_household(household_id)));
drop policy if exists bapmunna_device_owner on public.bapmunna_devices;
create policy bapmunna_device_owner on public.bapmunna_devices for all to authenticated using((select public.bapmunna_owns_household(household_id))) with check((select public.bapmunna_owns_household(household_id)));
drop policy if exists bapmunna_daily_owner on public.bapmunna_device_daily;
create policy bapmunna_daily_owner on public.bapmunna_device_daily for select to authenticated using((select public.bapmunna_owns_household(household_id)));
drop policy if exists bapmunna_alert_read on public.bapmunna_alerts;
create policy bapmunna_alert_read on public.bapmunna_alerts for select to authenticated using((select public.bapmunna_shared_household(household_id)) and (kind not in ('help_request','social') or (select public.bapmunna_household_role(household_id)) in ('owner','caregiver')));
drop policy if exists bapmunna_away_owner on public.bapmunna_away_periods;
create policy bapmunna_away_owner on public.bapmunna_away_periods for all to authenticated using((select public.bapmunna_owns_household(household_id))) with check((select public.bapmunna_owns_household(household_id)) and (select public.bapmunna_shared_household(household_id)));
drop policy if exists bapmunna_consent_owner on public.bapmunna_consent_events;
create policy bapmunna_consent_owner on public.bapmunna_consent_events for select to authenticated using((select public.bapmunna_owns_household(household_id)));

create or replace view public.bapmunna_usage_report with(security_invoker=true) as
 select household_id,day,sum(cook_count)::bigint cook_count,sum(lid_count)::bigint lid_count,bool_or(observed) observed from public.bapmunna_device_daily group by household_id,day;
revoke all on public.bapmunna_usage_report from anon,authenticated;grant select on public.bapmunna_usage_report to authenticated;
revoke all on function public.bapmunna_valid_windows(jsonb),public.bapmunna_valid_meals(text[]),public.bapmunna_household_role(uuid),public.bapmunna_owns_household(uuid),public.bapmunna_shared_household(uuid),public.bapmunna_household_stamp(),public.bapmunna_household_after(),public.bapmunna_updated_stamp(),public.bapmunna_away_stamp(),public.bapmunna_daily_stamp(),public.bapmunna_alert_stamp(),public.bapmunna_create_invite(uuid,text,text),public.bapmunna_accept_invite(text,text),public.bapmunna_change_member_role(uuid,uuid,text),public.bapmunna_acknowledge_alert(uuid),public.bapmunna_request_contact(uuid,text),public.bapmunna_cancel_away(uuid),public.bapmunna_family_summary(uuid,date,date) from public,anon;
grant execute on function public.bapmunna_valid_windows(jsonb),public.bapmunna_valid_meals(text[]),public.bapmunna_household_role(uuid),public.bapmunna_owns_household(uuid),public.bapmunna_shared_household(uuid),public.bapmunna_create_invite(uuid,text,text),public.bapmunna_accept_invite(text,text),public.bapmunna_change_member_role(uuid,uuid,text),public.bapmunna_acknowledge_alert(uuid),public.bapmunna_request_contact(uuid,text),public.bapmunna_cancel_away(uuid),public.bapmunna_family_summary(uuid,date,date) to authenticated;
commit;
