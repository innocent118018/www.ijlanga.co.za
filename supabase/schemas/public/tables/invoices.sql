CREATE TABLE "public"."invoices" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "invoice_number" text
    NOT NULL DEFAULT ((('INV-'::text || to_char(now(), 'YYYYMMDD'::text)) || '-'::text) || upper(substr(replace((gen_random_uuid())::text, '-'::text, ''::text), 1, 8))),
  "order_id"       uuid                     NOT NULL,
  "customer_id"    uuid                     NOT NULL,
  "status"         text                     NOT NULL DEFAULT 'issued'::text,
  "issue_date"     date                     NOT NULL DEFAULT CURRENT_DATE,
  "due_date"       date,
  "subtotal"       numeric(12,2)            NOT NULL DEFAULT 0,
  "vat_rate"       numeric(5,2)             NOT NULL DEFAULT 15,
  "vat_amount"     numeric(12,2)            NOT NULL DEFAULT 0,
  "total"          numeric(12,2)            NOT NULL DEFAULT 0,
  "amount_paid"    numeric(12,2)            NOT NULL DEFAULT 0,
  "notes"          text,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "invoices_amount_paid_check" CHECK ((amount_paid >= (0)::numeric)),
  CONSTRAINT "invoices_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT,
  CONSTRAINT "invoices_invoice_number_key" UNIQUE (invoice_number),
  CONSTRAINT "invoices_order_id_key" UNIQUE (order_id),
  CONSTRAINT "invoices_pkey" PRIMARY KEY (id),
  CONSTRAINT "invoices_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'issued'::text, 'paid'::text, 'partially_paid'::text, 'overdue'::text, 'cancelled'::text]))),
  CONSTRAINT "invoices_subtotal_check" CHECK ((subtotal >= (0)::numeric)),
  CONSTRAINT "invoices_total_check" CHECK ((total >= (0)::numeric)),
  CONSTRAINT "invoices_vat_amount_check" CHECK ((vat_amount >= (0)::numeric)),
  CONSTRAINT "invoices_vat_rate_check" CHECK (((vat_rate >= (0)::numeric) AND (vat_rate <= (100)::numeric))),
  CONSTRAINT "invoices_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE RESTRICT
);

ALTER TABLE "public"."invoices"
  ENABLE ROW LEVEL SECURITY;

ALTER TABLE "public"."invoices"
  ADD COLUMN "balance_due" numeric(12,2) GENERATED ALWAYS AS (GREATEST((total - amount_paid), (0)::numeric)) STORED;

CREATE INDEX invoices_customer_idx ON public.invoices USING btree (customer_id, created_at DESC);

CREATE UNIQUE INDEX invoices_order_id_unique ON public.invoices USING btree (order_id);

CREATE INDEX invoices_order_idx ON public.invoices USING btree (order_id);

CREATE POLICY "Admins can manage invoices" ON "public"."invoices"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Customers can view own invoices" ON "public"."invoices"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.customers c
  WHERE ((c.id = invoices.customer_id) AND (c.auth_user_id = auth.uid())))));

CREATE POLICY "Resellers read referred invoices" ON "public"."invoices"
  FOR SELECT
  TO "authenticated"
  USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.customers c
  WHERE ((c.id = invoices.customer_id) AND (c.reseller_id = ( SELECT auth.uid() AS uid))))) OR (EXISTS ( SELECT 1
   FROM public.customers c
  WHERE ((c.id = invoices.customer_id) AND (c.auth_user_id = ( SELECT auth.uid() AS uid)))))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."invoices" TO "authenticated", "postgres", "service_role";

REVOKE ALL ON TABLE "public"."invoices" FROM "anon";
