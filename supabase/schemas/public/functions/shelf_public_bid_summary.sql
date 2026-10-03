CREATE OR REPLACE FUNCTION public.shelf_public_bid_summary (
  p_shelf_company_ids uuid[]
)
  RETURNS TABLE (
    shelf_company_id uuid,
    bidder_count     bigint,
    highest_bid      numeric
  )
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select b.shelf_company_id, count(distinct b.bidder_id), max(b.amount)
  from public.shelf_company_bids b
  join public.shelf_companies s on s.id = b.shelf_company_id
  where b.shelf_company_id = any(coalesce(p_shelf_company_ids, '{}'::uuid[]))
    and s.status = 'published'
    and (s.auction_start is null or s.auction_start <= now())
    and (s.auction_end is null or s.auction_end > now())
  group by b.shelf_company_id
$function$;

GRANT EXECUTE ON FUNCTION "public"."shelf_public_bid_summary"(uuid[]) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."shelf_public_bid_summary"(uuid[]) FROM PUBLIC;
