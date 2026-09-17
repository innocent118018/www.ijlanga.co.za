-- Role-based dashboard schema for IJ Langa Consulting.
-- Applied to the connected Supabase project on 2026-09-17.

alter table public.profiles add column if not exists employer_id uuid references public.profiles(id) on delete set null;
alter table public.profiles add column if not exists organization_name text;
alter table public.customers add column if not exists reseller_id uuid references public.profiles(id) on delete set null;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'pending' check (status in ('pending','in_progress','completed','cancelled')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  due_date date,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reseller_commissions (
  id uuid primary key default gen_random_uuid(),
  reseller_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric not null default 0 check (amount >= 0),
  status text not null default 'pending' check (status in ('pending','approved','paid','cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(reseller_id, order_id)
);

alter table public.tasks enable row level security;
alter table public.reseller_commissions enable row level security;

create index if not exists idx_profiles_employer_id on public.profiles(employer_id);
create index if not exists idx_customers_reseller_id on public.customers(reseller_id);
create index if not exists idx_tasks_assigned_to on public.tasks(assigned_to);
create index if not exists idx_tasks_created_by on public.tasks(created_by);
create index if not exists idx_tasks_customer_id on public.tasks(customer_id);
create index if not exists idx_commissions_reseller_id on public.reseller_commissions(reseller_id);

 drop policy if exists "Employers can read team profiles" on public.profiles;
create policy "Employers can read team profiles" on public.profiles for select to authenticated
using (employer_id = (select auth.uid()) or id = (select auth.uid()));

drop policy if exists "Admins manage tasks" on public.tasks;
create policy "Admins manage tasks" on public.tasks for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "Users read assigned tasks" on public.tasks;
create policy "Users read assigned tasks" on public.tasks for select to authenticated using (assigned_to = (select auth.uid()) or created_by = (select auth.uid()));
drop policy if exists "Users create own tasks" on public.tasks;
create policy "Users create own tasks" on public.tasks for insert to authenticated with check (created_by = (select auth.uid()) and (assigned_to = (select auth.uid()) or assigned_to is null));
drop policy if exists "Employers create team tasks" on public.tasks;
create policy "Employers create team tasks" on public.tasks for insert to authenticated with check (created_by = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = tasks.assigned_to and p.employer_id = (select auth.uid())));
drop policy if exists "Users update assigned tasks" on public.tasks;
create policy "Users update assigned tasks" on public.tasks for update to authenticated using (assigned_to = (select auth.uid()) or created_by = (select auth.uid()) or is_admin()) with check (assigned_to = (select auth.uid()) or created_by = (select auth.uid()) or is_admin());
drop policy if exists "Employers delete own tasks" on public.tasks;
create policy "Employers delete own tasks" on public.tasks for delete to authenticated using (created_by = (select auth.uid()) or is_admin());

drop policy if exists "Admins manage commissions" on public.reseller_commissions;
create policy "Admins manage commissions" on public.reseller_commissions for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "Resellers read own commissions" on public.reseller_commissions;
create policy "Resellers read own commissions" on public.reseller_commissions for select to authenticated using (reseller_id = (select auth.uid()));

drop policy if exists "Resellers read own customers" on public.customers;
create policy "Resellers read own customers" on public.customers for select to authenticated using (reseller_id = (select auth.uid()) or auth_user_id = (select auth.uid()) or is_admin());
drop policy if exists "Resellers read own quotes" on public.quotes;
create policy "Resellers read own quotes" on public.quotes for select to authenticated using ((customer_id = (select auth.uid())) or is_admin() or exists (select 1 from public.customers c where c.auth_user_id = quotes.customer_id and c.reseller_id = (select auth.uid())));
drop policy if exists "Resellers read referred orders" on public.orders;
create policy "Resellers read referred orders" on public.orders for select to authenticated using (is_admin() or exists (select 1 from public.customers c where c.id = orders.customer_id and c.reseller_id = (select auth.uid())) or exists (select 1 from public.customers c where c.id = orders.customer_id and c.auth_user_id = (select auth.uid())));
drop policy if exists "Resellers read referred invoices" on public.invoices;
create policy "Resellers read referred invoices" on public.invoices for select to authenticated using (is_admin() or exists (select 1 from public.customers c where c.id = invoices.customer_id and c.reseller_id = (select auth.uid())) or exists (select 1 from public.customers c where c.id = invoices.customer_id and c.auth_user_id = (select auth.uid())));
drop policy if exists "Resellers read referred payments" on public.payments;
create policy "Resellers read referred payments" on public.payments for select to authenticated using (is_admin() or exists (select 1 from public.orders o join public.customers c on c.id=o.customer_id where o.id=payments.order_id and (c.reseller_id=(select auth.uid()) or c.auth_user_id=(select auth.uid()))));
drop policy if exists "Resellers read referred receipts" on public.receipts;
create policy "Resellers read referred receipts" on public.receipts for select to authenticated using (is_admin() or exists (select 1 from public.customers c where c.id=receipts.customer_id and (c.reseller_id=(select auth.uid()) or c.auth_user_id=(select auth.uid()))));
