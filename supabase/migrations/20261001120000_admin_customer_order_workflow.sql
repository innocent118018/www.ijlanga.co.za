begin;

alter table public.quotes drop constraint if exists quotes_customer_id_fkey;
alter table public.quotes
  add constraint quotes_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete set null;

alter table public.orders drop constraint if exists orders_customer_id_fkey;
alter table public.orders
  add constraint orders_customer_id_fkey
  foreign key (customer_id) references public.customers(id) on delete restrict;

create or replace function public.current_customer_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.customers c
  where c.auth_user_id = (select auth.uid())
  limit 1
$$;

revoke all on function public.current_customer_id() from public, anon;
grant execute on function public.current_customer_id() to authenticated;

create or replace function public.sync_customer_from_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.sync_customer_from_profile() from public, anon, authenticated;
drop trigger if exists sync_customer_profile_insert on public.profiles;
drop trigger if exists sync_customer_profile_update on public.profiles;
create trigger sync_customer_profile_insert
after insert on public.profiles
for each row execute function public.sync_customer_from_profile();
create trigger sync_customer_profile_update
after update of email, full_name, organization_name, phone, role on public.profiles
for each row execute function public.sync_customer_from_profile();
create trigger sync_customer_from_profile
after insert or update of email, full_name, organization_name, phone, role on public.profiles
for each row execute function public.sync_customer_from_profile();

with matching_emails as (
  select lower(trim(c.email)) as email_key
  from public.customers c
  where c.auth_user_id is null
  group by lower(trim(c.email))
  having count(*) = 1
), matching_client_emails as (
  select lower(trim(p.email)) as email_key
  from public.profiles p
  where p.role = 'client' and p.email is not null
  group by lower(trim(p.email))
  having count(*) = 1
)
update public.customers c
set auth_user_id = p.id,
    email = p.email,
    phone = coalesce(nullif(p.phone, ''), c.phone),
    updated_at = now()
from public.profiles p
join matching_emails m on m.email_key = lower(trim(p.email))
join matching_client_emails mc on mc.email_key = lower(trim(p.email))
where c.auth_user_id is null
  and lower(trim(c.email)) = m.email_key
  and p.role = 'client'
  and not exists (
    select 1
    from public.customers linked
    where linked.auth_user_id = p.id
  );

create or replace function public.create_quote_from_cart(
  p_customer_name text,
  p_customer_email text,
  p_notes text,
  p_items jsonb
)
returns table(quote_id uuid, quote_number text, subtotal numeric)
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.create_quote_from_cart(text, text, text, jsonb) from public, anon;
grant execute on function public.create_quote_from_cart(text, text, text, jsonb) to authenticated;

create or replace function public.create_admin_quote(
  p_customer_id uuid,
  p_notes text,
  p_items jsonb
)
returns table(quote_id uuid, quote_number text, subtotal numeric)
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.create_admin_quote(uuid, text, jsonb) from public, anon;
grant execute on function public.create_admin_quote(uuid, text, jsonb) to authenticated;

create or replace function public.create_order_from_quote(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.create_order_from_quote(uuid) from public, anon;
grant execute on function public.create_order_from_quote(uuid) to authenticated;

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
    insert into public.invoice_items(invoice_id, product_id, sku, description, quantity, unit_price, vat_rate, total)
    values (
      v_invoice.id, v_item.product_id, v_item.sku, v_item.product_name,
      v_item.quantity, v_item.unit_price, v_rate,
      round(v_item.quantity * v_item.unit_price, 2)
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
create or replace function public.accept_quote(p_quote_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
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
$$;

revoke all on function public.accept_quote(uuid) from public, anon;
grant execute on function public.accept_quote(uuid) to authenticated;

drop policy if exists "Customers can create own quotes" on public.quotes;
drop policy if exists "Customers can delete own draft quotes" on public.quotes;
drop policy if exists "Customers can read own quotes" on public.quotes;
drop policy if exists "Customers can update own draft quotes" on public.quotes;
drop policy if exists "Resellers read own quotes" on public.quotes;
drop policy if exists "authenticated users manage own quotes" on public.quotes;

create policy "Customers can create own quotes" on public.quotes
for insert to authenticated
with check (customer_id = public.current_customer_id() or public.is_admin());
create policy "Customers can delete own draft quotes" on public.quotes
for delete to authenticated
using ((customer_id = public.current_customer_id() and status = 'draft') or public.is_admin());
create policy "Customers can read own quotes" on public.quotes
for select to authenticated
using (customer_id = public.current_customer_id() or public.is_admin());
create policy "Resellers read own quotes" on public.quotes
for select to authenticated
using (
  customer_id = public.current_customer_id()
  or public.is_admin()
  or exists (
    select 1 from public.customers c
    where c.id = quotes.customer_id and c.reseller_id = auth.uid()
  )
);
create policy "Customers can update own draft quotes" on public.quotes
for update to authenticated
using ((customer_id = public.current_customer_id() and status = 'draft') or public.is_admin())
with check ((customer_id = public.current_customer_id() and status = 'draft') or public.is_admin());
create policy "authenticated users manage own quotes" on public.quotes
for all to authenticated
using (customer_id = public.current_customer_id() or public.is_admin())
with check (customer_id = public.current_customer_id() or public.is_admin());

create or replace function public.quote_item_owner(p_quote_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.quotes q
    where q.id = p_quote_id
      and (q.customer_id = public.current_customer_id() or public.is_admin())
  )
$$;

revoke all on function public.quote_item_owner(uuid) from public, anon;
grant execute on function public.quote_item_owner(uuid) to authenticated;

drop policy if exists "Customers can create own quote items" on public.quote_items;
drop policy if exists "Customers can delete own quote items" on public.quote_items;
drop policy if exists "Customers can read own quote items" on public.quote_items;
drop policy if exists "Customers can update own quote items" on public.quote_items;
drop policy if exists "authenticated users manage own quote items" on public.quote_items;

create policy "Customers can create own quote items" on public.quote_items
for insert to authenticated
with check (public.quote_item_owner(quote_id));
create policy "Customers can delete own quote items" on public.quote_items
for delete to authenticated
using (public.quote_item_owner(quote_id));
create policy "Customers can read own quote items" on public.quote_items
for select to authenticated
using (public.quote_item_owner(quote_id));
create policy "Customers can update own quote items" on public.quote_items
for update to authenticated
using (public.quote_item_owner(quote_id))
with check (public.quote_item_owner(quote_id));
create policy "authenticated users manage own quote items" on public.quote_items
for all to authenticated
using (public.quote_item_owner(quote_id))
with check (public.quote_item_owner(quote_id));

commit;
