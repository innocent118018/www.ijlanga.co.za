CREATE OR REPLACE FUNCTION public.create_order_from_quote (
  p_quote_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_quote public.quotes%rowtype;
  v_customer public.customers%rowtype;
  v_order public.orders%rowtype;
  v_total numeric(12,2);
begin
  select * into v_quote
  from public.quotes q
  where q.id = p_quote_id
    and (q.customer_id = public.current_customer_id() or public.is_admin());
  if not found then
    raise exception 'Quote not found or access denied';
  end if;
  if v_quote.status <> 'accepted' then
    raise exception 'Only accepted quotes can become orders';
  end if;

  select * into v_customer
  from public.customers c
  where c.id = v_quote.customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;

  v_total := round(coalesce(v_quote.subtotal, 0), 2);
  select * into v_order
  from public.orders o
  where o.quote_id = v_quote.id
  limit 1;
  if found then
    return jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'total', v_order.total,
      'discount_amount', coalesce(v_quote.discount_amount, 0),
      'created', false
    );
  end if;

  insert into public.orders(
    customer_id, quote_id, customer_name, customer_email, status,
    payment_status, subtotal, total, notes
  )
  values (
    v_customer.id, v_quote.id,
    coalesce(nullif(v_quote.customer_name, ''), v_customer.contact_name),
    coalesce(nullif(v_quote.customer_email, ''), v_customer.email),
    'pending', 'unpaid', v_total, v_total, v_quote.notes
  )
  returning * into v_order;

  insert into public.order_items(order_id, product_id, sku, product_name, quantity, unit_price, price_label)
  select v_order.id, qi.product_id, qi.sku, qi.product_name, qi.quantity, qi.unit_price, qi.price_label
  from public.quote_items qi
  where qi.quote_id = v_quote.id;

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'total', v_order.total,
    'discount_amount', coalesce(v_quote.discount_amount, 0),
    'created', true
  );
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_order_from_quote"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."create_order_from_quote"(uuid) FROM PUBLIC, "anon";
