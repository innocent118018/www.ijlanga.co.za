-- Dashboard, profile, and role-based RLS for IJ Langa.
-- This migration is intentionally idempotent and avoids recursive self-references.

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



alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.quotes enable row level security;
alter table public.orders enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.receipts enable row level security;
alter table public.tasks enable row level security;
alter table public.reseller_commissions enable row level security;

create index if not exists idx_profiles_employer_id on public.profiles(employer_id);
create index if not exists idx_customers_reseller_id on public.customers(reseller_id);
create index if not exists idx_tasks_assigned_to on public.tasks(assigned_to);
create index if not exists idx_tasks_created_by on public.tasks(created_by);
create index if not exists idx_tasks_customer_id on public.tasks(customer_id);
create index if not exists idx_commissions_reseller_id on public.reseller_commissions(reseller_id);

drop policy if exists "Profiles self service" on public.profiles;
create policy "Profiles self service" on public.profiles
for select to authenticated
using (id = auth.uid() or employer_id = auth.uid() or is_admin());

drop policy if exists "Profiles own update" on public.profiles;
create policy "Profiles own update" on public.profiles
for update to authenticated
using (id = auth.uid() or is_admin())
with check (id = auth.uid() or is_admin());

drop policy if exists "Profiles own insert" on public.profiles;
create policy "Profiles own insert" on public.profiles
for insert to authenticated
with check (id = auth.uid());

drop policy if exists "Profiles own delete" on public.profiles;
create policy "Profiles own delete" on public.profiles
for delete to authenticated
using (id = auth.uid() or is_admin());

drop policy if exists "Admins manage tasks" on public.tasks;
create policy "Admins manage tasks" on public.tasks
for all to authenticated
using (is_admin())
with check (is_admin());

drop policy if exists "Users read assigned tasks" on public.tasks;
create policy "Users read assigned tasks" on public.tasks
for select to authenticated
using (assigned_to = auth.uid() or created_by = auth.uid() or is_admin());

drop policy if exists "Users create own tasks" on public.tasks;
create policy "Users create own tasks" on public.tasks
for insert to authenticated
with check (created_by = auth.uid() and (assigned_to = auth.uid() or assigned_to is null));

drop policy if exists "Employers create team tasks" on public.tasks;
create policy "Employers create team tasks" on public.tasks
for insert to authenticated
with check (
  created_by = auth.uid()
  and exists (
    select 1
    from public.profiles p
    where p.id = tasks.assigned_to
      and p.employer_id = auth.uid()
  )
);

drop policy if exists "Users update assigned tasks" on public.tasks;
create policy "Users update assigned tasks" on public.tasks
for update to authenticated
using (assigned_to = auth.uid() or created_by = auth.uid() or is_admin())
with check (assigned_to = auth.uid() or created_by = auth.uid() or is_admin());

drop policy if exists "Employers delete own tasks" on public.tasks;
create policy "Employers delete own tasks" on public.tasks
for delete to authenticated
using (created_by = auth.uid() or is_admin());

drop policy if exists "Resellers read own commissions" on public.reseller_commissions;
create policy "Resellers read own commissions" on public.reseller_commissions
for select to authenticated
using (reseller_id = auth.uid() or is_admin());

drop policy if exists "Admins manage commissions" on public.reseller_commissions;
create policy "Admins manage commissions" on public.reseller_commissions
for all to authenticated
using (is_admin())
with check (is_admin());

drop policy if exists "Resellers read own customers" on public.customers;
create policy "Resellers read own customers" on public.customers
for select to authenticated
using (reseller_id = auth.uid() or auth_user_id = auth.uid() or is_admin());

drop policy if exists "Customers manage own customer record" on public.customers;
create policy "Customers manage own customer record" on public.customers
for update to authenticated
using (auth_user_id = auth.uid() or is_admin())
with check (auth_user_id = auth.uid() or is_admin());

drop policy if exists "Resellers read own quotes" on public.quotes;
create policy "Resellers read own quotes" on public.quotes
for select to authenticated
using (
  customer_id = auth.uid()
  or is_admin()
  or exists (
    select 1
    from public.customers c
    where c.auth_user_id = quotes.customer_id
      and c.reseller_id = auth.uid()
  )
);

drop policy if exists "Customers manage own quotes" on public.quotes;
create policy "Customers manage own quotes" on public.quotes
for insert to authenticated
with check (customer_id = auth.uid());

drop policy if exists "Resellers read referred orders" on public.orders;
create policy "Resellers read referred orders" on public.orders
for select to authenticated
using (
  is_admin()
  or exists (
    select 1
    from public.customers c
    where c.id = orders.customer_id
      and c.reseller_id = auth.uid()
  )
  or exists (
    select 1
    from public.customers c
    where c.id = orders.customer_id
      and c.auth_user_id = auth.uid()
  )
);

drop policy if exists "Customers read own invoices" on public.invoices;
create policy "Customers read own invoices" on public.invoices
for select to authenticated
using (
  is_admin()
  or exists (
    select 1
    from public.customers c
    where c.id = invoices.customer_id
      and (c.reseller_id = auth.uid() or c.auth_user_id = auth.uid())
  )
);

drop policy if exists "Customers read own payments" on public.payments;
create policy "Customers read own payments" on public.payments
for select to authenticated
using (
  is_admin()
  or exists (
    select 1
    from public.orders o
    join public.customers c on c.id = o.customer_id
    where o.id = payments.order_id
      and (c.reseller_id = auth.uid() or c.auth_user_id = auth.uid())
  )
);

drop policy if exists "Customers read own receipts" on public.receipts;
create policy "Customers read own receipts" on public.receipts
for select to authenticated
using (
  is_admin()
  or exists (
    select 1
    from public.customers c
    where c.id = receipts.customer_id
      and (c.reseller_id = auth.uid() or c.auth_user_id = auth.uid())
  )
);
