begin;

alter table public.accounting_imports
  add column if not exists customer_user_id uuid,
  add column if not exists discount_percent numeric(5,2) not null default 0 check (discount_percent between 0 and 15),
  add column if not exists price_per_page numeric(10,2) not null default 10 check (price_per_page >= 0),
  add column if not exists report_release_status text not null default 'not_requested'
    check (report_release_status in ('not_requested','requested','under_review','released','rejected')),
  add column if not exists source_sha256 text,
  add column if not exists source_retention_locked boolean not null default true,
  add column if not exists last_error_at timestamptz;

create index if not exists accounting_imports_source_sha256_idx on public.accounting_imports(source_sha256);
create index if not exists accounting_imports_customer_user_idx on public.accounting_imports(customer_user_id);

create index if not exists accounting_transactions_duplicate_key_idx on public.accounting_import_transactions(import_id,duplicate_key);

alter table public.accounting_import_pages
  add column if not exists source_location text,
  add column if not exists extracted_values jsonb not null default '{}'::jsonb;

alter table public.accounting_journal_lines
  add column if not exists source_transaction_id uuid references public.accounting_import_transactions(id) on delete set null;

create index if not exists accounting_journal_lines_source_tx_idx on public.accounting_journal_lines(source_transaction_id);

create or replace function public.accounting_import_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists accounting_imports_updated_at on public.accounting_imports;
create trigger accounting_imports_updated_at
before update on public.accounting_imports
for each row execute function public.accounting_import_updated_at();

create or replace function public.accounting_discount_percent(p_pages integer)
returns numeric
language sql
immutable
as $$
  select case
    when coalesce(p_pages,0) >= 750 then 15
    when coalesce(p_pages,0) >= 500 then 10
    when coalesce(p_pages,0) >= 250 then 5
    when coalesce(p_pages,0) >= 100 then 2.5
    else 0
  end;
$$;

create or replace function public.accounting_calculate_charge(p_pages integer)
returns numeric
language sql
immutable
as $$
  select round(greatest(coalesce(p_pages,0),0) * 10 * (1 - public.accounting_discount_percent(coalesce(p_pages,0))/100), 2);
$$;

commit;