begin;

create table if not exists public.accounting_imports (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  created_by uuid not null references auth.users(id) on delete restrict,
  original_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes > 0),
  page_count integer not null default 0 check (page_count between 0 and 1000),
  processed_pages integer not null default 0 check (processed_pages >= 0),
  failed_pages integer not null default 0 check (failed_pages >= 0),
  status text not null default 'awaiting_payment'
    check (status in ('awaiting_payment','queued','processing','review_required','approved','completed','failed','cancelled')),
  payment_status text not null default 'pending'
    check (payment_status in ('pending','verified','exempt','failed','refunded')),
  payment_provider text check (payment_provider in ('payfast','ikhokha','admin_exemption')),
  payment_reference text,
  amount_due numeric(12,2) not null default 0 check (amount_due >= 0),
  exemption_reason text,
  exempted_by uuid references auth.users(id),
  exempted_at timestamptz,
  verified_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((payment_status <> 'exempt') or (exempted_by is not null and exempted_at is not null and nullif(trim(exemption_reason),'') is not null))
);

create table if not exists public.accounting_import_pages (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.accounting_imports(id) on delete cascade,
  page_number integer not null check (page_number between 1 and 1000),
  status text not null default 'pending'
    check (status in ('pending','processing','extracted','needs_review','failed')),
  extracted_text text,
  extraction_data jsonb not null default '{}'::jsonb,
  confidence numeric(5,4) check (confidence between 0 and 1),
  error_message text,
  attempts integer not null default 0 check (attempts >= 0),
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(import_id,page_number)
);

create table if not exists public.accounting_import_transactions (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.accounting_imports(id) on delete cascade,
  page_id uuid references public.accounting_import_pages(id) on delete set null,
  row_number integer not null check (row_number > 0),
  transaction_date date,
  description text not null default '',
  reference text,
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  vat_amount numeric(14,2) not null default 0 check (vat_amount >= 0),
  vat_code text,
  account_id uuid,
  classification text,
  confidence numeric(5,4) check (confidence between 0 and 1),
  duplicate_key text,
  review_status text not null default 'pending'
    check (review_status in ('pending','accepted','rejected','duplicate','posted')),
  source_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(import_id,row_number),
  check (not (debit > 0 and credit > 0))
);

create table if not exists public.accounting_chart_accounts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  code text not null,
  name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','income','expense')),
  tax_code text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(customer_id,code),
  unique(customer_id,id)
);

alter table public.accounting_import_transactions
  add constraint accounting_import_transactions_account_fk
  foreign key (account_id) references public.accounting_chart_accounts(id) on delete restrict;

create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  starts_on date not null,
  ends_on date not null,
  is_closed boolean not null default false,
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  unique(customer_id,starts_on,ends_on),
  check (ends_on >= starts_on),
  check (not is_closed or (closed_by is not null and closed_at is not null))
);

create table if not exists public.accounting_journals (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  import_id uuid references public.accounting_imports(id) on delete restrict,
  journal_number text not null,
  journal_date date not null,
  memo text not null default '',
  status text not null default 'draft' check (status in ('draft','posted','reversed')),
  posted_by uuid references auth.users(id),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique(customer_id,journal_number),
  unique(customer_id,id),
  check (status <> 'posted' or (posted_by is not null and posted_at is not null))
);

create table if not exists public.accounting_journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.accounting_journals(id) on delete cascade,
  account_id uuid not null references public.accounting_chart_accounts(id) on delete restrict,
  description text not null default '',
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  vat_code text,
  vat_amount numeric(14,2) not null default 0 check (vat_amount >= 0),
  created_at timestamptz not null default now(),
  check (not (debit > 0 and credit > 0))
);

create table if not exists public.accounting_reconciliations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  account_id uuid not null references public.accounting_chart_accounts(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  statement_opening numeric(14,2) not null default 0,
  statement_closing numeric(14,2) not null default 0,
  status text not null default 'in_progress' check (status in ('in_progress','review_required','completed')),
  completed_by uuid references auth.users(id),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (period_end >= period_start),
  check (status <> 'completed' or (completed_by is not null and completed_at is not null))
);

