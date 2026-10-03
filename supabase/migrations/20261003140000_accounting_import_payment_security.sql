begin;

create table if not exists public.accounting_import_payment_attempts (
  id uuid primary key default gen_random_uuid(),
  import_id uuid not null references public.accounting_imports(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null check (provider in ('payfast','ikhokha')),
  reference text not null unique,
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending','successful','failed','refunded')),
  provider_transaction_id text,
  metadata jsonb not null default '{}'::jsonb,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists accounting_import_payment_attempts_import_idx
  on public.accounting_import_payment_attempts(import_id, created_at desc);
create unique index if not exists accounting_import_one_pending_payment_idx
  on public.accounting_import_payment_attempts(import_id) where status = 'pending';

update storage.buckets
set allowed_mime_types = array[
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'application/xml',
  'text/xml',
  'application/json',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/bmp',
  'image/gif',
  'image/webp'
]
where id = 'accounting-imports';

drop policy if exists "accounting_imports_admin_insert" on public.accounting_imports;
create policy "accounting_imports_admin_insert"
  on public.accounting_imports for insert to authenticated
  with check (public.is_admin());

drop policy if exists "accounting_storage_admin_insert" on storage.objects;
create policy "accounting_storage_admin_insert"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'accounting-imports' and public.is_admin());

alter table public.accounting_imports
  add column if not exists document_type text not null default 'unclassified'
    check (document_type in ('sales_invoice','purchase_invoice','sales_quote','purchase_quote','sales_order','purchase_order','sales_credit_note','purchase_credit_note','expense_receipt','customer_receipt','supplier_payment','invoice_unclassified','quote_unclassified','credit_note_unclassified','unclassified')),
  add column if not exists document_number text,
  add column if not exists party_name text,
  add column if not exists issue_date date,
  add column if not exists due_date date,
  add column if not exists subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  add column if not exists vat_amount numeric(14,2) not null default 0 check (vat_amount >= 0),
  add column if not exists total numeric(14,2) not null default 0 check (total >= 0);

alter table public.accounting_import_payment_attempts enable row level security;
revoke all on public.accounting_import_payment_attempts from anon, authenticated;
grant select on public.accounting_import_payment_attempts to authenticated;
grant all on public.accounting_import_payment_attempts to service_role;

create policy "accounting_import_payments_read_own_or_admin"
  on public.accounting_import_payment_attempts
  for select to authenticated
  using (
    public.is_admin()
    or exists (
      select 1 from public.accounting_imports i
      where i.id = import_id
        and (i.created_by = auth.uid() or i.customer_id = public.current_customer_id())
    )
  );

drop policy if exists "accounting_transactions_admin_manage" on public.accounting_import_transactions;
create policy "accounting_transactions_admin_manage"
  on public.accounting_import_transactions
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create or replace function public.accounting_discount_percent(p_pages integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case
    when greatest(coalesce(p_pages, 0), 0) > 100 then 15::numeric
    when greatest(coalesce(p_pages, 0), 0) > 30 then 3::numeric
    when greatest(coalesce(p_pages, 0), 0) > 20 then 2::numeric
    else 0::numeric
  end;
$$;

create or replace function public.accounting_calculate_charge(p_pages integer)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select round(
    greatest(coalesce(p_pages, 0), 0) * 10
      * (1 - public.accounting_discount_percent(p_pages) / 100),
    2
  );
$$;

create or replace function public.guard_accounting_import_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  new.created_by := auth.uid();
  new.customer_user_id := auth.uid();
  new.page_count := 0;
  new.processed_pages := 0;
  new.failed_pages := 0;
  new.status := 'awaiting_payment';
  new.payment_status := 'pending';
  new.payment_provider := null;
  new.payment_reference := null;
  new.amount_due := 0;
  new.exemption_reason := null;
  new.exempted_by := null;
  new.exempted_at := null;
  new.verified_at := null;
  new.discount_percent := 0;
  new.price_per_page := 10;
  new.report_release_status := 'not_requested';
  new.source_retention_locked := true;
  return new;
end;
$$;

drop trigger if exists guard_accounting_import_insert on public.accounting_imports;
create trigger guard_accounting_import_insert
before insert on public.accounting_imports
for each row execute function public.guard_accounting_import_insert();

alter table public.accounting_report_requests
  add column if not exists import_id uuid references public.accounting_imports(id) on delete restrict;

create index if not exists accounting_report_requests_import_idx
  on public.accounting_report_requests(import_id, created_at desc);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'accounting-reports',
  'accounting-reports',
  false,
  52428800,
  array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/csv','application/xml','text/xml','application/json']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "accounting_reports_storage_read_own_or_admin" on storage.objects;
create policy "accounting_reports_storage_read_own_or_admin"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'accounting-reports'
    and exists (
      select 1 from public.accounting_report_requests r
      where r.output_path = name
        and (r.customer_id = public.current_customer_id() or public.is_admin())
        and r.status = 'released'
    )
  );

drop policy if exists "accounting_reports_storage_admin_upload" on storage.objects;
create policy "accounting_reports_storage_admin_upload"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'accounting-reports' and public.is_admin());

