CREATE OR REPLACE FUNCTION private.admin_set_profile_role (
  p_user_id   uuid,
  p_role      text,
  p_is_active boolean DEFAULT true
)
  RETURNS public.profiles
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare result public.profiles;
begin
  if not public.is_admin() then raise exception 'admin access required'; end if;
  if p_role not in ('admin','employer','reseller','employee','client') then raise exception 'invalid role'; end if;
  update public.profiles
     set role=p_role, is_active=p_is_active, updated_at=now()
   where id=p_user_id
   returning * into result;
  if result.id is null then raise exception 'profile not found'; end if;
  return result;
end;
$function$;

GRANT EXECUTE ON FUNCTION "private"."admin_set_profile_role"(uuid, text, boolean) TO "authenticated", "postgres";

REVOKE ALL ON FUNCTION "private"."admin_set_profile_role"(uuid, text, boolean) FROM PUBLIC;
