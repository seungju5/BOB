-- Prepare only: apply through the reviewed database migration workflow.
-- Consent is optional for signup/home access, but required to issue a senior
-- device pairing code. This changes no consent value and grants no new role.

create or replace function public.issue_pairing_code(h uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  code text;
  consent_at timestamptz;
begin
  if not public.is_guardian(h) then raise exception 'forbidden'; end if;

  -- Serialize code issuance with a concurrent change to this household's
  -- consent. Pairing and later device requests recheck consent in the API.
  select senior_consent_at into consent_at
  from public.households where id = h for update;
  if consent_at is null then
    raise exception 'senior_consent_required' using errcode = '42501';
  end if;

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
