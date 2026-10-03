CREATE OR REPLACE FUNCTION public.quote_item_owner (
  p_quote_id uuid
)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select exists (
    select 1 from public.quotes q
    where q.id = p_quote_id
      and (q.customer_id = public.current_customer_id() or public.is_admin())
  )
$function$;

GRANT EXECUTE ON FUNCTION "public"."quote_item_owner"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."quote_item_owner"(uuid) FROM PUBLIC, "anon";
