create extension if not exists pgcrypto;

create type public.role_type as enum (
  'admin',
  'employee',
  'employer',
  'client',
  'reseller'
);

create type public.quote_status as enum (
  'draft',
  'pending_review',
  'sent',
  'accepted',
  'rejected',
  'expired'
);

create type public.order_status as enum (
  'draft',
  'pending',
  'approved',
  'in_progress',
  'awaiting_payment',
  'paid',
  'partially_paid',
  'cancelled',
  'completed'
);

create type public.invoice_status as enum (
  'draft',
  'issued',
  'paid',
  'partially_paid',
  'overdue',
  'cancelled'
);

create type public.payment_provider as enum ('payfast', 'ikhokha', 'manual');

create type public.payment_status as enum (
  'pending',
  'authorized',
  'paid',
  'failed',
  'cancelled',
  'refunded'
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  phone text,
  organization_name text,
  employer_id uuid references public.profiles(id) on delete set null,
  role public.role_type not null default 'client',
  is_active boolean not null default false,
  approval_status text not null default 'pending',
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role public.role_type not null,
  created_at timestamptz not null default now(),
  unique (profile_id, role)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique,
  description text,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete set null,
  sku text not null unique,
  slug text not null unique,
  name text not null,
  description text,
  price numeric(12,2) not null default 0,
  currency text not null default 'ZAR',
  is_active boolean not null default true,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  company_name text,
  contact_name text,
  email text not null,
  phone text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_number text not null unique,
  customer_id uuid not null references public.customers(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  status public.quote_status not null default 'draft',
  subtotal numeric(12,2) not null default 0,
  vat_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  currency text not null default 'ZAR',
  notes text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  sku text,
  service_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references public.customers(id) on delete cascade,
  quote_id uuid references public.quotes(id) on delete set null,
  status public.order_status not null default 'draft',
  subtotal numeric(12,2) not null default 0,
  vat_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  currency text not null default 'ZAR',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  sku text,
  service_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  status public.invoice_status not null default 'draft',
  issue_date timestamptz not null default now(),
  due_date timestamptz,
  subtotal numeric(12,2) not null default 0,
  vat_amount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0,
  currency text not null default 'ZAR',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  sku text,
  service_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  unit_price numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0,
  created_at timestamptz not null default now()
);

create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  discount_type text not null check (discount_type in ('percentage', 'fixed')),
  discount_value numeric(12,2) not null default 0,
  min_subtotal numeric(12,2) not null default 0,
  is_active boolean not null default true,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  order_id uuid references public.orders(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  provider public.payment_provider not null,
  provider_reference text,
  external_reference text,
  amount numeric(12,2) not null default 0,
  currency text not null default 'ZAR',
  status public.payment_status not null default 'pending',
  metadata jsonb default '{}'::jsonb,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, provider_reference)
);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  provider public.payment_provider not null,
  provider_event_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  signature_valid boolean not null default false,
  processed_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create table public.document_retention_policies (
  id uuid primary key default gen_random_uuid(),
  document_type text not null unique,
  retention_days integer not null default 1825,
  is_active boolean not null default true,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.compliance_documents (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers(id) on delete cascade,
  document_type text not null,
  file_name text not null,
  storage_path text not null,
  mime_type text,
  uploaded_by uuid references public.profiles(id) on delete set null,
  is_private boolean not null default true,
  retention_until timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.document_access_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.compliance_documents(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('upload','view','download','delete')),
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  assigned_to uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  status text not null default 'pending' check (status in ('pending','in_progress','completed','cancelled')),
  due_date timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id) on delete set null,
  table_name text not null,
  record_id uuid not null,
  action text not null check (action in ('insert','update','delete')),
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create table public.shelf_companies (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  registration_number text,
  status text not null default 'draft' check (status in ('draft','active','sold','archived')),
  proposed_amount numeric(12,2) not null default 0,
  auction_start timestamptz,
  auction_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.shelf_bids (
  id uuid primary key default gen_random_uuid(),
  shelf_company_id uuid not null references public.shelf_companies(id) on delete cascade,
  bidder_id uuid not null references public.profiles(id) on delete cascade,
  bid_amount numeric(12,2) not null default 0,
  status text not null default 'submitted' check (status in ('submitted','accepted','rejected','withdrawn')),
  created_at timestamptz not null default now(),
  unique (shelf_company_id, bidder_id, bid_amount)
);

create table public.shelf_company_reviews (
  id uuid primary key default gen_random_uuid(),
  shelf_company_id uuid not null references public.shelf_companies(id) on delete cascade,
  business_overview text,
  historical_financials text,
  current_year_performance text,
  indicative_valuation text,
  assets_and_customers text,
  shareholder_structure text,
  sale_rationale text,
  material_matters text,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (shelf_company_id)
);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create or replace function public.generate_quote_number()
returns trigger as $$
begin
  if new.quote_number is null or new.quote_number = '' then
    new.quote_number := 'Q-' || to_char(now(), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 8);
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.generate_order_number()
returns trigger as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := 'O-' || to_char(now(), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 8);
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.generate_invoice_number()
returns trigger as $$
begin
  if new.invoice_number is null or new.invoice_number = '' then
    new.invoice_number := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || substr(md5(random()::text), 1, 8);
  end if;
  return new;
end;
$$ language plpgsql;

create or replace function public.capture_audit_log()
returns trigger as $$
declare
  old_payload jsonb := null;
  new_payload jsonb := null;
begin
  if tg_op = 'UPDATE' then
    old_payload := row_to_json(old)::jsonb;
    new_payload := row_to_json(new)::jsonb;
    insert into public.audit_logs(actor_id, table_name, record_id, action, old_values, new_values)
    values (
      coalesce(current_setting('request.jwt.claims', true)::jsonb->>'sub', null)::uuid,
      tg_table_schema || '.' || tg_table_name,
      new.id,
      'update',
      old_payload,
      new_payload
    );
    return new;
  elsif tg_op = 'INSERT' then
    new_payload := row_to_json(new)::jsonb;
    insert into public.audit_logs(actor_id, table_name, record_id, action, old_values, new_values)
    values (
      coalesce(current_setting('request.jwt.claims', true)::jsonb->>'sub', null)::uuid,
      tg_table_schema || '.' || tg_table_name,
      new.id,
      'insert',
      null,
      new_payload
    );
    return new;
  elsif tg_op = 'DELETE' then
    old_payload := row_to_json(old)::jsonb;
    insert into public.audit_logs(actor_id, table_name, record_id, action, old_values, new_values)
    values (
      coalesce(current_setting('request.jwt.claims', true)::jsonb->>'sub', null)::uuid,
      tg_table_schema || '.' || tg_table_name,
      old.id,
      'delete',
      old_payload,
      null
    );
    return old;
  end if;
  return null;
end;
$$ language plpgsql;

create trigger profiles_set_updated_at before update on public.profiles for each row execute procedure public.set_updated_at();
create trigger categories_set_updated_at before update on public.categories for each row execute procedure public.set_updated_at();
create trigger services_set_updated_at before update on public.services for each row execute procedure public.set_updated_at();
create trigger customers_set_updated_at before update on public.customers for each row execute procedure public.set_updated_at();
create trigger quotes_set_updated_at before update on public.quotes for each row execute procedure public.set_updated_at();
create trigger quote_items_set_updated_at before update on public.quote_items for each row execute procedure public.set_updated_at();
create trigger orders_set_updated_at before update on public.orders for each row execute procedure public.set_updated_at();
create trigger invoices_set_updated_at before update on public.invoices for each row execute procedure public.set_updated_at();
create trigger coupons_set_updated_at before update on public.coupons for each row execute procedure public.set_updated_at();
create trigger payments_set_updated_at before update on public.payments for each row execute procedure public.set_updated_at();
create trigger compliance_documents_set_updated_at before update on public.compliance_documents for each row execute procedure public.set_updated_at();
create trigger shelf_companies_set_updated_at before update on public.shelf_companies for each row execute procedure public.set_updated_at();
create trigger quote_number_generate before insert or update on public.quotes for each row execute procedure public.generate_quote_number();
create trigger order_number_generate before insert or update on public.orders for each row execute procedure public.generate_order_number();
create trigger invoice_number_generate before insert or update on public.invoices for each row execute procedure public.generate_invoice_number();

create trigger audit_profiles after insert or update or delete on public.profiles for each row execute procedure public.capture_audit_log();
create trigger audit_user_roles after insert or update or delete on public.user_roles for each row execute procedure public.capture_audit_log();
create trigger audit_services after insert or update or delete on public.services for each row execute procedure public.capture_audit_log();
create trigger audit_quotes after insert or update or delete on public.quotes for each row execute procedure public.capture_audit_log();
create trigger audit_quote_items after insert or update or delete on public.quote_items for each row execute procedure public.capture_audit_log();
create trigger audit_orders after insert or update or delete on public.orders for each row execute procedure public.capture_audit_log();
create trigger audit_invoices after insert or update or delete on public.invoices for each row execute procedure public.capture_audit_log();
create trigger audit_payments after insert or update or delete on public.payments for each row execute procedure public.capture_audit_log();
create trigger audit_compliance_documents after insert or update or delete on public.compliance_documents for each row execute procedure public.capture_audit_log();
create trigger audit_coupons after insert or update or delete on public.coupons for each row execute procedure public.capture_audit_log();
create trigger audit_shelf_companies after insert or update or delete on public.shelf_companies for each row execute procedure public.capture_audit_log();
create trigger audit_shelf_bids after insert or update or delete on public.shelf_bids for each row execute procedure public.capture_audit_log();

create index idx_profiles_role on public.profiles(role);
create index idx_profiles_employer_id on public.profiles(employer_id);
create index idx_services_category on public.services(category_id);
create index idx_quotes_customer on public.quotes(customer_id);
create index idx_quote_items_quote on public.quote_items(quote_id);
create index idx_orders_customer on public.orders(customer_id);
create index idx_invoices_customer on public.invoices(customer_id);
create index idx_payments_customer on public.payments(customer_id);
create index idx_payments_order on public.payments(order_id);
create index idx_compliance_documents_customer on public.compliance_documents(customer_id);
create index idx_document_access_logs_document on public.document_access_logs(document_id);
create index idx_audit_logs_record on public.audit_logs(table_name, record_id);
create index idx_shelf_bids_company on public.shelf_bids(shelf_company_id);
