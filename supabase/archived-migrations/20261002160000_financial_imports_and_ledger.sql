create table if not exists public.finance_suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_name text not null,
  email text,
  tax_number text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists finance_suppliers_name_email_unique
  on public.finance_suppliers (lower(trim(supplier_name)), coalesce(lower(trim(email)), ''));

create table if not exists public.accounting_accounts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  account_type text not null check (account_type in ('asset','liability','equity','revenue','expense')),
  report_group text not null,
  normal_balance text not null check (normal_balance in ('debit','credit')),
  is_control boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.accounting_accounts (code, name, account_type, report_group, normal_balance, is_control)
values
  ('1000','Bank','asset','Cash and cash equivalents','debit',true),
  ('1100','Accounts Receivable','asset','Current assets','debit',true),
  ('1150','VAT Input','asset','Current assets','debit',true),
  ('1500','Motor Vehicles','asset','Property, plant and equipment','debit',false),
  ('2000','Accounts Payable','liability','Current liabilities','credit',true),
  ('2100','VAT Output','liability','Current liabilities','credit',true),
  ('3000','Owner Equity','equity','Equity','credit',false),
  ('4000','Sales Revenue','revenue','Revenue','credit',false),
  ('4050','Service Revenue','revenue','Revenue','credit',false),
  ('4090','Rounding Adjustments — Sales','revenue','Revenue','credit',false),
  ('5000','Cost of Sales','expense','Cost of sales','debit',false),
  ('6100','Motor Vehicle Expenses','expense','Operating expenses','debit',false),
  ('6200','Travel and Accommodation','expense','Operating expenses','debit',false),
  ('6300','Office Expenses','expense','Operating expenses','debit',false),
  ('6400','Professional Fees','expense','Operating expenses','debit',false),
  ('6500','Bank Charges','expense','Operating expenses','debit',false),
  ('6600','Software and Subscriptions','expense','Operating expenses','debit',false),
  ('6700','Telephone and Internet','expense','Operating expenses','debit',false),
  ('6800','Repairs and Maintenance','expense','Operating expenses','debit',false),
  ('6900','Other Operating Expenses','expense','Operating expenses','debit',false)
  ,('6950','Rounding Adjustments — Purchases','expense','Operating expenses','debit',false)
on conflict (code) do nothing;

create table if not exists public.finance_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null default 'unclassified' check (document_type in (
    'sales_invoice','purchase_invoice','sales_quote','purchase_quote','sales_order','purchase_order',
    'sales_credit_note','purchase_credit_note','expense_receipt','customer_receipt','supplier_payment',
    'invoice_unclassified','quote_unclassified','credit_note_unclassified','unclassified'
  )),
  status text not null default 'needs_review' check (status in ('needs_review','reviewed','posted','ignored')),
  source_file_name text not null,
  source_mime_type text not null,
  source_size_bytes bigint not null default 0 check (source_size_bytes >= 0),
  content_sha256 text not null unique check (content_sha256 ~ '^[a-f0-9]{64}$'),
  storage_path text not null unique,
  customer_id uuid references public.customers(id) on delete set null,
  supplier_id uuid references public.finance_suppliers(id) on delete set null,
  party_name text,
  party_email text,
  document_number text,
  issue_date date,
  due_date date,
  currency text not null default 'ZAR',
  subtotal numeric(14,2) not null default 0,
  vat_amount numeric(14,2) not null default 0,
  rounding_amount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  amount_paid numeric(14,2) not null default 0,
  balance_due numeric(14,2),
  parser_format text not null,
  parser_warnings jsonb not null default '[]'::jsonb,
  extracted_metadata jsonb not null default '{}'::jsonb,
  imported_by uuid references auth.users(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  posted_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (customer_id is null or supplier_id is null),
  check (subtotal >= 0 and vat_amount >= 0 and total >= 0 and amount_paid >= 0)
);

create table if not exists public.finance_document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.finance_documents(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  source_location text not null default '',
  raw_text text not null default '',
  description text not null default '',
  quantity numeric(14,4),
  unit_price numeric(14,4),
  net_amount numeric(14,2) check (net_amount is null or net_amount >= 0),
  vat_rate numeric(7,4),
  vat_amount numeric(14,2) check (vat_amount is null or vat_amount >= 0),
  gross_amount numeric(14,2) check (gross_amount is null or gross_amount >= 0),
  is_financial_line boolean not null default false,
  account_id uuid references public.accounting_accounts(id) on delete restrict,
  suggested_account_code text,
  classification_confidence numeric(5,4) check (classification_confidence between 0 and 1),
  source_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, line_number)
);

