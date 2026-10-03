CREATE OR REPLACE FUNCTION public.place_shelf_company_bid (
  p_shelf_company_id uuid,
  p_amount           numeric
)
  RETURNS public.shelf_company_bids
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_listing public.shelf_companies; v_bid public.shelf_company_bids; v_name text; v_email text; v_min numeric;
begin
 if auth.uid() is null then raise exception 'Sign in required'; end if;
 select * into v_listing from public.shelf_companies where id=p_shelf_company_id and status='published' for update;
 if v_listing.id is null then raise exception 'Listing is not available'; end if;
 if v_listing.auction_start is not null and now()<v_listing.auction_start then raise exception 'Bidding has not started'; end if;
 if v_listing.auction_end is not null and now()>=v_listing.auction_end then raise exception 'Bidding has closed'; end if;
 select greatest(v_listing.proposed_amount,coalesce(max(amount),0)) into v_min from public.shelf_company_bids where shelf_company_id=v_listing.id;
 if p_amount<=v_min then raise exception 'Bid must be higher than the current amount'; end if;
 select coalesce(full_name,'Bidder'),email into v_name,v_email from public.profiles where id=auth.uid();
 if v_email is null then select email into v_email from auth.users where id=auth.uid(); end if;
 insert into public.shelf_company_bids(shelf_company_id,bidder_id,bidder_name,bidder_email,amount) values(v_listing.id,auth.uid(),coalesce(v_name,'Bidder'),coalesce(v_email,''),p_amount) returning * into v_bid;
 return v_bid;
end; $function$;

GRANT EXECUTE ON FUNCTION "public"."place_shelf_company_bid"(uuid, numeric) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."place_shelf_company_bid"(uuid, numeric) FROM PUBLIC, "anon";
