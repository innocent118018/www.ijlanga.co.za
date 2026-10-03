CREATE OR REPLACE FUNCTION public.current_customer_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
  select c.id
  from public.customers c
  where c.auth_user_id = (select auth.uid())
  limit 1
$function$;

GRANT EXECUTE ON FUNCTION "public"."current_customer_id"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."current_customer_id"() FROM PUBLIC, "anon";
