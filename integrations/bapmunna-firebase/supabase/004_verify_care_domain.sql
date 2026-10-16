-- Run after 001 and 003 in the SQL editor. All synthetic rows are rolled back.
-- No passwords, email delivery, real customers or existing households are used.
begin;
create function pg_temp.check_care(ok boolean,label text) returns void language plpgsql as $$begin
 if ok is distinct from true then raise exception 'FAILED: %',label;end if;
 perform set_config('bapmunna.checks',(coalesce(nullif(current_setting('bapmunna.checks',true),''),'0')::integer+1)::text,true);
end;$$;
create function pg_temp.deny_care(statement text,label text) returns void language plpgsql as $$declare denied boolean=false;begin
 begin execute statement;exception when insufficient_privilege or check_violation or raise_exception then denied=true;end;
 perform pg_temp.check_care(denied,label);
end;$$;
select pg_temp.check_care((select count(*)=14 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' and c.relname like 'bapmunna_%' and c.relrowsecurity),'all fourteen tables protect rows');
select pg_temp.check_care(not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname like 'bapmunna_%' and c.relkind in ('r','v') and has_table_privilege('anon',c.oid,'select')),'no anonymous table or report access');
select pg_temp.check_care(not has_table_privilege('authenticated','public.bapmunna_memberships','insert'),'members cannot self appoint');
select pg_temp.check_care(not has_table_privilege('authenticated','public.bapmunna_device_daily','insert'),'client cannot upload telemetry');
select pg_temp.check_care(not has_table_privilege('authenticated','public.bapmunna_consent_events','insert'),'client cannot invent consent history');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) values
 ('f6d593f1-bae2-43be-91de-407ab1000001','care-owner@example.test',now(),'{}',now(),now()),
 ('f6d593f1-bae2-43be-91de-407ab1000002','care-viewer@example.test',now(),'{}',now(),now()),
 ('f6d593f1-bae2-43be-91de-407ab1000003','care-giver@example.test',now(),'{}',now(),now()),
 ('f6d593f1-bae2-43be-91de-407ab1000004','care-operator@example.test',now(),'{}',now(),now());
insert into public.bapmunna_staff(owner_uid,role) values('f6d593f1-bae2-43be-91de-407ab1000004','manager');
set local role authenticated;
select set_config('request.jwt.claim.sub','f6d593f1-bae2-43be-91de-407ab1000001',true);
insert into public.bapmunna_accounts(owner_uid,email,display_name,consent_version) values(auth.uid(),'ignored@example.test','Care owner','2026-10-16');
do $$declare hid uuid;begin
 insert into public.bapmunna_households(owner_uid,senior_name,consent_enabled,consent_version) values(auth.uid(),'테스트 부모님',true,'2026-10-16') returning id into hid;
 perform set_config('bapmunna.hid',hid::text,true);
end;$$;
select pg_temp.check_care((select count(*)=1 from public.bapmunna_preferences),'household creates private settings');
select pg_temp.check_care((select count(*)=1 from public.bapmunna_consent_events where enabled),'household creates immutable consent event');
select pg_temp.deny_care($q$update public.bapmunna_households set owner_uid='f6d593f1-bae2-43be-91de-407ab1000002' where id=current_setting('bapmunna.hid')::uuid$q$,'owner transfer forbidden');
select pg_temp.deny_care($q$update public.bapmunna_preferences set meal_windows='[{"meal":"breakfast","start":420,"end":800},{"meal":"lunch","start":660,"end":840},{"meal":"dinner","start":1020,"end":1200}]' where household_id=current_setting('bapmunna.hid')::uuid$q$,'overlapping windows rejected');
select pg_temp.deny_care($q$update public.bapmunna_preferences set inactive_hours=10,followup_hours=5 where household_id=current_setting('bapmunna.hid')::uuid$q$,'followup must follow inactivity threshold');
select pg_temp.deny_care($q$update public.bapmunna_preferences set meals_enabled=array['breakfast','breakfast'] where household_id=current_setting('bapmunna.hid')::uuid$q$,'duplicate enabled meal rejected');
do $$declare did uuid;begin
 insert into public.bapmunna_devices(household_id,kind,label) values(current_setting('bapmunna.hid')::uuid,'cooker','테스트 밥솥') returning id into did;
 perform set_config('bapmunna.did',did::text,true);
