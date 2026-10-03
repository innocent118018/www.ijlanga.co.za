begin;

alter table public.orders
  add column if not exists checkout_key uuid;

create unique index if not exists orders_checkout_key_uidx
  on public.orders(checkout_key)
  where checkout_key is not null;

create or replace function public.create_direct_order(
  p_checkout_key uuid,
  p_customer_name text,
  p_customer_email text,
  p_customer_phone text,
  p_notes text,
  p_product_id uuid,
  p_quantity integer default 1
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_customer public.customers%rowtype;
  v_product public.products%rowtype;
  v_order public.orders%rowtype;
  v_name text := nullif(trim(p_customer_name), '');
  v_email text := lower(nullif(trim(p_customer_email), ''));
begin
  if p_checkout_key is null then
    raise exception 'Checkout key is required';
  end if;
  if v_name is null or v_email is null or position('@' in v_email) < 2 then
    raise exception 'A valid customer name and email are required';
  end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 100 then
    raise exception 'Quantity must be between 1 and 100';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_checkout_key::text, 0));

  select * into v_order
  from public.orders o
  where o.checkout_key = p_checkout_key;
  if found then
    if lower(coalesce(v_order.customer_email, '')) <> v_email or not exists (
      select 1
      from public.order_items oi
      where oi.order_id = v_order.id
        and oi.product_id = p_product_id
        and oi.quantity = p_quantity
    ) then
      raise exception 'Checkout key was already used for a different order';
    end if;
    return jsonb_build_object(
      'order_id', v_order.id,
      'order_number', v_order.order_number,
      'customer_id', v_order.customer_id,
      'subtotal', v_order.total,
      'created', false
    );
  end if;

  select * into v_product
  from public.products p
  where p.id = p_product_id
    and p.is_active = true
  for share;
  if not found or v_product.price is null or v_product.price <= 0 then
    raise exception 'This service is not available for direct purchase';
  end if;

  if auth.uid() is not null then
    select * into v_customer
    from public.customers c
    where c.auth_user_id = auth.uid()
    for update;
  end if;

  if v_customer.id is null then
    select * into v_customer
    from public.customers c
    where c.auth_user_id is null
      and lower(trim(c.email)) = v_email
    order by c.created_at
    limit 1
    for update;
  end if;

  if v_customer.id is null then
    insert into public.customers(auth_user_id, contact_name, email, phone)
    values (auth.uid(), v_name, v_email, nullif(trim(p_customer_phone), ''))
    returning * into v_customer;
  else
    update public.customers c
    set contact_name = coalesce(nullif(trim(c.contact_name), ''), v_name),
        phone = coalesce(nullif(trim(p_customer_phone), ''), c.phone),
        updated_at = now()
    where c.id = v_customer.id
    returning * into v_customer;
  end if;

  insert into public.orders(
    customer_id, quote_id, customer_name, customer_email, status,
    payment_status, subtotal, total, notes, checkout_key
  )
  values (
    v_customer.id, null, v_name, v_email, 'pending',
    'unpaid', round(v_product.price * p_quantity, 2),
    round(v_product.price * p_quantity, 2), nullif(trim(p_notes), ''), p_checkout_key
  )
  returning * into v_order;

  insert into public.order_items(
    order_id, product_id, sku, product_name, quantity, unit_price, price_label
  )
  values (
    v_order.id, v_product.id, v_product.sku, v_product.name,
    p_quantity, v_product.price, v_product.price_label
  );

  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'customer_id', v_order.customer_id,
    'subtotal', v_order.total,
    'created', true
  );
end;
$$;

revoke all on function public.create_direct_order(uuid, text, text, text, text, uuid, integer) from public;
grant execute on function public.create_direct_order(uuid, text, text, text, text, uuid, integer) to anon, authenticated, service_role;

commit;