create or replace function public.guard_accounting_report_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.accounting_imports%rowtype;
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.import_id is null then
    raise exception 'A paid, reviewed import is required for report generation';
  end if;

  select * into v_import
  from public.accounting_imports
  where id = new.import_id
    and customer_id = new.customer_id
    and (created_by = auth.uid() or customer_user_id = auth.uid())
  for share;

  if not found then
    raise exception 'Import not found or access denied';
  end if;
  if v_import.payment_status not in ('verified','exempt') then
    raise exception 'Verified payment is required before report generation';
  end if;
  if v_import.status <> 'completed' then
    raise exception 'The import must be posted before report generation';
  end if;
  if exists (
    select 1 from public.accounting_import_pages p
    where p.import_id = v_import.id and p.status not in ('extracted','needs_review')
  ) then
    raise exception 'Every import page must finish processing before report generation';
  end if;

  new.requested_by := auth.uid();
  new.status := 'admin_review';
  new.output_path := null;
  new.reviewed_by := null;
  new.reviewed_at := null;
  update public.accounting_imports
  set report_release_status = 'requested', updated_at = now()
  where id = v_import.id;
  return new;
end;
$$;

drop trigger if exists guard_accounting_report_request on public.accounting_report_requests;
create trigger guard_accounting_report_request
before insert on public.accounting_report_requests
for each row execute function public.guard_accounting_report_request();

create or replace function public.guard_accounting_report_release()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'released' and old.status is distinct from 'released' then
    if auth.uid() is null or not public.is_admin() then
      raise exception 'Administrator access required to release reports';
    end if;
    if nullif(trim(new.output_path), '') is null then
      raise exception 'A stored report file is required before release';
    end if;
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;

  if new.import_id is not null and new.status is distinct from old.status then
    update public.accounting_imports
    set report_release_status = case
          when new.status = 'released' then 'released'
          when new.status = 'rejected' then 'rejected'
          else 'under_review'
        end,
        updated_at = now()
    where id = new.import_id;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_accounting_report_release on public.accounting_report_requests;
create trigger guard_accounting_report_release
before update on public.accounting_report_requests
for each row execute function public.guard_accounting_report_release();