end;$$;
select pg_temp.check_care((select connection_status='unconfigured' and last_seen_at is null from public.bapmunna_devices where id=current_setting('bapmunna.did')::uuid),'device starts unconfigured');
select pg_temp.deny_care($q$update public.bapmunna_devices set connection_status='online' where id=current_setting('bapmunna.did')::uuid$q$,'client cannot forge online status');
select pg_temp.deny_care($q$insert into public.bapmunna_device_daily(household_id,device_id,day) values(current_setting('bapmunna.hid')::uuid,current_setting('bapmunna.did')::uuid,current_date)$q$,'client cannot forge daily signals');
insert into public.bapmunna_meals(owner_uid,day,meal,kind) values(auth.uid(),(now() at time zone 'Asia/Seoul')::date,'breakfast','home');
do $$declare invitation jsonb;begin
 invitation=public.bapmunna_create_invite(current_setting('bapmunna.hid')::uuid,'viewer','가족 보기');
 perform set_config('bapmunna.viewer_token',invitation->>'token',true);
end;$$;
select pg_temp.check_care((select token_hash<>current_setting('bapmunna.viewer_token') and length(token_hash)=64 from public.bapmunna_invitations where accepted_at is null and revoked_at is null),'invite stored hashed');
select set_config('request.jwt.claim.sub','f6d593f1-bae2-43be-91de-407ab1000002',true);
select pg_temp.check_care((select count(*)=0 from public.bapmunna_households),'uninvited user cannot read household');
select pg_temp.deny_care($q$select public.bapmunna_accept_invite(repeat('0',64),'가족 보기')$q$,'wrong invite rejected');
select public.bapmunna_accept_invite(current_setting('bapmunna.viewer_token'),'가족 보기');
select pg_temp.check_care(public.bapmunna_household_role(current_setting('bapmunna.hid')::uuid)='viewer','invitation assigns owner-selected viewer role');
select pg_temp.deny_care($q$select public.bapmunna_accept_invite(current_setting('bapmunna.viewer_token'),'가족 보기')$q$,'used token rejected');
select pg_temp.check_care((select count(*)=0 from public.bapmunna_preferences),'viewer cannot read private settings');
select pg_temp.check_care((select count(*)=0 from public.bapmunna_devices),'viewer cannot read raw device metadata');
select pg_temp.check_care((select count(*)=0 from public.bapmunna_accounts),'viewer cannot read private profile');
select pg_temp.check_care((select count(*)=0 from public.bapmunna_meals),'viewer cannot read private meal table');
select pg_temp.check_care(jsonb_array_length(public.bapmunna_family_summary(current_setting('bapmunna.hid')::uuid,(now() at time zone 'Asia/Seoul')::date,(now() at time zone 'Asia/Seoul')::date)->'meals')=1,'viewer receives whitelisted meal summary');
select pg_temp.check_care(not public.bapmunna_family_summary(current_setting('bapmunna.hid')::uuid,(now() at time zone 'Asia/Seoul')::date,(now() at time zone 'Asia/Seoul')::date) ? 'contactRequested','viewer receives no help-request detail');
select pg_temp.deny_care($q$select public.bapmunna_change_member_role(current_setting('bapmunna.hid')::uuid,auth.uid(),'caregiver')$q$,'viewer cannot promote self');
select set_config('request.jwt.claim.sub','f6d593f1-bae2-43be-91de-407ab1000001',true);
do $$declare invitation jsonb;aid uuid;begin
 invitation=public.bapmunna_create_invite(current_setting('bapmunna.hid')::uuid,'caregiver','돌봄 가족');
 perform set_config('bapmunna.old_token',invitation->>'token',true);
 invitation=public.bapmunna_create_invite(current_setting('bapmunna.hid')::uuid,'caregiver','돌봄 가족');
 perform set_config('bapmunna.caregiver_token',invitation->>'token',true);
 aid=public.bapmunna_request_contact(current_setting('bapmunna.hid')::uuid,'help_request');
 perform set_config('bapmunna.aid',aid::text,true);
