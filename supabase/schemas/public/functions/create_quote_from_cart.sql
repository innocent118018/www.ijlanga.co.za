CREATE OR REPLACE FUNCTION public.create_quote_from_cart (
  p_customer_name  text,
  p_customer_email text,
  p_notes          text,
  p_items          jsonb
)
  RETURNS TABLE (
    quote_id     uuid,
    quote_number text,
    subtotal     numeric
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_customer public.customers%rowtype;
  v_quote_id uuid;
  v_quote_number text;
  v_subtotal numeric(12,2) := 0;
  v_item jsonb;
  v_product public.products%rowtype;
  v_quantity integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  select * into v_customer
  from public.customers c
  where c.auth_user_id = auth.uid();
  if not found then
    raise exception 'Customer profile not found';
  end if;

  if coalesce(trim(p_customer_name), '') = '' or coalesce(trim(p_customer_email), '') = '' then
    raise exception 'Customer name and email are required';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item is required';
  end if;

  insert into public.quotes as q(customer_id, customer_name, customer_email, status, subtotal, notes)
  values (v_customer.id, trim(p_customer_name), trim(p_customer_email), 'draft', 0, p_notes)
  returning q.id, q.quote_number into v_quote_id, v_quote_number;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 1);
    if v_quantity < 1 or v_quantity > 100 then
      raise exception 'Item quantity must be between 1 and 100';
    end if;

    select * into v_product
    from public.products p
    where p.id = (v_item ->> 'product_id')::uuid
      and p.is_active = true;
    if not found then
      raise exception 'One or more selected services are no longer available';
    end if;
    if v_product.price is null then
      raise exception 'Price on request services must be handled by an administrator';
    end if;

    v_subtotal := v_subtotal + (v_product.price * v_quantity);
    insert into public.quote_items(quote_id, product_id, sku, product_name, quantity, unit_price, price_label)
    values (v_quote_id, v_product.id, v_product.sku, v_product.name, v_quantity, v_product.price, v_product.price_label);
  end loop;

  update public.quotes q
  set subtotal = v_subtotal, updated_at = now()
  where q.id = v_quote_id;

  return query select v_quote_id, v_quote_number, v_subtotal;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_quote_from_cart"(text, text, text, jsonb) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."create_quote_from_cart"(text, text, text, jsonb) FROM PUBLIC, "anon";
