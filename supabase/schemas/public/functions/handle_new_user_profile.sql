CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into public.profiles (id, full_name, email, role, is_active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.email,
    'client',
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."handle_new_user_profile"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."handle_new_user_profile"() FROM PUBLIC, "anon", "authenticated";
