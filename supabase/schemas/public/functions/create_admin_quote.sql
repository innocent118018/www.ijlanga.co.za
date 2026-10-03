CREATE OR REPLACE FUNCTION public.create_admin_quote (
  p_customer_id uuid,
  p_notes       text,
  p_items       jsonb
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
  v_product_id uuid;
  v_sku text;
  v_product_name text;
  v_price_label text;
  v_quantity integer;
  v_unit_price numeric(12,2);
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one item is required';
  end if;

  select * into v_customer
  from public.customers c
  where c.id = p_customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;

  insert into public.quotes as q(customer_id, customer_name, customer_email, status, subtotal, notes)
  values (
    v_customer.id,
    coalesce(nullif(trim(v_customer.company_name), ''), v_customer.contact_name),
    nullif(trim(v_customer.email), ''),
    'draft',
    0,
    nullif(trim(p_notes), '')
  )
  returning q.id, q.quote_number into v_quote_id, v_quote_number;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_quantity < 1 or v_quantity > 100 then
      raise exception 'Item quantity must be between 1 and 100';
    end if;

    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    v_product_name := nullif(trim(v_item ->> 'product_name'), '');
    v_sku := nullif(trim(v_item ->> 'sku'), '');
    v_price_label := null;

    if v_product_id is not null then
      select * into v_product
      from public.products p
      where p.id = v_product_id and p.is_active = true;
      if not found then
        raise exception 'One or more selected services are no longer available';
      end if;
      v_product_name := v_product.name;
      v_sku := v_product.sku;
      if v_product.price is not null then
        v_unit_price := v_product.price;
        v_price_label := v_product.price_label;
      else
        v_unit_price := nullif(v_item ->> 'unit_price', '')::numeric;
        if v_unit_price is null or v_unit_price < 0 then
          raise exception 'Enter a valid unit price for price-on-request services';
        end if;
        v_price_label := 'R ' || to_char(v_unit_price, 'FM999G999G990D00') || ' excl. VAT';
      end if;
    else
      if v_product_name is null then
        raise exception 'Custom line descriptions are required';
      end if;
      v_unit_price := nullif(v_item ->> 'unit_price', '')::numeric;
      if v_unit_price is null or v_unit_price < 0 then
        raise exception 'Enter a valid unit price for custom lines';
      end if;
      v_price_label := 'R ' || to_char(v_unit_price, 'FM999G999G990D00') || ' excl. VAT';
    end if;

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
    insert into public.quote_items(quote_id, product_id, sku, product_name, quantity, unit_price, price_label)
    values (v_quote_id, v_product_id, v_sku, v_product_name, v_quantity, v_unit_price, v_price_label);
  end loop;

  update public.quotes q
  set subtotal = v_subtotal, updated_at = now()
  where q.id = v_quote_id;

  return query select v_quote_id, v_quote_number, v_subtotal;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_admin_quote"(uuid, text, jsonb) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."create_admin_quote"(uuid, text, jsonb) FROM PUBLIC, "anon";
