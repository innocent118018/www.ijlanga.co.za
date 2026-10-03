begin;

revoke all on table public.shelf_company_reviews from public, anon;
grant select, insert, update, delete on table public.shelf_company_reviews to authenticated;

revoke all on table public.shelf_company_bids from public, anon;
grant select, insert, update, delete on table public.shelf_company_bids to authenticated;

commit;
