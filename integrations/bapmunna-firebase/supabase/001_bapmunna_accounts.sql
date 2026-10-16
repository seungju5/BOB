-- Bapmunna: isolated account records and staff-only customer management.
-- No existing tables or authentication users are replaced.
begin;
create table if not exists public.bapmunna_staff (
  owner_uid uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','manager')),
  created_at timestamptz not null default now()
);
create table if not exists public.bapmunna_accounts (
  owner_uid uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null check (length(btrim(display_name)) between 2 and 30),
  consent_version text not null check (consent_version='2026-10-16'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.bapmunna_meals (
  owner_uid uuid not null references public.bapmunna_accounts(owner_uid) on delete cascade,
  day date not null,
  meal text not null check (meal in ('breakfast','lunch','dinner')),
  kind text not null check (kind in ('home','outside')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(owner_uid,day,meal)
);
create table if not exists public.bapmunna_crm_contacts (
  owner_uid uuid primary key references public.bapmunna_accounts(owner_uid) on delete cascade,
  email text not null,
  display_name text not null,
  consent_version text not null,
  source text not null default 'bapmunna' check(source='bapmunna'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);
create table if not exists public.bapmunna_crm_notes (
  owner_uid uuid primary key references public.bapmunna_crm_contacts(owner_uid) on delete cascade,
  stage text not null check(stage in ('new','contacted','active','paused')),
  note text not null default '' check(length(note)<=1000),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

create or replace function public.bapmunna_verified() returns boolean
language sql stable security definer set search_path=''
as $$select exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null);$$;
create or replace function public.bapmunna_is_staff() returns boolean
language sql stable security definer set search_path=''
as $$select public.bapmunna_verified() and exists(select 1 from public.bapmunna_staff where owner_uid=auth.uid() and role in ('owner','manager'));$$;

create or replace function public.bapmunna_profile_stamp() returns trigger
language plpgsql security definer set search_path=''
as $$begin
  if new.owner_uid is distinct from auth.uid() or not public.bapmunna_verified() then raise exception 'Verified owner required'; end if;
  select email into new.email from auth.users where id=auth.uid();
  new.display_name=btrim(new.display_name);
  if tg_op='INSERT' then new.created_at=now(); else new.created_at=old.created_at; end if;
  new.updated_at=now();return new;
end;$$;
create or replace function public.bapmunna_sync_contact() returns trigger
language plpgsql security definer set search_path=''
as $$begin
  insert into public.bapmunna_crm_contacts(owner_uid,email,display_name,consent_version,created_at,updated_at,last_login_at)
  values(new.owner_uid,new.email,new.display_name,new.consent_version,new.created_at,now(),now())
  on conflict(owner_uid) do update set email=excluded.email,display_name=excluded.display_name,
    consent_version=excluded.consent_version,updated_at=now();
  return new;
end;$$;
create or replace function public.bapmunna_meal_stamp() returns trigger
language plpgsql set search_path=''
as $$begin
  if new.day is distinct from (now() at time zone 'Asia/Seoul')::date then raise exception 'Only today can be recorded'; end if;
  if tg_op='INSERT' then new.created_at=now(); else new.created_at=old.created_at; end if;
  new.updated_at=now();return new;
end;$$;
create or replace function public.bapmunna_note_stamp() returns trigger
language plpgsql set search_path=''
as $$begin new.updated_by=auth.uid();new.updated_at=now();return new;end;$$;
create or replace function public.bapmunna_touch_login() returns void
language plpgsql security definer set search_path=''
as $$begin
  if not public.bapmunna_verified() then raise exception 'Verified owner required';end if;
  update public.bapmunna_crm_contacts set last_login_at=now(),updated_at=now() where owner_uid=auth.uid();
end;$$;

drop trigger if exists bapmunna_profile_stamp on public.bapmunna_accounts;
create trigger bapmunna_profile_stamp before insert or update on public.bapmunna_accounts for each row execute function public.bapmunna_profile_stamp();
drop trigger if exists bapmunna_sync_contact on public.bapmunna_accounts;
create trigger bapmunna_sync_contact after insert or update on public.bapmunna_accounts for each row execute function public.bapmunna_sync_contact();
drop trigger if exists bapmunna_meal_stamp on public.bapmunna_meals;
create trigger bapmunna_meal_stamp before insert or update on public.bapmunna_meals for each row execute function public.bapmunna_meal_stamp();
drop trigger if exists bapmunna_note_stamp on public.bapmunna_crm_notes;
create trigger bapmunna_note_stamp before insert or update on public.bapmunna_crm_notes for each row execute function public.bapmunna_note_stamp();

alter table public.bapmunna_accounts enable row level security;
alter table public.bapmunna_meals enable row level security;
alter table public.bapmunna_crm_contacts enable row level security;
alter table public.bapmunna_crm_notes enable row level security;
alter table public.bapmunna_staff enable row level security;
revoke all on public.bapmunna_accounts,public.bapmunna_meals,public.bapmunna_crm_contacts,public.bapmunna_crm_notes,public.bapmunna_staff from anon,authenticated;
grant select,insert,update on public.bapmunna_accounts to authenticated;
grant select,insert,update,delete on public.bapmunna_meals to authenticated;
grant select on public.bapmunna_crm_contacts,public.bapmunna_staff to authenticated;
grant select,insert,update on public.bapmunna_crm_notes to authenticated;

drop policy if exists bapmunna_account_owner on public.bapmunna_accounts;
create policy bapmunna_account_owner on public.bapmunna_accounts for all to authenticated
  using(owner_uid=(select auth.uid()) and (select public.bapmunna_verified()))
  with check(owner_uid=(select auth.uid()) and (select public.bapmunna_verified()));
drop policy if exists bapmunna_meal_owner on public.bapmunna_meals;
create policy bapmunna_meal_owner on public.bapmunna_meals for all to authenticated
  using(owner_uid=(select auth.uid()) and (select public.bapmunna_verified()))
  with check(owner_uid=(select auth.uid()) and (select public.bapmunna_verified()));
drop policy if exists bapmunna_contacts_read on public.bapmunna_crm_contacts;
create policy bapmunna_contacts_read on public.bapmunna_crm_contacts for select to authenticated
  using((select public.bapmunna_verified()) and (owner_uid=(select auth.uid()) or (select public.bapmunna_is_staff())));
drop policy if exists bapmunna_notes_staff on public.bapmunna_crm_notes;
create policy bapmunna_notes_staff on public.bapmunna_crm_notes for all to authenticated
  using((select public.bapmunna_is_staff()))
  with check((select public.bapmunna_is_staff()) and updated_by=(select auth.uid()));
drop policy if exists bapmunna_staff_self on public.bapmunna_staff;
create policy bapmunna_staff_self on public.bapmunna_staff for select to authenticated
  using(owner_uid=(select auth.uid()) and (select public.bapmunna_verified()));

revoke all on function public.bapmunna_verified(),public.bapmunna_is_staff(),public.bapmunna_touch_login(),public.bapmunna_profile_stamp(),public.bapmunna_sync_contact(),public.bapmunna_meal_stamp(),public.bapmunna_note_stamp() from public,anon;
grant execute on function public.bapmunna_verified(),public.bapmunna_is_staff(),public.bapmunna_touch_login() to authenticated;
commit;
