CREATE TABLE "public"."receipts" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "receipt_number"    text
    NOT NULL DEFAULT ((('RCT-'::text || to_char(now(), 'YYYYMMDD'::text)) || '-'::text) || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 8))),
  "invoice_id"        uuid                     NOT NULL,
  "order_id"          uuid                     NOT NULL,
  "customer_id"       uuid                     NOT NULL,
  "payment_id"        uuid,
  "amount"            numeric(12,2)            NOT NULL,
  "payment_date"      timestamp with time zone NOT NULL DEFAULT now(),
  "payment_method"    text                     NOT NULL DEFAULT 'iKhokha'::text,
  "payment_reference" text,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "receipts_amount_check" CHECK ((amount > (0)::numeric)),
  CONSTRAINT "receipts_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT,
  CONSTRAINT "receipts_invoice_id_fkey" FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE RESTRICT,
  CONSTRAINT "receipts_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT,
  CONSTRAINT "receipts_payment_id_fkey" FOREIGN KEY (payment_id) REFERENCES public.payments(id) ON DELETE SET NULL,
  CONSTRAINT "receipts_pkey" PRIMARY KEY (id),
  CONSTRAINT "receipts_receipt_number_key" UNIQUE (receipt_number)
);

ALTER TABLE "public"."receipts"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX receipts_customer_idx ON public.receipts USING btree (customer_id, payment_date DESC);

CREATE INDEX receipts_invoice_id_idx ON public.receipts USING btree (invoice_id);

CREATE INDEX receipts_invoice_idx ON public.receipts USING btree (invoice_id);

CREATE UNIQUE INDEX receipts_payment_id_unique ON public.receipts USING btree (payment_id)
  WHERE (payment_id IS NOT NULL);

CREATE POLICY "Admins can manage receipts" ON "public"."receipts"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Customers can view own receipts" ON "public"."receipts"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.customers c
  WHERE ((c.id = receipts.customer_id) AND (c.auth_user_id = auth.uid())))));

CREATE POLICY "Resellers read referred receipts" ON "public"."receipts"
  FOR SELECT
  TO "authenticated"
  USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.customers c
  WHERE ((c.id = receipts.customer_id) AND ((c.reseller_id = ( SELECT auth.uid() AS uid)) OR (c.auth_user_id = ( SELECT auth.uid() AS uid))))))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."receipts" TO "authenticated", "postgres", "service_role";

REVOKE ALL ON TABLE "public"."receipts" FROM "anon";
