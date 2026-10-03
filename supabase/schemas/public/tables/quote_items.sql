CREATE TABLE "public"."quote_items" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "quote_id"     uuid                     NOT NULL,
  "product_id"   uuid,
  "sku"          text,
  "product_name" text                     NOT NULL,
  "quantity"     integer                  NOT NULL DEFAULT 1,
  "unit_price"   numeric(12,2),
  "price_label"  text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "quote_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "quote_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL,
  CONSTRAINT "quote_items_quantity_check" CHECK ((quantity > 0)),
  CONSTRAINT "quote_items_quote_id_fkey" FOREIGN KEY (quote_id) REFERENCES public.quotes(id) ON DELETE CASCADE
);

ALTER TABLE "public"."quote_items"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX quote_items_quote_id_idx ON public.quote_items USING btree (quote_id);

CREATE POLICY "Customers can create own quote items" ON "public"."quote_items"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (public.quote_item_owner(quote_id));

CREATE POLICY "Customers can delete own quote items" ON "public"."quote_items"
  FOR DELETE
  TO "authenticated"
  USING (public.quote_item_owner(quote_id));

CREATE POLICY "Customers can read own quote items" ON "public"."quote_items"
  FOR SELECT
  TO "authenticated"
  USING (public.quote_item_owner(quote_id));

CREATE POLICY "Customers can update own quote items" ON "public"."quote_items"
  FOR UPDATE
  TO "authenticated"
  USING (public.quote_item_owner(quote_id))
  WITH CHECK (public.quote_item_owner(quote_id));

CREATE POLICY "authenticated users manage own quote items" ON "public"."quote_items"
  FOR ALL
  TO "authenticated"
  USING (public.quote_item_owner(quote_id))
  WITH CHECK (public.quote_item_owner(quote_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quote_items" TO "anon", "authenticated", "postgres", "service_role";
