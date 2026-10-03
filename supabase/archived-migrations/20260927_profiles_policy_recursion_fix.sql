-- Fix infinite recursion in the profiles RLS policy.
-- The original policy referenced the same table in a self-referential subquery,
-- which Postgres detects as recursive policy evaluation.

create or replace function public.is_admin()
returns boolean
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  return exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  );
end;
$$;

create or replace function public.protect_profile_authorization_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.role is not null
      or new.is_active is not null
      or new.approval_status is not null
      or new.approval_notes is not null
      or new.approved_at is not null
      or new.approved_by is not null
      or new.employer_id is not null
      or new.email_verified_at is not null
      or new.email is not null then
      raise exception 'Protected profile fields are system-controlled and cannot be set directly.';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id then
      raise exception 'Profile identity cannot be changed.';
    end if;

    if (
      new.role is distinct from old.role
      or new.is_active is distinct from old.is_active
      or new.approval_status is distinct from old.approval_status
      or new.approval_notes is distinct from old.approval_notes
      or new.approved_at is distinct from old.approved_at
      or new.approved_by is distinct from old.approved_by
      or new.employer_id is distinct from old.employer_id
      or new.email_verified_at is distinct from old.email_verified_at
      or new.email is distinct from old.email
    ) then
      raise exception 'Protected profile fields are system-controlled and cannot be modified by the user.';
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_protect_profile_authorization_fields on public.profiles;
create trigger trg_protect_profile_authorization_fields
before insert or update on public.profiles
for each row
execute function public.protect_profile_authorization_fields();

drop policy if exists "Employers can read team profiles" on public.profiles;

create policy "Employers can read team profiles" on public.profiles
for select to authenticated
using (
  id = auth.uid()
  or employer_id = auth.uid()
  or is_admin()
);

drop policy if exists "Admins can manage admin_account_overrides" on public.admin_account_overrides;
create policy "Admins can manage admin_account_overrides" on public.admin_account_overrides
for all to authenticated
using (is_admin())
with check (is_admin());

drop policy if exists "No normal users can access admin_account_overrides" on public.admin_account_overrides;
create policy "No normal users can access admin_account_overrides" on public.admin_account_overrides
for all to authenticated
using (false)
with check (false);