create table if not exists public.accounting_reconciliation_items (
  id uuid primary key default gen_random_uuid(),
  reconciliation_id uuid not null references public.accounting_reconciliations(id) on delete cascade,
  transaction_id uuid references public.accounting_import_transactions(id) on delete set null,
  statement_date date,
  description text not null default '',
  amount numeric(14,2) not null,
  matched boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_report_requests (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete restrict,
  requested_by uuid not null references auth.users(id),
  report_type text not null check (report_type in ('trial_balance','general_ledger','income_statement','balance_sheet','vat201_summary','accounts_receivable','accounts_payable','bank_reconciliation')),
  period_start date,
  period_end date,
  format text not null default 'pdf' check (format in ('pdf','xlsx','csv','xml','json')),
  status text not null default 'pending' check (status in ('pending','generating','admin_review','released','rejected','failed')),
  output_path text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (period_end is null or period_start is null or period_end >= period_start)
);

create table if not exists public.accounting_audit_log (
  id bigint generated always as identity primary key,
  customer_id uuid references public.customers(id) on delete restrict,
  actor_id uuid references auth.users(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists accounting_imports_customer_created_idx on public.accounting_imports(customer_id,created_at desc);
create index if not exists accounting_pages_import_status_idx on public.accounting_import_pages(import_id,status,page_number);
create index if not exists accounting_transactions_import_idx on public.accounting_import_transactions(import_id,review_status);
create index if not exists accounting_journals_customer_date_idx on public.accounting_journals(customer_id,journal_date);
create index if not exists accounting_report_requests_customer_idx on public.accounting_report_requests(customer_id,created_at desc);

alter table public.accounting_imports enable row level security;
alter table public.accounting_import_pages enable row level security;
alter table public.accounting_import_transactions enable row level security;
alter table public.accounting_chart_accounts enable row level security;
alter table public.accounting_periods enable row level security;
alter table public.accounting_journals enable row level security;
alter table public.accounting_journal_lines enable row level security;
alter table public.accounting_reconciliations enable row level security;
alter table public.accounting_reconciliation_items enable row level security;
alter table public.accounting_report_requests enable row level security;
alter table public.accounting_audit_log enable row level security;

create policy "accounting_imports_read_own_or_admin" on public.accounting_imports
for select to authenticated using (customer_id = public.current_customer_id() or public.is_admin());
create policy "accounting_imports_create_own" on public.accounting_imports
for insert to authenticated with check (customer_id = public.current_customer_id() and created_by = auth.uid());
create policy "accounting_imports_admin_update" on public.accounting_imports
for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "accounting_pages_read_via_import" on public.accounting_import_pages
for select to authenticated using (exists(select 1 from public.accounting_imports i where i.id=import_id and (i.customer_id=public.current_customer_id() or public.is_admin())));
create policy "accounting_transactions_read_via_import" on public.accounting_import_transactions
for select to authenticated using (exists(select 1 from public.accounting_imports i where i.id=import_id and (i.customer_id=public.current_customer_id() or public.is_admin())));

create policy "accounting_chart_accounts_read_own_or_admin" on public.accounting_chart_accounts
for select to authenticated using (customer_id=public.current_customer_id() or public.is_admin());
create policy "accounting_chart_accounts_admin_manage" on public.accounting_chart_accounts
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "accounting_periods_read_own_or_admin" on public.accounting_periods
for select to authenticated using (customer_id=public.current_customer_id() or public.is_admin());
create policy "accounting_periods_admin_manage" on public.accounting_periods
for all to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "accounting_journals_read_own_or_admin" on public.accounting_journals
for select to authenticated using (customer_id=public.current_customer_id() or public.is_admin());
create policy "accounting_journal_lines_read_via_journal" on public.accounting_journal_lines
for select to authenticated using (exists(select 1 from public.accounting_journals j where j.id=journal_id and (j.customer_id=public.current_customer_id() or public.is_admin())));

create policy "accounting_reconciliations_read_own_or_admin" on public.accounting_reconciliations
for select to authenticated using (customer_id=public.current_customer_id() or public.is_admin());
create policy "accounting_reconciliation_items_read_via_reconciliation" on public.accounting_reconciliation_items
for select to authenticated using (exists(select 1 from public.accounting_reconciliations r where r.id=reconciliation_id and (r.customer_id=public.current_customer_id() or public.is_admin())));

create policy "accounting_reports_read_own_or_admin" on public.accounting_report_requests
for select to authenticated using (customer_id=public.current_customer_id() or public.is_admin());
create policy "accounting_reports_create_own" on public.accounting_report_requests
for insert to authenticated with check (customer_id=public.current_customer_id() and requested_by=auth.uid());
create policy "accounting_reports_admin_manage" on public.accounting_report_requests
for update to authenticated using (public.is_admin()) with check (public.is_admin());

create policy "accounting_audit_read_admin_only" on public.accounting_audit_log
for select to authenticated using (public.is_admin());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('accounting-imports','accounting-imports',false,52428800,
  array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','application/xml','text/xml','application/json','image/jpeg','image/png','image/tiff','image/webp'])
on conflict (id) do nothing;

create policy "accounting_storage_read_own_or_admin" on storage.objects
for select to authenticated using (
  bucket_id='accounting-imports' and exists (
    select 1 from public.accounting_imports i
    where i.storage_path=name and (i.customer_id=public.current_customer_id() or public.is_admin())
  )
);
create policy "accounting_storage_insert_own" on storage.objects
for insert to authenticated with check (
  bucket_id='accounting-imports' and (storage.foldername(name))[1]=public.current_customer_id()::text
);

commit;