CREATE OR REPLACE FUNCTION public.protect_profile_authorization_fields()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  if not private.is_admin() then
    new.role := old.role;
    new.is_active := old.is_active;
    new.approval_status := old.approval_status;
    new.approval_notes := old.approval_notes;
    new.approved_at := old.approved_at;
    new.approved_by := old.approved_by;
    new.employer_id := old.employer_id;
    new.email_verified_at := old.email_verified_at;
    new.email := old.email;
  end if;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."protect_profile_authorization_fields"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."protect_profile_authorization_fields"() FROM PUBLIC, "anon", "authenticated";