create or replace function public.record_accounting_import_payment(
  p_provider text,
  p_reference text,
  p_status text,
  p_provider_transaction_id text,
  p_amount numeric,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.accounting_import_payment_attempts%rowtype;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if p_status not in ('successful','failed','refunded') then
    raise exception 'Invalid payment status';
  end if;

  select * into v_payment
  from public.accounting_import_payment_attempts
  where provider = p_provider and reference = p_reference
  for update;
  if not found then raise exception 'Import payment reference not found'; end if;
  if abs(v_payment.amount - coalesce(p_amount, 0)) > 0.01 then
    raise exception 'Import payment amount mismatch';
  end if;
  if v_payment.status = p_status then
    return v_payment.import_id;
  end if;
  if v_payment.status <> 'pending' then
    raise exception 'Import payment is no longer pending';
  end if;

  update public.accounting_import_payment_attempts
  set status = p_status,
      provider_transaction_id = p_provider_transaction_id,
      metadata = coalesce(metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
      verified_at = case when p_status = 'successful' then now() else null end,
      updated_at = now()
  where id = v_payment.id;

  update public.accounting_imports
  set payment_status = case
        when p_status = 'successful' then 'verified'
        when p_status = 'refunded' then 'refunded'
        else 'failed'
      end,
      payment_provider = p_provider,
      payment_reference = p_reference,
      verified_at = case when p_status = 'successful' then now() else null end,
      status = case when p_status = 'successful' then 'queued' else 'awaiting_payment' end,
      updated_at = now()
  where id = v_payment.import_id;

  return v_payment.import_id;
end;
$$;

revoke all on function public.record_accounting_import_payment(text,text,text,text,numeric,jsonb) from public, anon, authenticated;
grant execute on function public.record_accounting_import_payment(text,text,text,text,numeric,jsonb) to service_role;

create or replace function public.save_accounting_import_extraction(
  p_import_id uuid,
  p_pages jsonb,
  p_transactions jsonb,
  p_document_metadata jsonb default '{}'::jsonb,
  p_finalize boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.accounting_imports%rowtype;
  v_page_count integer;
  v_failed_count integer;
  v_transaction_count integer;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;
  if jsonb_typeof(p_pages) is distinct from 'array' or jsonb_typeof(p_transactions) is distinct from 'array' then
    raise exception 'Pages and transactions must be arrays';
  end if;
  if jsonb_array_length(p_pages) > 10 then
    raise exception 'Extraction batches are limited to 10 pages';
  end if;

  select * into v_import
  from public.accounting_imports
  where id = p_import_id
  for update;
  if not found then raise exception 'Accounting import not found'; end if;
  if v_import.payment_status not in ('verified','exempt') then
    raise exception 'Verified payment is required before extraction';
  end if;
  if v_import.status not in ('queued','processing','failed') then
    raise exception 'Accounting import is not ready for extraction';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_transactions) as tx(account_id uuid)
    where tx.account_id is not null
      and not exists (
        select 1 from public.accounting_chart_accounts a
        where a.id = tx.account_id and a.customer_id = v_import.customer_id
      )
  ) then raise exception 'Transaction account must belong to the import customer'; end if;
  if exists (
    select 1 from jsonb_to_recordset(p_pages) as incoming_page(page_number integer)
    where incoming_page.page_number < 1 or incoming_page.page_number > v_import.page_count
  ) then
    raise exception 'Extraction batch includes an invalid page number';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_pages) as incoming_page(page_number integer)
    group by incoming_page.page_number having count(*) > 1
  ) then
    raise exception 'Extraction batch contains duplicate page numbers';
  end if;
  if exists (
    select 1 from public.accounting_import_transactions tx
    join public.accounting_import_pages page on page.id = tx.page_id
    join jsonb_to_recordset(p_pages) as incoming_page(page_number integer)
      on incoming_page.page_number = page.page_number
    where tx.import_id = p_import_id and tx.review_status <> 'pending'
  ) then
    raise exception 'Reviewed extraction rows cannot be replaced';
  end if;

  delete from public.accounting_import_transactions tx
  using public.accounting_import_pages page,
        jsonb_to_recordset(p_pages) as incoming_page(page_number integer)
  where tx.page_id = page.id
    and tx.import_id = p_import_id
    and incoming_page.page_number = page.page_number;
  delete from public.accounting_import_pages page
  using jsonb_to_recordset(p_pages) as incoming_page(page_number integer)
  where page.import_id = p_import_id and incoming_page.page_number = page.page_number;

  insert into public.accounting_import_pages(import_id,page_number,status,extracted_text,extraction_data,confidence,processed_at,source_location,extracted_values)
  select p_import_id, page.page_number, page.status, page.extracted_text,
         coalesce(page.extraction_data, '{}'::jsonb), page.confidence, now(),
         coalesce(page.source_location, ''), coalesce(page.extracted_values, '{}'::jsonb)
  from jsonb_to_recordset(p_pages) as page(
    page_number integer,
    status text,
    extracted_text text,
    extraction_data jsonb,
    confidence numeric,
    source_location text,
    extracted_values jsonb
  );

  insert into public.accounting_import_transactions(import_id,page_id,row_number,transaction_date,description,reference,debit,credit,vat_amount,vat_code,account_id,classification,confidence,duplicate_key,review_status,source_data)
    select p_import_id, page.id, tx.row_number, tx.transaction_date,
      coalesce(tx.description, ''), tx.reference,
      coalesce(tx.debit, 0), coalesce(tx.credit, 0),
      coalesce(tx.vat_amount, 0), tx.vat_code,
      tx.account_id, tx.classification, tx.confidence,
      tx.duplicate_key, 'pending', coalesce(tx.source_data, '{}'::jsonb)
    from jsonb_to_recordset(p_transactions) as tx(
    page_number integer,
    row_number integer,
    transaction_date date,
    description text,
    reference text,
    debit numeric,
    credit numeric,
    vat_amount numeric,
    vat_code text,
    account_id uuid,
    classification text,
    confidence numeric,
    duplicate_key text,
    source_data jsonb
  )
  join public.accounting_import_pages page
    on page.import_id = p_import_id and page.page_number = tx.page_number;
  get diagnostics v_transaction_count = row_count;
  if v_transaction_count <> jsonb_array_length(p_transactions) then
    raise exception 'Every extracted row must reference a valid source page';
  end if;

  select count(*) filter (where status = 'failed')
  into v_failed_count
  from public.accounting_import_pages
  where import_id = p_import_id;
  select count(*) into v_page_count
  from public.accounting_import_pages
  where import_id = p_import_id;

  if p_finalize and v_page_count <> v_import.page_count then
    raise exception 'All pages must be extracted before review';
  end if;

  update public.accounting_imports
  set document_type = case when p_finalize then coalesce(nullif(p_document_metadata->>'document_type',''), document_type) else document_type end,
      document_number = case when p_finalize then nullif(p_document_metadata->>'document_number','') else document_number end,
      party_name = case when p_finalize then nullif(p_document_metadata->>'party_name','') else party_name end,
      issue_date = case when p_finalize then nullif(p_document_metadata->>'issue_date','')::date else issue_date end,
      due_date = case when p_finalize then nullif(p_document_metadata->>'due_date','')::date else due_date end,
      subtotal = case when p_finalize then coalesce(nullif(p_document_metadata->>'subtotal','')::numeric, 0) else subtotal end,
      vat_amount = case when p_finalize then coalesce(nullif(p_document_metadata->>'vat_amount','')::numeric, 0) else vat_amount end,
      total = case when p_finalize then coalesce(nullif(p_document_metadata->>'total','')::numeric, 0) else total end,
      processed_pages = v_page_count - v_failed_count,
      failed_pages = v_failed_count,
      status = case when not p_finalize then 'processing' when v_failed_count = 0 then 'review_required' else 'failed' end,
      error_message = case when not p_finalize or v_failed_count = 0 then null else 'One or more pages need extraction retry.' end,
      updated_at = now()
  where id = p_import_id;
