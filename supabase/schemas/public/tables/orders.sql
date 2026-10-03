CREATE TABLE "public"."orders" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_number"   text                     NOT NULL DEFAULT ((('ORD-'::text || to_char(now(), 'YYYYMMDD'::text)) || '-'::text) || upper(substr((gen_random_uuid())::text, 1, 8))),
  "quote_id"       uuid,
  "customer_id"    uuid                     NOT NULL,
  "customer_name"  text                     NOT NULL,
  "customer_email" text                     NOT NULL,
  "status"         text                     NOT NULL DEFAULT 'pending'::text,
  "payment_status" text                     NOT NULL DEFAULT 'unpaid'::text,
  "subtotal"       numeric(12,2)            NOT NULL DEFAULT 0,
  "notes"          text,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "total"          numeric(12,2)            NOT NULL DEFAULT 0,
  CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT,
  CONSTRAINT "orders_order_number_key" UNIQUE (order_number),
  CONSTRAINT "orders_payment_status_check" CHECK ((payment_status = ANY (ARRAY['unpaid'::text, 'pending'::text, 'paid'::text, 'failed'::text, 'refunded'::text]))),
  CONSTRAINT "orders_pkey" PRIMARY KEY (id),
  CONSTRAINT "orders_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'confirmed'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text]))),
  CONSTRAINT "orders_quote_id_fkey" FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE SET NULL
);

ALTER TABLE "public"."orders"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_orders_customer ON public.orders USING btree (customer_id);

CREATE INDEX idx_orders_status ON public.orders USING btree (status, payment_status);

CREATE INDEX orders_customer_id_idx ON public.orders USING btree (customer_id);

CREATE INDEX orders_customer_status_created_idx ON public.orders USING btree (customer_id, status, created_at DESC);

CREATE INDEX orders_quote_id_idx ON public.orders USING btree (quote_id);

CREATE POLICY "Admins can manage orders" ON "public"."orders"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Customers can read own orders" ON "public"."orders"
  FOR SELECT
  TO "authenticated"
  USING (((EXISTS ( SELECT 1
   FROM public.customers c
  WHERE ((c.id = orders.customer_id) AND (c.auth_user_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));

CREATE POLICY "Resellers read referred orders" ON "public"."orders"
  FOR SELECT
  TO "authenticated"
  USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.customers c
  WHERE ((c.id = orders.customer_id) AND (c.reseller_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM public.customers c
  WHERE ((c.id = orders.customer_id) AND (c.auth_user_id = ( SELECT auth.uid() AS uid)))))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."orders" TO "anon", "authenticated", "postgres", "service_role";
