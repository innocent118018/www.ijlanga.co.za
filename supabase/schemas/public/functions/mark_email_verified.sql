CREATE OR REPLACE FUNCTION public.mark_email_verified()
  RETURNS void
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
begin
  update public.profiles
  set email_verified_at = coalesce(email_verified_at, now()),
      updated_at = now()
  where id = auth.uid();
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."mark_email_verified"() TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."mark_email_verified"() FROM PUBLIC, "anon";
