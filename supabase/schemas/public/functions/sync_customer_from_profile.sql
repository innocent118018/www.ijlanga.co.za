CREATE OR REPLACE FUNCTION public.sync_customer_from_profile()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_match_count integer;
  v_customer_id uuid;
begin
  if new.role <> 'client' or new.email is null or trim(new.email) = '' then
    return new;
  end if;

  select c.id into v_customer_id
  from public.customers c
  where c.auth_user_id = new.id;

  if v_customer_id is not null then
    update public.customers
    set email = new.email,
        contact_name = coalesce(nullif(trim(new.full_name), ''), contact_name),
        phone = coalesce(nullif(new.phone, ''), phone),
        updated_at = now()
    where id = v_customer_id;
    return new;
  end if;

  select count(*) into v_match_count
  from public.customers c
  where lower(trim(c.email)) = lower(trim(new.email))
    and c.auth_user_id is null;

  if v_match_count = 1 then
    update public.customers
    set auth_user_id = new.id,
        email = new.email,
        contact_name = coalesce(nullif(trim(new.full_name), ''), contact_name),
        phone = coalesce(nullif(new.phone, ''), phone),
        updated_at = now()
    where id = (
      select c.id
      from public.customers c
      where lower(trim(c.email)) = lower(trim(new.email))
        and c.auth_user_id is null
      limit 1
    );
    return new;
  end if;

  insert into public.customers(auth_user_id, company_name, contact_name, email, phone)
  values (
    new.id,
    nullif(trim(new.organization_name), ''),
    coalesce(nullif(trim(new.full_name), ''), new.email),
    new.email,
    nullif(new.phone, '')
  )
  on conflict (auth_user_id) do update
  set email = excluded.email,
      contact_name = coalesce(nullif(trim(excluded.contact_name), ''), public.customers.contact_name),
      phone = coalesce(excluded.phone, public.customers.phone),
      updated_at = now();

  return new;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."sync_customer_from_profile"() TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."sync_customer_from_profile"() FROM PUBLIC, "anon", "authenticated";
