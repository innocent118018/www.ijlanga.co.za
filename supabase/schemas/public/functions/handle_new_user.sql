CREATE OR REPLACE FUNCTION public.handle_new_user()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
begin
  insert into public.profiles (
    id,email,full_name,role,is_active,
    first_name,last_name,surname,phone,
    id_number,company_registration_number,
    approval_status,email_verified_at,updated_at
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name',''),
    'client',
    false,
    nullif(new.raw_user_meta_data ->> 'first_name',''),
    nullif(new.raw_user_meta_data ->> 'last_name',''),
    nullif(new.raw_user_meta_data ->> 'surname',''),
    nullif(new.raw_user_meta_data ->> 'phone',''),
    nullif(new.raw_user_meta_data ->> 'id_number',''),
    nullif(new.raw_user_meta_data ->> 'company_registration_number',''),
    'pending',
    case when new.email_confirmed_at is not null then new.email_confirmed_at else null end,
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = case when excluded.full_name <> '' then excluded.full_name else public.profiles.full_name end,
    first_name = coalesce(excluded.first_name, public.profiles.first_name),
    last_name = coalesce(excluded.last_name, public.profiles.last_name),
    surname = coalesce(excluded.surname, public.profiles.surname),
    phone = coalesce(excluded.phone, public.profiles.phone),
    id_number = coalesce(excluded.id_number, public.profiles.id_number),
    company_registration_number = coalesce(excluded.company_registration_number, public.profiles.company_registration_number),
    email_verified_at = coalesce(excluded.email_verified_at, public.profiles.email_verified_at),
    updated_at = now();
  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."handle_new_user"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."handle_new_user"() FROM PUBLIC, "anon", "authenticated";
