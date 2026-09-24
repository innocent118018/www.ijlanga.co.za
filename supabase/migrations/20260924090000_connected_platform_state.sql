-- Connected account state, audit trail and least-privilege policies.
-- Profiles remain application data; Supabase Auth remains the identity authority.

alter table public.profiles add column if not exists account_state text;
alter table public.profiles add column if not exists email_verified_at timestamptz;
alter table public.profiles add column if not exists approved_at timestamptz;
alter table public.profiles add column if not exists approved_by uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists rejection_reason text;
alter table public.profiles add column if not exists suspended_at timestamptz;

update public.profiles
set account_state = case
  when coalesce(is_active,false) = false and approval_status = 'rejected' then 'REJECTED'
  when coalesce(is_active,false) = false and approval_status = 'pending' then 'ADMIN_PENDING'
  when coalesce(is_active,false) = false then 'EMAIL_PENDING'
  when coalesce(is_active,false) = true then 'ACTIVE'
  else 'REGISTERED'
end
where account_state is null;

alter table public.profiles alter column account_state set default 'REGISTERED';
alter table public.profiles add constraint profiles_account_state_check check (account_state in ('REGISTERED','EMAIL_PENDING','EMAIL_VERIFIED','ADMIN_PENDING','APPROVED','ACTIVE','EXPIRED','REJECTED','SUSPENDED','DISABLED'));

create index if not exists idx_profiles_account_state on public.profiles(account_state);
create index if not exists idx_profiles_approval_status on public.profiles(approval_status);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  old_value jsonb,
  new_value jsonb,
  ip_address inet,
  user_agent text,
  result text not null default 'success',
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);
create index if not exists idx_audit_logs_actor on public.audit_logs(actor_user_id);
create index if not exists idx_audit_logs_resource on public.audit_logs(resource_type,resource_id);

alter table public.audit_logs enable row level security;
drop policy if exists "Admins read audit logs" on public.audit_logs;
create policy "Admins read audit logs" on public.audit_logs for select to authenticated using (is_admin());
drop policy if exists "No client audit writes" on public.audit_logs;
create policy "No client audit writes" on public.audit_logs for insert to authenticated with check (false);

-- Admins may review verification requests. Mutations belong in protected RPCs/functions.
drop policy if exists "Admins read verification requests" on public.account_access_requests;
create policy "Admins read verification requests" on public.account_access_requests for select to authenticated using (is_admin());

-- Users may read only their own profile; existing admin/team policies remain responsible for operational views.
drop policy if exists "Users read own connected profile" on public.profiles;
create policy "Users read own connected profile" on public.profiles for select to authenticated using (id = auth.uid() or is_admin());

comment on column public.profiles.id is 'Must equal auth.users.id; never generate independently.';
comment on column public.profiles.account_state is 'Business lifecycle state; separate from Supabase email confirmation.';
comment on table public.audit_logs is 'Sensitive actions are written by trusted server-side functions using the service role.';