create table if not exists public.accounting_journals (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.finance_documents(id) on delete restrict,
  entry_date date not null,
  reference text not null,
  created_by uuid references auth.users(id) on delete set null,
  posted_by uuid references auth.users(id) on delete set null,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.accounting_journal_lines (
  id uuid primary key default gen_random_uuid(),
  journal_id uuid not null references public.accounting_journals(id) on delete cascade,
  line_number integer not null check (line_number > 0),
  account_id uuid not null references public.accounting_accounts(id) on delete restrict,
  document_line_id uuid references public.finance_document_lines(id) on delete restrict,
  description text not null default '',
  debit numeric(14,2) not null default 0 check (debit >= 0),
  credit numeric(14,2) not null default 0 check (credit >= 0),
  created_at timestamptz not null default now(),
  unique (journal_id, line_number),
  check ((debit = 0) <> (credit = 0))
);

create table if not exists public.finance_document_events (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.finance_documents(id) on delete cascade,
  event_type text not null check (event_type in ('imported','updated','reviewed','posted','ignored')),
  actor_id uuid references auth.users(id) on delete set null,
  event_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists finance_documents_status_date_idx on public.finance_documents(status, issue_date desc);
create index if not exists finance_documents_type_date_idx on public.finance_documents(document_type, issue_date desc);
create index if not exists finance_documents_customer_idx on public.finance_documents(customer_id);
create index if not exists finance_documents_supplier_idx on public.finance_documents(supplier_id);
create index if not exists finance_document_lines_document_idx on public.finance_document_lines(document_id, line_number);
create index if not exists accounting_journals_date_idx on public.accounting_journals(entry_date desc);
create index if not exists accounting_journal_lines_account_idx on public.accounting_journal_lines(account_id);

alter table public.finance_suppliers enable row level security;
alter table public.accounting_accounts enable row level security;
alter table public.finance_documents enable row level security;
alter table public.finance_document_lines enable row level security;
alter table public.accounting_journals enable row level security;
alter table public.accounting_journal_lines enable row level security;
alter table public.finance_document_events enable row level security;

drop policy if exists "Admins manage finance suppliers" on public.finance_suppliers;
create policy "Admins manage finance suppliers" on public.finance_suppliers
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage accounting accounts" on public.accounting_accounts;
create policy "Admins manage accounting accounts" on public.accounting_accounts
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage finance documents" on public.finance_documents;
create policy "Admins manage finance documents" on public.finance_documents
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins manage finance document lines" on public.finance_document_lines;
create policy "Admins manage finance document lines" on public.finance_document_lines
for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "Admins read accounting journals" on public.accounting_journals;
create policy "Admins read accounting journals" on public.accounting_journals
for select to authenticated using (public.is_admin());

drop policy if exists "Admins read accounting journal lines" on public.accounting_journal_lines;
create policy "Admins read accounting journal lines" on public.accounting_journal_lines
for select to authenticated using (public.is_admin());

drop policy if exists "Admins read finance document events" on public.finance_document_events;
create policy "Admins read finance document events" on public.finance_document_events
for select to authenticated using (public.is_admin());

drop policy if exists "Admins insert finance document events" on public.finance_document_events;
create policy "Admins insert finance document events" on public.finance_document_events
for insert to authenticated with check (public.is_admin());

grant select, insert, update, delete on public.finance_suppliers to authenticated;
grant select, insert, update, delete on public.accounting_accounts to authenticated;
grant select, insert, update, delete on public.finance_documents to authenticated;
grant select, insert, update, delete on public.finance_document_lines to authenticated;
grant select on public.accounting_journals, public.accounting_journal_lines to authenticated;
grant select, insert on public.finance_document_events to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'finance-imports',
  'finance-imports',
  false,
  20971520,
  array['application/pdf','text/csv','text/xml','application/xml','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','application/vnd.ms-excel','application/octet-stream']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins manage finance import files" on storage.objects;
create policy "Admins manage finance import files" on storage.objects
for all to authenticated
using (bucket_id = 'finance-imports' and public.is_admin())
with check (bucket_id = 'finance-imports' and public.is_admin());

create or replace function public.post_finance_document(p_document_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.finance_documents%rowtype;
  v_journal_id uuid;
  v_line record;
  v_ar uuid;
  v_ap uuid;
  v_bank uuid;
  v_vat_input uuid;
  v_vat_output uuid;
  v_rounding_sales uuid;
  v_rounding_purchases uuid;
  v_line_number integer := 1;
  v_line_count integer;
  v_unmapped_count integer;
  v_net numeric(14,2);
  v_debits numeric(14,2);
  v_credits numeric(14,2);
  v_amount_paid numeric(14,2);
  v_balance_due numeric(14,2);
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into v_document
  from public.finance_documents
  where id = p_document_id
  for update;
  if not found then raise exception 'Finance document not found'; end if;

  if v_document.status = 'posted' then
    select id into v_journal_id from public.accounting_journals where document_id = p_document_id;
    return v_journal_id;
  end if;
  if v_document.status <> 'reviewed' then raise exception 'Review the document before posting'; end if;
  if v_document.document_type not in ('sales_invoice','purchase_invoice','expense_receipt','customer_receipt','supplier_payment','sales_credit_note','purchase_credit_note') then
    raise exception 'This document type does not create a general-ledger entry';
  end if;
  if v_document.total <= 0 then raise exception 'A positive document total is required'; end if;
  if v_document.amount_paid > v_document.total then raise exception 'Amount paid cannot exceed the document total'; end if;
  v_amount_paid := coalesce(v_document.amount_paid, 0);
  v_balance_due := v_document.total - v_amount_paid;

  select id into v_ar from public.accounting_accounts where code = '1100' and is_active;
  select id into v_ap from public.accounting_accounts where code = '2000' and is_active;
  select id into v_bank from public.accounting_accounts where code = '1000' and is_active;
  select id into v_vat_input from public.accounting_accounts where code = '1150' and is_active;
  select id into v_vat_output from public.accounting_accounts where code = '2100' and is_active;
  select id into v_rounding_sales from public.accounting_accounts where code = '4090' and is_active;
  select id into v_rounding_purchases from public.accounting_accounts where code = '6950' and is_active;
  if v_ar is null or v_ap is null or v_bank is null or v_vat_input is null or v_vat_output is null or v_rounding_sales is null or v_rounding_purchases is null then
    raise exception 'Required control accounts are missing or inactive';
  end if;

  if v_document.document_type in ('sales_invoice','purchase_invoice','expense_receipt','sales_credit_note','purchase_credit_note') then
    select count(*), coalesce(sum(net_amount), 0), count(*) filter (where account_id is null or net_amount is null)
      into v_line_count, v_net, v_unmapped_count
    from public.finance_document_lines
    where document_id = p_document_id and is_financial_line;
    if v_line_count = 0 then raise exception 'At least one financial line is required'; end if;
    if v_unmapped_count > 0 then raise exception 'Every financial line must be assigned an account'; end if;
    if v_net is null or abs(v_net - v_document.subtotal) > 0.01 then
      raise exception 'Mapped line amounts must equal the document subtotal';
    end if;
    if abs((v_document.subtotal + v_document.vat_amount + v_document.rounding_amount) - v_document.total) > 0.02 then
      raise exception 'Subtotal plus VAT and rounding must equal the document total';
    end if;

    if v_document.document_type in ('sales_invoice','sales_credit_note') and exists (
      select 1 from public.finance_document_lines l
      join public.accounting_accounts a on a.id = l.account_id
      where l.document_id = p_document_id and l.is_financial_line and a.account_type <> 'revenue'
    ) then raise exception 'Sales lines must map to revenue accounts'; end if;

    if v_document.document_type in ('purchase_invoice','expense_receipt','purchase_credit_note') and exists (
      select 1 from public.finance_document_lines l
      join public.accounting_accounts a on a.id = l.account_id
      where l.document_id = p_document_id and l.is_financial_line and a.account_type not in ('expense','asset')
    ) then raise exception 'Purchase lines must map to expense or asset accounts'; end if;

  end if;

  v_line_number := 1;
  insert into public.accounting_journals(document_id, entry_date, reference, created_by, posted_by)
  values (p_document_id, coalesce(v_document.issue_date, current_date), coalesce(nullif(v_document.document_number, ''), v_document.source_file_name), auth.uid(), auth.uid())
  returning id into v_journal_id;

  if v_document.document_type = 'sales_invoice' then
    if v_balance_due > 0 then
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,debit)
      values (v_journal_id,v_line_number,v_ar,'Accounts receivable — ' || coalesce(v_document.party_name, v_document.source_file_name),v_balance_due);
      v_line_number := v_line_number + 1;
    end if;
    if v_amount_paid > 0 then
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,debit)
      values (v_journal_id,v_line_number,v_bank,'Customer payment received — ' || coalesce(v_document.party_name, v_document.source_file_name),v_amount_paid);
      v_line_number := v_line_number + 1;
    end if;
    for v_line in
      select l.account_id, sum(l.net_amount)::numeric(14,2) amount, min(l.description) description
      from public.finance_document_lines l where l.document_id = p_document_id and l.is_financial_line
      group by l.account_id having sum(l.net_amount) > 0 order by l.account_id
    loop
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,credit)
      values (v_journal_id,v_line_number,v_line.account_id,coalesce(v_line.description,'Sales revenue'),v_line.amount);
      v_line_number := v_line_number + 1;
    end loop;
    if v_document.vat_amount > 0 then
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,credit)
      values (v_journal_id,v_line_number,v_vat_output,'VAT output',v_document.vat_amount);
      v_line_number := v_line_number + 1;
    end if;
    if v_document.rounding_amount > 0 then
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,credit)
      values (v_journal_id,v_line_number,v_rounding_sales,'Sales rounding adjustment',v_document.rounding_amount);
    elsif v_document.rounding_amount < 0 then
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,debit)
      values (v_journal_id,v_line_number,v_rounding_sales,'Sales rounding adjustment',abs(v_document.rounding_amount));
    end if;
  elsif v_document.document_type in ('purchase_invoice','expense_receipt') then
    for v_line in
      select l.account_id, sum(l.net_amount)::numeric(14,2) amount, min(l.description) description
      from public.finance_document_lines l where l.document_id = p_document_id and l.is_financial_line
      group by l.account_id having sum(l.net_amount) > 0 order by l.account_id
    loop
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,debit)
      values (v_journal_id,v_line_number,v_line.account_id,coalesce(v_line.description,'Purchase expense'),v_line.amount);
      v_line_number := v_line_number + 1;
    end loop;
    if v_document.vat_amount > 0 then
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,debit)
      values (v_journal_id,v_line_number,v_vat_input,'VAT input',v_document.vat_amount);
      v_line_number := v_line_number + 1;
    end if;
    if v_document.rounding_amount > 0 then
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,debit)
      values (v_journal_id,v_line_number,v_rounding_purchases,'Purchase rounding adjustment',v_document.rounding_amount);
      v_line_number := v_line_number + 1;
    elsif v_document.rounding_amount < 0 then
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,credit)
      values (v_journal_id,v_line_number,v_rounding_purchases,'Purchase rounding adjustment',abs(v_document.rounding_amount));
      v_line_number := v_line_number + 1;
    end if;
    if v_document.document_type = 'expense_receipt' then
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,credit)
      values (v_journal_id,v_line_number,v_bank,'Bank payment — ' || coalesce(v_document.party_name, v_document.source_file_name),v_document.total);
    else
      if v_balance_due > 0 then
        insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,credit)
        values (v_journal_id,v_line_number,v_ap,'Accounts payable — ' || coalesce(v_document.party_name, v_document.source_file_name),v_balance_due);
        v_line_number := v_line_number + 1;
      end if;
      if v_amount_paid > 0 then
        insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,credit)
        values (v_journal_id,v_line_number,v_bank,'Supplier payment — ' || coalesce(v_document.party_name, v_document.source_file_name),v_amount_paid);
      end if;
    end if;
  elsif v_document.document_type = 'sales_credit_note' then
    for v_line in
      select l.account_id, sum(l.net_amount)::numeric(14,2) amount, min(l.description) description
      from public.finance_document_lines l where l.document_id = p_document_id and l.is_financial_line
      group by l.account_id having sum(l.net_amount) > 0 order by l.account_id
    loop
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,debit)
      values (v_journal_id,v_line_number,v_line.account_id,'Credit note — ' || coalesce(v_line.description,'Sales reversal'),v_line.amount);
      v_line_number := v_line_number + 1;
    end loop;
    if v_document.vat_amount > 0 then
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,debit)
      values (v_journal_id,v_line_number,v_vat_output,'VAT output reversal',v_document.vat_amount);
      v_line_number := v_line_number + 1;
    end if;
    if v_document.rounding_amount > 0 then
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,debit)
      values (v_journal_id,v_line_number,v_rounding_sales,'Sales rounding reversal',v_document.rounding_amount);
      v_line_number := v_line_number + 1;
    elsif v_document.rounding_amount < 0 then
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,credit)
      values (v_journal_id,v_line_number,v_rounding_sales,'Sales rounding reversal',abs(v_document.rounding_amount));
      v_line_number := v_line_number + 1;
    end if;
    insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,credit)
    values (v_journal_id,v_line_number,v_ar,'Accounts receivable credit note',v_document.total);
  elsif v_document.document_type = 'purchase_credit_note' then
    insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,debit)
    values (v_journal_id,v_line_number,v_ap,'Accounts payable credit note',v_document.total);
    v_line_number := v_line_number + 1;
    for v_line in
      select l.account_id, sum(l.net_amount)::numeric(14,2) amount, min(l.description) description
      from public.finance_document_lines l where l.document_id = p_document_id and l.is_financial_line
      group by l.account_id having sum(l.net_amount) > 0 order by l.account_id
    loop
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,credit)
      values (v_journal_id,v_line_number,v_line.account_id,'Purchase credit note — ' || coalesce(v_line.description,'Expense reversal'),v_line.amount);
      v_line_number := v_line_number + 1;
    end loop;
    if v_document.vat_amount > 0 then
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,credit)
      values (v_journal_id,v_line_number,v_vat_input,'VAT input reversal',v_document.vat_amount);
      v_line_number := v_line_number + 1;
    end if;
    if v_document.rounding_amount > 0 then
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,credit)
      values (v_journal_id,v_line_number,v_rounding_purchases,'Purchase rounding reversal',v_document.rounding_amount);
    elsif v_document.rounding_amount < 0 then
      insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,debit)
      values (v_journal_id,v_line_number,v_rounding_purchases,'Purchase rounding reversal',abs(v_document.rounding_amount));
    end if;
  elsif v_document.document_type = 'customer_receipt' then
    insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,debit)
    values (v_journal_id,1,v_bank,'Customer receipt — ' || coalesce(v_document.party_name, v_document.source_file_name),v_document.total);
    insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,credit)
    values (v_journal_id,2,v_ar,'Accounts receivable settlement',v_document.total);
  elsif v_document.document_type = 'supplier_payment' then
    insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,debit)
    values (v_journal_id,1,v_ap,'Supplier payment — ' || coalesce(v_document.party_name, v_document.source_file_name),v_document.total);
    insert into public.accounting_journal_lines(journal_id,line_number,account_id,description,credit)
    values (v_journal_id,2,v_bank,'Bank payment',v_document.total);
  end if;

  select coalesce(sum(debit),0), coalesce(sum(credit),0)
    into v_debits, v_credits
  from public.accounting_journal_lines where journal_id = v_journal_id;
  if abs(v_debits - v_credits) > 0.01 then raise exception 'Journal is not balanced'; end if;

  update public.finance_documents
  set status = 'posted', posted_by = auth.uid(), posted_at = now(), updated_at = now()
  where id = p_document_id;
  insert into public.finance_document_events(document_id,event_type,actor_id,event_data)
  values (p_document_id,'posted',auth.uid(),jsonb_build_object('journal_id',v_journal_id,'debits',v_debits,'credits',v_credits));
  return v_journal_id;
end;
$$;

revoke all on function public.post_finance_document(uuid) from public, anon;
grant execute on function public.post_finance_document(uuid) to authenticated;

create or replace view public.accounting_account_balances
with (security_invoker = true)
as
select a.id as account_id, a.code, a.name, a.account_type, a.report_group, a.normal_balance,
       coalesce(sum(l.debit),0)::numeric(14,2) as debit_total,
       coalesce(sum(l.credit),0)::numeric(14,2) as credit_total,
      coalesce((case when a.normal_balance = 'debit' then sum(l.debit) - sum(l.credit) else sum(l.credit) - sum(l.debit) end),0)::numeric(14,2) as balance
from public.accounting_accounts a
left join public.accounting_journal_lines l on l.account_id = a.id
group by a.id;
grant select on public.accounting_account_balances to authenticated;

do $$
declare
  v_table text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_table in array array['finance_documents','finance_document_lines','accounting_journals','accounting_journal_lines'] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_table);
      end if;
    end loop;
  end if;
end;
$$;