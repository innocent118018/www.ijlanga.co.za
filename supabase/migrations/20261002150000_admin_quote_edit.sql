begin;

create or replace function public.update_admin_quote(
  p_quote_id uuid,
  p_notes text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_quote public.quotes%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_name text;
  v_sku text;
  v_price_label text;
  v_quantity integer;
  v_unit_price numeric(12,2);
  v_subtotal numeric(12,2) := 0;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'At least one quote line is required';
  end if;

  select * into v_quote
  from public.quotes q
  where q.id = p_quote_id
  for update;
  if not found then
    raise exception 'Quote not found';
  end if;
  if exists (select 1 from public.orders o where o.quote_id = v_quote.id) then
    raise exception 'A quote linked to an order cannot be edited';
  end if;

  delete from public.quote_items qi where qi.quote_id = v_quote.id;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_quantity < 1 or v_quantity > 100 then
      raise exception 'Item quantity must be between 1 and 100';
    end if;

    v_product_id := nullif(v_item ->> 'product_id', '')::uuid;
    if v_product_id is not null then
      select * into v_product
      from public.products p
      where p.id = v_product_id and p.is_active = true;
      if not found then
        raise exception 'One or more selected services are no longer available';
      end if;
      v_name := v_product.name;
      v_sku := v_product.sku;
      if v_product.price is null then
        v_unit_price := nullif(v_item ->> 'unit_price', '')::numeric;
        if v_unit_price is null or v_unit_price < 0 then
          raise exception 'Enter a valid unit price for price-on-request services';
        end if;
        v_price_label := 'R ' || to_char(v_unit_price, 'FM999G999G990D00') || ' excl. VAT';
      else
        v_unit_price := v_product.price;
        v_price_label := v_product.price_label;
      end if;
    else
      v_name := nullif(trim(v_item ->> 'product_name'), '');
      v_sku := nullif(trim(v_item ->> 'sku'), '');
      v_unit_price := nullif(v_item ->> 'unit_price', '')::numeric;
      if v_name is null or v_unit_price is null or v_unit_price < 0 then
        raise exception 'Custom quote lines require a description and non-negative price';
      end if;
      v_price_label := 'R ' || to_char(v_unit_price, 'FM999G999G990D00') || ' excl. VAT';
    end if;

    v_subtotal := v_subtotal + (v_unit_price * v_quantity);
    insert into public.quote_items(quote_id, product_id, sku, product_name, quantity, unit_price, price_label)
    values (v_quote.id, v_product_id, v_sku, v_name, v_quantity, v_unit_price, v_price_label);
  end loop;

  update public.quotes q
  set subtotal = round(v_subtotal, 2),
      notes = nullif(trim(p_notes), ''),
      updated_at = now()
  where q.id = v_quote.id;

  return jsonb_build_object(
    'quote_id', v_quote.id,
    'quote_number', v_quote.quote_number,
    'subtotal', round(v_subtotal, 2)
  );
end;
$$;

revoke all on function public.update_admin_quote(uuid, text, jsonb) from public, anon;
grant execute on function public.update_admin_quote(uuid, text, jsonb) to authenticated;

commit;
