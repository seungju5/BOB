-- Execute after 001. Synthetic users and records are rolled back as one transaction.
-- No mail is sent, passwords are not created, and no existing row is modified.
begin;
create function pg_temp.assert_bapmunna(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'FAILED: %',label;end if;end;$$;
select pg_temp.assert_bapmunna((select count(*)=5 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('bapmunna_accounts','bapmunna_meals','bapmunna_crm_contacts','bapmunna_crm_notes','bapmunna_staff') and c.relrowsecurity),'five protected tables');
select pg_temp.assert_bapmunna(not has_table_privilege('anon','public.bapmunna_accounts','select'),'anonymous cannot select accounts');
select pg_temp.assert_bapmunna(not has_table_privilege('authenticated','public.bapmunna_staff','insert'),'clients cannot grant staff');
select pg_temp.assert_bapmunna(not has_table_privilege('authenticated','public.bapmunna_accounts','delete'),'clients cannot delete profiles by cascade');
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data,created_at,updated_at) values
('761c3a74-4a77-4ac0-a74b-fb1bccd16901','bapmunna-rls-alice@example.test',now(),'{}',now(),now()),
('761c3a74-4a77-4ac0-a74b-fb1bccd16902','bapmunna-rls-bob@example.test',now(),'{}',now(),now()),
('761c3a74-4a77-4ac0-a74b-fb1bccd16903','bapmunna-rls-staff@example.test',now(),'{}',now(),now()),
('761c3a74-4a77-4ac0-a74b-fb1bccd16904','bapmunna-rls-unverified@example.test',null,'{"email_verified":true}',now(),now());
insert into public.bapmunna_staff(owner_uid,role) values('761c3a74-4a77-4ac0-a74b-fb1bccd16903','manager');
set local role authenticated;
select set_config('request.jwt.claim.sub','761c3a74-4a77-4ac0-a74b-fb1bccd16901',true);
insert into public.bapmunna_accounts(owner_uid,email,display_name,consent_version) values(auth.uid(),'spoof@example.test','Alice test','2026-10-16');
select pg_temp.assert_bapmunna((select email='bapmunna-rls-alice@example.test' from public.bapmunna_accounts where owner_uid=auth.uid()),'server owns email');
select pg_temp.assert_bapmunna((select count(*)=1 from public.bapmunna_crm_contacts),'profile creates one own contact');
insert into public.bapmunna_meals(owner_uid,day,meal,kind) values(auth.uid(),(now() at time zone 'Asia/Seoul')::date,'lunch','home');
select pg_temp.assert_bapmunna((select count(*)=1 from public.bapmunna_meals),'owner can record today');
do $$begin begin insert into public.bapmunna_meals(owner_uid,day,meal,kind) values(auth.uid(),(now() at time zone 'Asia/Seoul')::date+1,'dinner','home');raise exception 'FAILED: future meal allowed';exception when raise_exception then if sqlerrm<>'Only today can be recorded' then raise;end if;end;end;$$;
do $$begin begin insert into public.bapmunna_meals(owner_uid,day,meal,kind) values(auth.uid(),(now() at time zone 'Asia/Seoul')::date,'dinner','raw-signal');raise exception 'FAILED: invalid meal kind';exception when check_violation then null;end;end;$$;
do $$begin begin insert into public.bapmunna_crm_notes(owner_uid,stage,note,updated_by) values(auth.uid(),'new','forbidden',auth.uid());raise exception 'FAILED: customer note write allowed';exception when insufficient_privilege then null;end;end;$$;
select set_config('request.jwt.claim.sub','761c3a74-4a77-4ac0-a74b-fb1bccd16902',true);
select pg_temp.assert_bapmunna((select count(*)=0 from public.bapmunna_accounts),'Bob cannot read Alice profile');
select pg_temp.assert_bapmunna((select count(*)=0 from public.bapmunna_meals),'Bob cannot read Alice meals');
select pg_temp.assert_bapmunna((select count(*)=0 from public.bapmunna_crm_contacts),'Bob cannot read Alice contact');
do $$declare affected integer;begin update public.bapmunna_accounts set display_name='intruder' where owner_uid='761c3a74-4a77-4ac0-a74b-fb1bccd16901';get diagnostics affected=row_count;if affected<>0 then raise exception 'FAILED: foreign profile update';end if;end;$$;
select set_config('request.jwt.claim.sub','761c3a74-4a77-4ac0-a74b-fb1bccd16904',true);
select pg_temp.assert_bapmunna(not public.bapmunna_verified(),'user metadata cannot verify an email');
do $$begin begin insert into public.bapmunna_accounts(owner_uid,email,display_name,consent_version) values(auth.uid(),'unverified@example.test','Not verified','2026-10-16');raise exception 'FAILED: unverified profile allowed';exception when insufficient_privilege then null;when raise_exception then if sqlerrm='FAILED: unverified profile allowed' then raise;end if;end;end;$$;
select set_config('request.jwt.claim.sub','761c3a74-4a77-4ac0-a74b-fb1bccd16903',true);
select pg_temp.assert_bapmunna(public.bapmunna_is_staff(),'assigned staff recognized');
select pg_temp.assert_bapmunna((select count(*)=1 from public.bapmunna_crm_contacts),'staff can read customer contact');
select pg_temp.assert_bapmunna((select count(*)=0 from public.bapmunna_accounts),'staff cannot read private profiles');
select pg_temp.assert_bapmunna((select count(*)=0 from public.bapmunna_meals),'staff cannot read private meals');
insert into public.bapmunna_crm_notes(owner_uid,stage,note,updated_by) values('761c3a74-4a77-4ac0-a74b-fb1bccd16901','contacted','Test only; rolled back',auth.uid());
select pg_temp.assert_bapmunna((select count(*)=1 from public.bapmunna_crm_notes),'staff can manage separate notes');
do $$begin begin update public.bapmunna_crm_notes set stage='admin' where owner_uid='761c3a74-4a77-4ac0-a74b-fb1bccd16901';raise exception 'FAILED: invalid CRM stage';exception when check_violation then null;end;end;$$;
select set_config('request.jwt.claim.sub','761c3a74-4a77-4ac0-a74b-fb1bccd16901',true);
select pg_temp.assert_bapmunna((select count(*)=0 from public.bapmunna_crm_notes),'customer cannot read internal notes');
delete from public.bapmunna_meals where owner_uid=auth.uid();
select pg_temp.assert_bapmunna((select count(*)=0 from public.bapmunna_meals),'owner can remove own meal');
reset role;
rollback;
select 'PASS: 24 schema, role and data-isolation checks; synthetic data rolled back' as result;
