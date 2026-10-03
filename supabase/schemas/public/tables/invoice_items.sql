CREATE TABLE "public"."invoice_items" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "invoice_id"  uuid                     NOT NULL,
  "product_id"  uuid,
  "sku"         text,
  "description" text                     NOT NULL,
  "quantity"    integer                  NOT NULL,
  "unit_price"  numeric(12,2)            NOT NULL DEFAULT 0,
  "vat_rate"    numeric(5,2)             NOT NULL DEFAULT 15,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "invoice_items_pkey" PRIMARY KEY (id),
  CONSTRAINT "invoice_items_quantity_check" CHECK ((quantity > 0)),
  CONSTRAINT "invoice_items_unit_price_check" CHECK ((unit_price >= (0)::numeric)),
  CONSTRAINT "invoice_items_vat_rate_check" CHECK (((vat_rate >= (0)::numeric) AND (vat_rate <= (100)::numeric))),
  CONSTRAINT "invoice_items_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE CASCADE,
  CONSTRAINT "invoice_items_product_id_fkey" FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE SET NULL
);

ALTER TABLE "public"."invoice_items"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."invoice_items"
  ADD COLUMN "total" numeric(12,2) GENERATED ALWAYS AS (((quantity)::numeric * unit_price)) STORED;

CREATE INDEX invoice_items_invoice_idx ON public.invoice_items USING btree (invoice_id);

CREATE POLICY "Admins can manage invoice items" ON "public"."invoice_items"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Customers can view own invoice items" ON "public"."invoice_items"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM (public.invoices i
     JOIN public.customers c ON ((c.id = i.customer_id)))
  WHERE ((i.id = invoice_items.invoice_id) AND (c.auth_user_id = auth.uid())))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."invoice_items" TO "authenticated", "postgres", "service_role";

REVOKE ALL ON TABLE "public"."invoice_items" FROM "anon";