end;$$;
select set_config('request.jwt.claim.sub','f6d593f1-bae2-43be-91de-407ab1000003',true);
select pg_temp.deny_care($q$select public.bapmunna_accept_invite(current_setting('bapmunna.old_token'),'돌봄 가족')$q$,'replaced invite rejected');
select public.bapmunna_accept_invite(current_setting('bapmunna.caregiver_token'),'돌봄 가족');
select pg_temp.check_care(public.bapmunna_family_summary(current_setting('bapmunna.hid')::uuid,(now() at time zone 'Asia/Seoul')::date,(now() at time zone 'Asia/Seoul')::date)->>'contactRequested'='true','caregiver sees contact request');
select set_config('request.jwt.claim.sub','f6d593f1-bae2-43be-91de-407ab1000002',true);
select pg_temp.check_care((select count(*)=0 from public.bapmunna_alerts),'viewer cannot read contact request');
select pg_temp.deny_care($q$select public.bapmunna_acknowledge_alert(current_setting('bapmunna.aid')::uuid)$q$,'viewer cannot acknowledge help');
select set_config('request.jwt.claim.sub','f6d593f1-bae2-43be-91de-407ab1000003',true);
select public.bapmunna_acknowledge_alert(current_setting('bapmunna.aid')::uuid);
select pg_temp.check_care((select status='acknowledged' and acknowledged_by=auth.uid() from public.bapmunna_alerts where id=current_setting('bapmunna.aid')::uuid),'caregiver acknowledges request');
select set_config('request.jwt.claim.sub','f6d593f1-bae2-43be-91de-407ab1000001',true);
select pg_temp.check_care((select count(*)=1 from public.bapmunna_meals),'acknowledgement does not create meals');
select pg_temp.deny_care($q$insert into public.bapmunna_away_periods(household_id,starts_at,ends_at) values(current_setting('bapmunna.hid')::uuid,now(),now()+interval '8 days')$q$,'away duration limited');
select pg_temp.deny_care($q$insert into public.bapmunna_away_periods(household_id,starts_at,ends_at) values(current_setting('bapmunna.hid')::uuid,now()-interval '2 hours',now()+interval '1 hour')$q$,'away cannot be backdated');
do $$declare aid uuid;begin
 insert into public.bapmunna_away_periods(household_id,starts_at,ends_at) values(current_setting('bapmunna.hid')::uuid,now(),now()+interval '1 hour') returning id into aid;
 perform set_config('bapmunna.awayid',aid::text,true);
