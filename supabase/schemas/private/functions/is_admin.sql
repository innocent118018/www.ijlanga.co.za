CREATE OR REPLACE FUNCTION private.is_admin()
  RETURNS boolean
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  return exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
      and p.is_active = true
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."is_admin"() TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."is_admin"() FROM PUBLIC;
