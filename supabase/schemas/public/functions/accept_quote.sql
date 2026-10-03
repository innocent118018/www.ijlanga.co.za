CREATE OR REPLACE FUNCTION public.accept_quote (
  p_quote_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
  AS $function$
declare
  v_quote public.quotes%rowtype;
  v_result jsonb;
begin
  select * into v_quote
  from public.quotes q
  where q.id = p_quote_id
    and (q.customer_id = public.current_customer_id() or public.is_admin())
  for update;
  if not found then
    raise exception 'Quote not found or access denied';
  end if;

  if v_quote.status = 'accepted' then
    select public.create_order_from_quote(v_quote.id) into v_result;
    return v_result || jsonb_build_object('quote_id', v_quote.id, 'status', 'accepted', 'already_accepted', true);
  end if;
  if v_quote.status <> 'sent' then
    raise exception 'Only quotes marked as sent can be accepted';
  end if;

  update public.quotes q
  set status = 'accepted', updated_at = now()
  where q.id = v_quote.id;

  select public.create_order_from_quote(v_quote.id) into v_result;
  perform public.record_notification(
    null,
    'orders@ijlanga.co.za',
    'quote_accepted',
    'Quote accepted — ' || v_quote.quote_number,
    'Quote ' || v_quote.quote_number || ' was accepted and converted to order ' || coalesce(v_result ->> 'order_number', ''),
    'quote',
    v_quote.id
  );

  return v_result || jsonb_build_object('quote_id', v_quote.id, 'status', 'accepted', 'already_accepted', false);
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."accept_quote"(uuid) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."accept_quote"(uuid) FROM PUBLIC, "anon";
