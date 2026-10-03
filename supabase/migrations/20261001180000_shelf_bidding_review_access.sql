begin;

create table if not exists public.shelf_company_reviews (
  shelf_company_id uuid primary key references public.shelf_companies(id) on delete cascade,
  business_overview text not null default '',
  historical_financials text not null default '',
  current_year_performance text not null default '',
  indicative_valuation text not null default '',
  assets_and_customers text not null default '',
  shareholder_structure text not null default '',
  sale_rationale text not null default '',
  material_matters text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.shelf_company_reviews enable row level security;

drop policy if exists "Shelf review admins manage" on public.shelf_company_reviews;
create policy "Shelf review admins manage" on public.shelf_company_reviews
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Approved clients read active shelf reviews" on public.shelf_company_reviews;
create policy "Approved clients read active shelf reviews" on public.shelf_company_reviews
for select to authenticated
using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'client'
      and p.is_active = true
      and p.approval_status = 'approved'
  )
  and exists (
    select 1 from public.shelf_companies s
    where s.id = shelf_company_reviews.shelf_company_id
      and s.status = 'published'
      and (s.auction_start is null or s.auction_start <= now())
      and (s.auction_end is null or s.auction_end > now())
  )
);

create or replace function public.shelf_public_bid_summary(p_shelf_company_ids uuid[])
returns table(shelf_company_id uuid, bidder_count bigint, highest_bid numeric)
language sql
stable
security definer
set search_path = ''
as $$
  select b.shelf_company_id, count(distinct b.bidder_id), max(b.amount)
  from public.shelf_company_bids b
  join public.shelf_companies s on s.id = b.shelf_company_id
  where b.shelf_company_id = any(coalesce(p_shelf_company_ids, '{}'::uuid[]))
    and s.status = 'published'
    and (s.auction_start is null or s.auction_start <= now())
    and (s.auction_end is null or s.auction_end > now())
  group by b.shelf_company_id
$$;

revoke all on function public.shelf_public_bid_summary(uuid[]) from public;
grant execute on function public.shelf_public_bid_summary(uuid[]) to anon, authenticated;

commit;
