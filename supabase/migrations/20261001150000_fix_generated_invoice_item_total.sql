create or replace function public.create_invoice_for_order(
  p_order_id uuid,
  p_vat_rate numeric default 15
)
returns json
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order record;
  v_customer record;
  v_invoice record;
  v_item record;
  v_subtotal numeric(12,2);
  v_vat numeric(12,2);
  v_total numeric(12,2);
  v_rate numeric(5,2);
  v_invoice_number text;
begin
  if auth.uid() is null or not public.is_admin() then
    raise exception 'Administrator access required';
  end if;

  select * into v_order
  from public.orders o
  where o.id = p_order_id;
  if not found then
    raise exception 'Order not found';
  end if;

  select * into v_customer
  from public.customers c
  where c.id = v_order.customer_id;
  if not found then
    raise exception 'Customer not found';
  end if;

  select * into v_invoice
  from public.invoices i
  where i.order_id = v_order.id
  limit 1;
  if found then
    return json_build_object(
      'id', v_invoice.id,
      'invoice_number', v_invoice.invoice_number,
      'created', false,
      'total', v_invoice.total,
      'balance_due', v_invoice.balance_due
    );
  end if;

  v_rate := greatest(0, least(100, coalesce(p_vat_rate, 15)));
  v_subtotal := round(coalesce(v_order.total, v_order.subtotal, 0), 2);
  v_vat := round(v_subtotal * v_rate / 100, 2);
  v_total := v_subtotal + v_vat;
  v_invoice_number := 'INV-' || to_char(current_date, 'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  insert into public.invoices(
    invoice_number, order_id, customer_id, issue_date, due_date, status,
    subtotal, vat_rate, vat_amount, total, amount_paid, notes
  )
  values (
    v_invoice_number, v_order.id, v_customer.id, current_date, current_date,
    case when v_order.payment_status = 'paid' then 'paid' else 'issued' end,
    v_subtotal, v_rate, v_vat, v_total,
    case when v_order.payment_status = 'paid' then v_total else 0 end,
    'Generated from ' || v_order.order_number
  )
  returning * into v_invoice;

  for v_item in
    select oi.* from public.order_items oi where oi.order_id = v_order.id
  loop
    insert into public.invoice_items(invoice_id, product_id, sku, description, quantity, unit_price, vat_rate)
    values (
      v_invoice.id, v_item.product_id, v_item.sku, v_item.product_name,
      v_item.quantity, v_item.unit_price, v_rate
    );
  end loop;

  return json_build_object(
    'id', v_invoice.id,
    'invoice_number', v_invoice.invoice_number,
    'created', true,
    'total', v_invoice.total,
    'balance_due', v_invoice.balance_due
  );
end;
$$;

revoke all on function public.create_invoice_for_order(uuid, numeric) from public, anon;
grant execute on function public.create_invoice_for_order(uuid, numeric) to authenticated;
