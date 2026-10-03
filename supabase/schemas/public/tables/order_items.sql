CREATE TABLE "public"."order_items" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_id"     uuid                     NOT NULL,
  "product_id"   uuid,
  "sku"          text,
  "product_name" text                     NOT NULL,
  "quantity"     integer                  NOT NULL,
  "unit_price"   numeric(12,2),
  "price_label"  text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "order_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "order_items_quantity_check" CHECK ((quantity > 0)),
  CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE,
  CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL
);

ALTER TABLE "public"."order_items"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_order_items_order ON public.order_items USING btree (order_id);

CREATE INDEX order_items_order_id_idx ON public.order_items USING btree (order_id);

CREATE POLICY "Admins can manage order items" ON "public"."order_items"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Customers can read own order items" ON "public"."order_items"
  FOR SELECT
  TO "authenticated"
  USING (((EXISTS ( SELECT 1
   FROM (public.orders o
     JOIN public.customers c ON ((c.id = o.customer_id)))
  WHERE ((o.id = order_items.order_id) AND (c.auth_user_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."order_items" TO "anon", "authenticated", "postgres", "service_role";
