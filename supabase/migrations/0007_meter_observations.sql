-- Only a Samsung observation carries a measurement timestamp. Existing plug rows
-- remain unverified until the next successful registration or poll.
alter table public.smart_plugs
  add column meter_kind text check (meter_kind in ('recognized', 'virtual', 'unknown')),
  add column last_signal_high boolean,
  add column observing_since timestamptz,
  add column power_notice_enabled boolean not null default false,
  add column last_power_notice_at timestamptz;

-- Bind a cooking run to the device that produced it, even if a household later
-- reuses its smart_plugs row for a replacement outlet. Old aggregates are retained.
alter table public.cooker_events add column source_device text;

-- Keep one encrypted secret per household and serialize simultaneous renewals.
create or replace function public.store_plug_token(h uuid, device_id text, token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  p public.smart_plugs%rowtype;
  secret uuid;
begin
  perform 1 from public.households where id = h and senior_consent_at is not null for update;
  if not found then raise exception 'senior_consent_required' using errcode = '42501'; end if;
  select * into p from public.smart_plugs where household_id = h for update;
  if p.st_token_secret_id is null then
    secret := vault.create_secret(token);
  else
    secret := p.st_token_secret_id;
    perform vault.update_secret(secret, token);
  end if;
  if p.id is null then
    insert into public.smart_plugs(household_id, st_device_id, st_token_secret_id)
      values (h, device_id, secret) returning id into p.id;
  elsif p.st_device_id <> device_id then
    delete from public.power_readings_raw where plug_id = p.id;
    update public.smart_plugs set st_device_id = device_id, st_token_secret_id = secret, status = 'unknown',
      meter_kind = null, last_signal_high = null, observing_since = null, last_reading_at = null,
      power_notice_enabled = false, last_power_notice_at = null where id = p.id;
  else
    update public.smart_plugs set st_token_secret_id = secret where id = p.id;
  end if;
  return p.id;
end;
$$;

create function public.record_plug_observation(
  h uuid, device_id text, kind text, sample_watts numeric, sample_at timestamptz,
  high boolean, merge_minutes integer, stale_hours integer,
  expected_plug uuid default null, registration_token text default null, guardian uuid default null
) returns boolean language plpgsql security definer set search_path = '' as $$
declare
  consent_at timestamptz;
  p public.smart_plugs%rowtype;
  plug uuid;
  observed_since timestamptz;
  gap interval := make_interval(mins => merge_minutes);
  stale interval := make_interval(hours => stale_hours);
  fresh boolean;
  run public.cooker_events%rowtype;
begin
  if kind is null or kind not in ('recognized','virtual','unknown') or sample_watts is null or sample_watts < 0
    or sample_watts::text in ('NaN','Infinity','-Infinity') or sample_at is null or not isfinite(sample_at)
    or sample_at > now() or sample_at <= '1970-01-01 00:00:00+00'::timestamptz or high is null
    or merge_minutes is null or merge_minutes <= 0 or stale_hours is null or stale_hours <= 0 then return false; end if;
  select senior_consent_at into consent_at from public.households where id = h for update;
  if consent_at is null then return false; end if;
  if registration_token is not null then
    if not exists (select 1 from public.household_guardians where household_id = h and user_id = guardian) then return false; end if;
    plug := public.store_plug_token(h, device_id, registration_token);
  else
    plug := expected_plug;
  end if;
  select * into p from public.smart_plugs where id = plug and household_id = h and st_device_id = device_id for update;
  if not found then return false; end if;
  -- A repeated status (or an out-of-order older response) cannot start a new
  -- run after a retry, raw expiry, device replacement or midnight cleanup.
  if p.meter_kind is not null and p.last_reading_at >= sample_at then
    if p.last_reading_at = sample_at then
      update public.smart_plugs set status = case when sample_at > now() - stale then 'online' else 'offline' end where id = plug;
    end if;
    return true;
  end if;
  fresh := sample_at > now() - stale and sample_at >= consent_at;
  observed_since := case when fresh and kind = 'recognized' then
    case when p.meter_kind = kind and p.status = 'online' and p.last_reading_at > sample_at - stale
      then coalesce(p.observing_since, sample_at) else sample_at end end;
  update public.smart_plugs set meter_kind = kind, last_reading_at = sample_at,
    status = case when sample_at > now() - stale then 'online' else 'offline' end,
    last_signal_high = case when kind = 'recognized' and sample_at >= consent_at then high end, observing_since = observed_since
    where id = plug;
  if observed_since is null then return true; end if;
  insert into public.power_readings_raw(plug_id, measured_at, watts) values (plug, sample_at, sample_watts)
    on conflict (plug_id, measured_at) do nothing;
  if not high then return true; end if;

  select * into run from public.cooker_events where household_id = h and type = 'cook' and source_device = device_id
    and ended_at >= consent_at and ended_at between sample_at - gap and sample_at order by ended_at desc limit 1;
  if found then
    update public.cooker_events set ended_at = sample_at where id = run.id;
  else
    insert into public.cooker_events(household_id, type, started_at, ended_at, source_device)
      values (h, 'cook', sample_at, sample_at, device_id) on conflict (household_id, type, started_at) do nothing;
    if found and p.power_notice_enabled then
      update public.smart_plugs set last_power_notice_at = sample_at where id = plug;
    end if;
  end if;
  update public.households set last_cooker_at = greatest(last_cooker_at, sample_at),
    last_activity_at = greatest(last_activity_at, sample_at) where id = h;
  return true;
end;
$$;
revoke all on function public.record_plug_observation(uuid,text,text,numeric,timestamptz,boolean,integer,integer,uuid,text,uuid) from public, anon, authenticated;
grant execute on function public.record_plug_observation(uuid,text,text,numeric,timestamptz,boolean,integer,integer,uuid,text,uuid) to service_role;

create function public.set_plug_power_notice(device_id text, enabled boolean, for_household uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare h uuid; consent_at timestamptz;
begin
  select p.household_id into strict h from public.smart_plugs p
    join public.household_guardians g on g.household_id = p.household_id
    where g.user_id = auth.uid() and p.st_device_id = device_id and (for_household is null or p.household_id = for_household);
  select senior_consent_at into consent_at from public.households where id = h for update;
  if enabled is null or (enabled and consent_at is null) then raise exception 'senior_consent_required' using errcode = '42501'; end if;
  update public.smart_plugs set power_notice_enabled = enabled,
    last_power_notice_at = case when enabled then last_power_notice_at else null end
    where household_id = h and st_device_id = device_id and (not enabled or meter_kind = 'recognized');
  if not found then raise exception 'physical_meter_required'; end if;
end;
$$;
revoke all on function public.set_plug_power_notice(text,boolean,uuid) from public, anon;
grant execute on function public.set_plug_power_notice(text,boolean,uuid) to authenticated;

-- Disconnect also works after consent has lapsed. Only the matching household
-- and currently selected device may be detached; old day summaries stay intact.
create function public.disconnect_meter_plug(device_id text, for_household uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare removed_secret_id uuid;
begin
  perform 1 from public.household_guardians where household_id = for_household and user_id = auth.uid() for share;
  if not found then raise exception 'forbidden' using errcode = '42501'; end if;
  perform 1 from public.households where id = for_household for update;
  delete from public.smart_plugs where household_id = for_household and st_device_id = device_id
    returning st_token_secret_id into removed_secret_id;
  if not found then return false; end if;
  delete from vault.secrets where id = removed_secret_id;
  return true;
end;
$$;
revoke all on function public.disconnect_meter_plug(text,uuid) from public, anon;
grant execute on function public.disconnect_meter_plug(text,uuid) to authenticated;

create function private.withdraw_plug_observation() returns trigger language plpgsql security definer set search_path = '' as $$
declare p public.smart_plugs%rowtype;
begin
  select * into p from public.smart_plugs where household_id = new.id for update;
  if p.id is not null then
    delete from public.smart_plugs where id = p.id;
    delete from vault.secrets where id = p.st_token_secret_id;
  end if;
  return new;
end;
$$;
create trigger withdraw_plug_observation after update of senior_consent_at on public.households
  for each row when (old.senior_consent_at is not null and new.senior_consent_at is null)
  execute function private.withdraw_plug_observation();

-- pg_cron replaces only this existing named job in the current database.
select cron.schedule('bapmutna-ingest', '*/10 * * * *', $$ select private.run_job('ingest') $$);

-- Mark summaries that the new, source-timestamped pipeline actually observed;
-- legacy rows and manually entered meals keep their original provenance.
alter table public.daily_cooker_stats add column meter_observed boolean not null default false;
alter table public.meal_slots add column meter_observed boolean not null default false;

create function public.save_meter_day_summary(h uuid, for_day date, slot_rows jsonb, cook_n integer, lid_n integer)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform 1 from public.households where id = h and senior_consent_at is not null for update;
  if not found then return; end if;
  insert into public.meal_slots as stored(household_id,date,slot,status,source,meter_observed)
    select h, for_day, r.slot, r.status, r.source, r.meter_observed
    from jsonb_to_recordset(slot_rows) as r(slot text,status text,source text,meter_observed boolean)
    on conflict(household_id,date,slot) do update set status=excluded.status, source=excluded.source, meter_observed=excluded.meter_observed
    where (stored.source is distinct from 'senior_check' or (excluded.source='cooker' and excluded.meter_observed))
      and (not stored.meter_observed or stored.source is distinct from 'cooker' or excluded.source = 'cooker');
  if cook_n is not null and lid_n is not null then
    insert into public.daily_cooker_stats as stored(household_id,date,cook_count,lid_open_count,meter_observed)
      values(h,for_day,cook_n,lid_n,true)
      on conflict(household_id,date) do update set
        cook_count = greatest(case when stored.meter_observed then stored.cook_count else 0 end, excluded.cook_count),
        lid_open_count = greatest(case when stored.meter_observed then stored.lid_open_count else 0 end, excluded.lid_open_count),
        meter_observed = true;
  end if;
end;
$$;
revoke all on function public.save_meter_day_summary(uuid,date,jsonb,integer,integer) from public, anon, authenticated;
grant execute on function public.save_meter_day_summary(uuid,date,jsonb,integer,integer) to service_role;

create function public.refresh_meter_activity(h uuid, cooker_at timestamptz) returns void
language sql security definer set search_path = '' as $$
  update public.households set last_cooker_at = greatest(last_cooker_at, cooker_at),
    last_activity_at = greatest(last_activity_at, last_cooker_at, cooker_at,
      (select max(at) from public.senior_actions where household_id = h))
    where id = h and senior_consent_at is not null;
$$;
revoke all on function public.refresh_meter_activity(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.refresh_meter_activity(uuid,timestamptz) to service_role;
