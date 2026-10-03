CREATE OR REPLACE FUNCTION public.admin_set_profile_role (
  p_user_id   uuid,
  p_role      text,
  p_is_active boolean DEFAULT true
)
  RETURNS public.profiles
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare result public.profiles;
begin
 if not public.is_admin() then raise exception 'Administrator access required'; end if;
 if p_role not in ('admin','employer','employee','reseller','client') then raise exception 'Invalid role'; end if;
 update public.profiles set role=p_role,is_active=p_is_active,updated_at=now() where id=p_user_id returning * into result;
 if result.id is null then raise exception 'Profile not found'; end if;
 return result;
end; $function$;

GRANT EXECUTE ON FUNCTION "public"."admin_set_profile_role"(uuid, text, boolean) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."admin_set_profile_role"(uuid, text, boolean) FROM PUBLIC, "anon";
