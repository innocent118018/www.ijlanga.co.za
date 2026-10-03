create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.is_active = true
  );
$$;

alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.customers enable row level security;
alter table public.categories enable row level security;
alter table public.services enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_items enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.compliance_documents enable row level security;
alter table public.document_access_logs enable row level security;
alter table public.document_retention_policies enable row level security;
alter table public.coupons enable row level security;
alter table public.tasks enable row level security;
alter table public.audit_logs enable row level security;
alter table public.shelf_companies enable row level security;
alter table public.shelf_bids enable row level security;
alter table public.shelf_company_reviews enable row level security;

create policy "Profiles SELF read"
on public.profiles
for select
using (id = auth.uid());

create policy "Profiles SELF update"
on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());

create policy "Admins manage profiles"
on public.profiles
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Users view their own roles"
on public.user_roles
for select
using (profile_id = auth.uid());

create policy "Admins manage user roles"
on public.user_roles
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Customers read own customer record"
on public.customers
for select
using (profile_id = auth.uid() or public.is_admin());

create policy "Customers update own customer record"
on public.customers
for update
using (profile_id = auth.uid() or public.is_admin())
with check (profile_id = auth.uid() or public.is_admin());

create policy "Admins manage customers"
on public.customers
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Open read active catalog"
on public.categories
for select
using (true);

create policy "Open read active services"
on public.services
for select
using (is_public = true and is_active = true);

create policy "Admins manage catalog"
on public.services
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Customers read own quotes"
on public.quotes
for select
using (
  exists (
    select 1 from public.customers c
    where c.id = quotes.customer_id and c.profile_id = auth.uid()
  ) or public.is_admin()
);

create policy "Customers create own quotes"
on public.quotes
for insert
with check (
  exists (
    select 1 from public.customers c
    where c.id = customer_id and c.profile_id = auth.uid()
  ) or public.is_admin()
);

create policy "Customers/admins update own quotes"
on public.quotes
for update
using (
  exists (
    select 1 from public.customers c
    where c.id = quotes.customer_id and c.profile_id = auth.uid()
  ) or public.is_admin()
)
with check (
  exists (
    select 1 from public.customers c
    where c.id = customer_id and c.profile_id = auth.uid()
  ) or public.is_admin()
);

create policy "Customers read own quote items"
on public.quote_items
for select
using (
  exists (
    select 1 from public.quotes q
    join public.customers c on c.id = q.customer_id
    where q.id = quote_items.quote_id and c.profile_id = auth.uid()
  ) or public.is_admin()
);

create policy "Admins manage quote items"
on public.quote_items
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Customers read own orders"
on public.orders
for select
using (
  exists (
    select 1 from public.customers c
    where c.id = orders.customer_id and c.profile_id = auth.uid()
  ) or public.is_admin()
);

create policy "Admins manage orders"
on public.orders
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Customers read own order items"
on public.order_items
for select
using (
  exists (
    select 1 from public.orders o
    join public.customers c on c.id = o.customer_id
    where o.id = order_items.order_id and c.profile_id = auth.uid()
  ) or public.is_admin()
);

create policy "Admins manage order items"
on public.order_items
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Customers read own invoices"
on public.invoices
for select
using (
  exists (
    select 1 from public.customers c
    where c.id = invoices.customer_id and c.profile_id = auth.uid()
  ) or public.is_admin()
);

create policy "Admins manage invoices"
on public.invoices
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Customers read own invoice items"
on public.invoice_items
for select
using (
  exists (
    select 1 from public.invoices i
    join public.customers c on c.id = i.customer_id
    where i.id = invoice_items.invoice_id and c.profile_id = auth.uid()
  ) or public.is_admin()
);

create policy "Admins manage invoice items"
on public.invoice_items
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Customers read own payments"
on public.payments
for select
using (
  exists (
    select 1 from public.customers c
    where c.id = payments.customer_id and c.profile_id = auth.uid()
  ) or public.is_admin()
);

create policy "Admins manage payments"
on public.payments
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Payment provider events can be inserted"
on public.payment_events
for insert
with check (true);

create policy "Admins manage retention policies"
on public.document_retention_policies
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Customers read own compliance docs"
on public.compliance_documents
for select
using (
  exists (
    select 1 from public.customers c
    where c.id = compliance_documents.customer_id and c.profile_id = auth.uid()
  ) or public.is_admin()
);

create policy "Admins manage compliance docs"
on public.compliance_documents
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Only admins read access logs"
on public.document_access_logs
for select
using (public.is_admin());

create policy "Users can log own doc access"
on public.document_access_logs
for insert
with check (
  actor_id = auth.uid() or public.is_admin()
);

create policy "Only admins read audit logs"
on public.audit_logs
for select
using (public.is_admin());

create policy "No updates to audit logs"
on public.audit_logs
for update using (false);

create policy "No deletes to audit logs"
on public.audit_logs
for delete using (false);

create policy "Audit inserts via server only"
on public.audit_logs
for insert
with check (public.is_admin() or true);

create policy "Public read active shelf companies"
on public.shelf_companies
for select
using (status = 'active');

create policy "Users may submit bids"
on public.shelf_bids
for insert
with check (bidder_id = auth.uid());

create policy "Users read own bids or admins"
on public.shelf_bids
for select
using (bidder_id = auth.uid() or public.is_admin());

create policy "Admins manage shelf companies"
on public.shelf_companies
for all
using (public.is_admin())
with check (public.is_admin());

create policy "Admins manage shelf reviews"
on public.shelf_company_reviews
for all
using (public.is_admin())
with check (public.is_admin());

create policy "User sees own tasks"
on public.tasks
for select
using (assigned_to = auth.uid() or created_by = auth.uid() or public.is_admin());

create policy "Task owners/admins manage tasks"
on public.tasks
for all
using (assigned_to = auth.uid() or created_by = auth.uid() or public.is_admin())
with check (assigned_to = auth.uid() or created_by = auth.uid() or public.is_admin());

create policy "Public read active coupons"
on public.coupons
for select
using (is_active = true);

create policy "Admins manage coupons"
on public.coupons
for all
using (public.is_admin())
with check (public.is_admin());