end;
$$;

revoke all on function public.save_accounting_import_extraction(uuid,jsonb,jsonb,jsonb,boolean) from public, anon, authenticated;
grant execute on function public.save_accounting_import_extraction(uuid,jsonb,jsonb,jsonb,boolean) to service_role;

create or replace function public.post_accounting_import(p_import_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.accounting_imports%rowtype;
  v_journal_id uuid;
  v_journal_number text;
  v_debits numeric(14,2);
  v_credits numeric(14,2);
  v_transaction_count integer;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into v_import
  from public.accounting_imports
  where id = p_import_id
  for update;
  if not found then raise exception 'Accounting import not found'; end if;
  if v_import.status = 'completed' then
    select id into v_journal_id from public.accounting_journals where import_id = p_import_id;
    return v_journal_id;
  end if;
  if v_import.payment_status not in ('verified','exempt') then
    raise exception 'Verified payment is required before posting';
  end if;
  if v_import.status <> 'approved' then raise exception 'Approve the reviewed import before posting'; end if;
  if v_import.document_type in ('sales_quote','purchase_quote','sales_order','purchase_order','invoice_unclassified','quote_unclassified','credit_note_unclassified','unclassified') then
    raise exception 'This document type cannot be posted until it is classified';
  end if;
  if (select count(*) from public.accounting_import_pages where import_id = p_import_id) <> v_import.page_count
     or exists (select 1 from public.accounting_import_pages where import_id = p_import_id and status not in ('extracted','needs_review')) then
    raise exception 'Every source page must be extracted and reviewed before posting';
  end if;
  if exists (
    select 1 from public.accounting_import_transactions
    where import_id = p_import_id and review_status <> 'accepted'
  ) then raise exception 'Every accounting row must be accepted before posting'; end if;
  if exists (
    select 1 from public.accounting_import_transactions
    where import_id = p_import_id and (debit + credit) > 0 and account_id is null
  ) then raise exception 'Every posted row must have an account'; end if;
  if exists (
    select 1 from public.accounting_import_transactions t
    join public.accounting_chart_accounts a on a.id = t.account_id
    where t.import_id = p_import_id and a.customer_id <> v_import.customer_id
  ) then raise exception 'Every journal account must belong to the import customer'; end if;

  select count(*), coalesce(sum(debit),0), coalesce(sum(credit),0)
  into v_transaction_count, v_debits, v_credits
  from public.accounting_import_transactions
  where import_id = p_import_id and review_status = 'accepted';
  if v_transaction_count = 0 or v_debits <= 0 or abs(v_debits - v_credits) > 0.01 then
    raise exception 'Import journal must contain balanced debit and credit entries';
  end if;
  if exists (
    select 1 from public.accounting_import_transactions t
    join public.accounting_periods p on p.customer_id = v_import.customer_id
      and p.is_closed and coalesce(t.transaction_date, v_import.issue_date, current_date) between p.starts_on and p.ends_on
    where t.import_id = p_import_id and t.review_status = 'accepted'
  ) then raise exception 'Posting into a closed accounting period is not allowed'; end if;

  v_journal_number := 'AI-' || to_char(current_date,'YYYYMMDD') || '-' || substr(replace(p_import_id::text,'-',''),1,8);
  insert into public.accounting_journals(customer_id,import_id,journal_number,journal_date,memo,status)
  values (v_import.customer_id,p_import_id,v_journal_number,coalesce(v_import.issue_date,current_date),v_import.original_name,'draft')
  returning id into v_journal_id;

  insert into public.accounting_journal_lines(journal_id,account_id,description,debit,credit,vat_code,vat_amount)
  select v_journal_id,t.account_id,t.description,t.debit,t.credit,t.vat_code,t.vat_amount
  from public.accounting_import_transactions t
  where t.import_id = p_import_id and t.review_status = 'accepted'
  order by t.row_number;

  update public.accounting_journals
  set status = 'posted', posted_by = auth.uid(), posted_at = now()
  where id = v_journal_id;
  update public.accounting_import_transactions
  set review_status = 'posted'
  where import_id = p_import_id and review_status = 'accepted';
  update public.accounting_imports
  set status = 'completed', report_release_status = 'not_requested', updated_at = now()
  where id = p_import_id;
  insert into public.accounting_audit_log(customer_id,actor_id,action,entity_type,entity_id,details)
  values (v_import.customer_id,auth.uid(),'post','accounting_import',p_import_id,
          jsonb_build_object('journal_id',v_journal_id,'debits',v_debits,'credits',v_credits));
  return v_journal_id;
end;
$$;

revoke all on function public.post_accounting_import(uuid) from public, anon;
grant execute on function public.post_accounting_import(uuid) to authenticated;

commit;