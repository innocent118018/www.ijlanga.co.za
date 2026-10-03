CREATE OR REPLACE FUNCTION public.cleanup_quote_request_rate_limits()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_deleted integer;
begin
  delete from public.quote_request_rate_limits
  where updated_at < now() - interval '2 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."cleanup_quote_request_rate_limits"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."cleanup_quote_request_rate_limits"() FROM PUBLIC, "anon", "authenticated";