end;$$;
select pg_temp.check_care(public.bapmunna_family_summary(current_setting('bapmunna.hid')::uuid,(now() at time zone 'Asia/Seoul')::date,(now() at time zone 'Asia/Seoul')::date)->>'away'='true','shared summary only exposes away boolean');
select set_config('request.jwt.claim.sub','f6d593f1-bae2-43be-91de-407ab1000003',true);
select pg_temp.check_care((select count(*)=0 from public.bapmunna_away_periods),'caregiver cannot read precise away schedule');
select set_config('request.jwt.claim.sub','f6d593f1-bae2-43be-91de-407ab1000004',true);
select pg_temp.check_care((select count(*)=0 from public.bapmunna_households),'CRM operator is not a family member');
select pg_temp.deny_care($q$select public.bapmunna_family_summary(current_setting('bapmunna.hid')::uuid,(now() at time zone 'Asia/Seoul')::date,(now() at time zone 'Asia/Seoul')::date)$q$,'CRM operator cannot call family summary');
reset role;
-- Trusted ingestion can add a current aggregate, but not a pre-consent or future date.
insert into public.bapmunna_device_daily(household_id,device_id,day,cook_count,lid_count,observed,last_activity_at) values(current_setting('bapmunna.hid')::uuid,current_setting('bapmunna.did')::uuid,(now() at time zone 'Asia/Seoul')::date,1,2,true,now());
select pg_temp.deny_care($q$insert into public.bapmunna_device_daily(household_id,device_id,day) values(current_setting('bapmunna.hid')::uuid,current_setting('bapmunna.did')::uuid,(now() at time zone 'Asia/Seoul')::date-1)$q$,'ingestion cannot backfill before consent');
select pg_temp.deny_care($q$insert into public.bapmunna_device_daily(household_id,device_id,day) values(current_setting('bapmunna.hid')::uuid,current_setting('bapmunna.did')::uuid,(now() at time zone 'Asia/Seoul')::date+1)$q$,'ingestion cannot invent future signals');
-- An already-expired invitation is never accepted, even by a verified user.
insert into public.bapmunna_invitations(household_id,token_hash,role,label,created_by,created_at,expires_at) values(current_setting('bapmunna.hid')::uuid,encode(sha256(convert_to(repeat('e',64),'UTF8')),'hex'),'viewer','만료 초대','f6d593f1-bae2-43be-91de-407ab1000001',now()-interval '25 hours',now()-interval '1 hour');
set local role authenticated;
select set_config('request.jwt.claim.sub','f6d593f1-bae2-43be-91de-407ab1000002',true);
select pg_temp.deny_care($q$select public.bapmunna_accept_invite(repeat('e',64),'가족 보기')$q$,'expired invite rejected');
select set_config('request.jwt.claim.sub','f6d593f1-bae2-43be-91de-407ab1000001',true);
select pg_temp.check_care((select cook_count=1 and lid_count=2 from public.bapmunna_usage_report where household_id=current_setting('bapmunna.hid')::uuid),'owner report uses trusted aggregates');
select public.bapmunna_cancel_away(current_setting('bapmunna.awayid')::uuid);
select pg_temp.check_care(public.bapmunna_family_summary(current_setting('bapmunna.hid')::uuid,(now() at time zone 'Asia/Seoul')::date,(now() at time zone 'Asia/Seoul')::date)->>'away'='false','owner cancels away period');
delete from public.bapmunna_memberships where household_id=current_setting('bapmunna.hid')::uuid and member_uid='f6d593f1-bae2-43be-91de-407ab1000002';
select set_config('request.jwt.claim.sub','f6d593f1-bae2-43be-91de-407ab1000002',true);
select pg_temp.deny_care($q$select public.bapmunna_family_summary(current_setting('bapmunna.hid')::uuid,(now() at time zone 'Asia/Seoul')::date,(now() at time zone 'Asia/Seoul')::date)$q$,'revoked member immediately loses summary');
select set_config('request.jwt.claim.sub','f6d593f1-bae2-43be-91de-407ab1000001',true);
update public.bapmunna_households set consent_enabled=false where id=current_setting('bapmunna.hid')::uuid;
select pg_temp.check_care((select count(*)=0 from public.bapmunna_memberships where household_id=current_setting('bapmunna.hid')::uuid),'stop clears family membership');
select pg_temp.check_care((select count(*)=0 from public.bapmunna_invitations where household_id=current_setting('bapmunna.hid')::uuid),'stop clears invitations');
select pg_temp.check_care((select count(*)=0 from public.bapmunna_device_daily where household_id=current_setting('bapmunna.hid')::uuid),'stop clears shared device summaries');
select pg_temp.check_care((select count(*)=0 from public.bapmunna_away_periods where household_id=current_setting('bapmunna.hid')::uuid),'stop clears precise away periods');
select pg_temp.check_care((select count(*)=0 from public.bapmunna_alerts where household_id=current_setting('bapmunna.hid')::uuid),'stop clears shared alerts');
select pg_temp.check_care((select count(*)=1 from public.bapmunna_meals),'stop preserves private personal meal');
select pg_temp.check_care((select count(*)=2 from public.bapmunna_consent_events where household_id=current_setting('bapmunna.hid')::uuid),'stop is logged immutably');
select pg_temp.deny_care($q$select public.bapmunna_create_invite(current_setting('bapmunna.hid')::uuid,'viewer','정지 초대')$q$,'cannot invite while paused');
select pg_temp.deny_care($q$select public.bapmunna_request_contact(current_setting('bapmunna.hid')::uuid,'social')$q$,'cannot share a request while paused');
select pg_temp.deny_care($q$insert into public.bapmunna_away_periods(household_id,starts_at,ends_at) values(current_setting('bapmunna.hid')::uuid,now(),now()+interval '1 hour')$q$,'cannot create away schedule while paused');
reset role;
select pg_temp.deny_care($q$insert into public.bapmunna_device_daily(household_id,device_id,day) values(current_setting('bapmunna.hid')::uuid,current_setting('bapmunna.did')::uuid,(now() at time zone 'Asia/Seoul')::date)$q$,'late device ingestion blocked after consent withdrawal');
set local role authenticated;
select set_config('request.jwt.claim.sub','f6d593f1-bae2-43be-91de-407ab1000001',true);
update public.bapmunna_households set consent_enabled=true where id=current_setting('bapmunna.hid')::uuid;
select pg_temp.check_care((select count(*)=0 from public.bapmunna_memberships where household_id=current_setting('bapmunna.hid')::uuid),'resume does not restore old family access');
select set_config('request.jwt.claim.sub','f6d593f1-bae2-43be-91de-407ab1000003',true);
select pg_temp.deny_care($q$select public.bapmunna_family_summary(current_setting('bapmunna.hid')::uuid,(now() at time zone 'Asia/Seoul')::date,(now() at time zone 'Asia/Seoul')::date)$q$,'former caregiver remains revoked after resume');
reset role;
-- This assertion fixes the expected total. Any missing check aborts rather than reporting PASS.
select pg_temp.check_care(current_setting('bapmunna.checks')::integer=57,'all care-domain assertions executed');
rollback;
select 'PASS: 58 care-domain assertions; synthetic users and records rolled back' as result,
 not exists(select 1 from auth.users where id in ('f6d593f1-bae2-43be-91de-407ab1000001','f6d593f1-bae2-43be-91de-407ab1000002','f6d593f1-bae2-43be-91de-407ab1000003','f6d593f1-bae2-43be-91de-407ab1000004')) as synthetic_users_absent;
