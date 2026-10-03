CREATE OR REPLACE FUNCTION public.create_receipt_for_payment (
  p_payment_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SET search_path TO 'public'
  AS $function$
declare
  v_payment public.payments%rowtype;
  v_order public.orders%rowtype;
  v_customer public.customers%rowtype;
  v_invoice public.invoices%rowtype;
  v_receipt public.receipts%rowtype;
  v_amount numeric(12,2);
begin
  select * into v_payment from public.payments where id=p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  if v_payment.status <> 'successful' then raise exception 'Receipt requires a successful payment'; end if;
  select * into v_order from public.orders where id=v_payment.order_id;
  select * into v_customer from public.customers where id=v_order.customer_id;
  if not public.is_admin() and v_customer.auth_user_id <> auth.uid() then raise exception 'Not authorised'; end if;
  select * into v_invoice from public.invoices where order_id=v_order.id;
  if not found then perform public.create_invoice_for_order(v_order.id); select * into v_invoice from public.invoices where order_id=v_order.id; end if;
  v_amount := coalesce(v_payment.amount, v_order.total);
  insert into public.receipts(invoice_id,order_id,customer_id,payment_id,amount,payment_method,payment_reference)
  values(v_invoice.id,v_order.id,v_order.customer_id,v_payment.id,v_amount,'iKhokha',coalesce(v_payment.reference,v_order.payment_reference))
  on conflict do nothing returning * into v_receipt;
  update public.invoices set amount_paid=least(total,amount_paid+v_amount),status=case when amount_paid+v_amount>=total then 'paid' else 'partially_paid' end,updated_at=now() where id=v_invoice.id;
  if v_receipt.id is null then select * into v_receipt from public.receipts where payment_id=v_payment.id; end if;
  return jsonb_build_object('receipt_id',v_receipt.id,'receipt_number',v_receipt.receipt_number,'invoice_id',v_invoice.id,'amount',v_amount);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."create_receipt_for_payment"(uuid) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."create_receipt_for_payment"(uuid) FROM PUBLIC;
