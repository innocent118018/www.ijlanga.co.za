CREATE TABLE "public"."payments" (
  "id"                      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "order_id"                uuid                     NOT NULL,
  "provider"                text                     NOT NULL DEFAULT 'ikhokha'::text,
  "reference"               text,
  "amount"                  numeric(12,2)            NOT NULL,
  "status"                  text                     NOT NULL DEFAULT 'pending'::text,
  "provider_transaction_id" text,
  "metadata"                jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"              timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "payments_amount_check" CHECK ((amount >= (0)::numeric)),
  CONSTRAINT "payments_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE,
  CONSTRAINT "payments_pkey" PRIMARY KEY (id),
  CONSTRAINT "payments_provider_check" CHECK ((provider = ANY (ARRAY['ikhokha'::text, 'payfast'::text]))),
  CONSTRAINT "payments_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'successful'::text, 'failed'::text, 'refunded'::text])))
);

ALTER TABLE "public"."payments"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_payments_order ON public.payments USING btree (order_id);

CREATE INDEX idx_payments_reference ON public.payments USING btree (reference);

CREATE INDEX payments_order_reference_idx ON public.payments USING btree (order_id, reference);

CREATE UNIQUE INDEX uq_payments_order_reference ON public.payments USING btree (order_id, reference)
  WHERE (reference IS NOT NULL);

CREATE POLICY "Admins can manage payments" ON "public"."payments"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Customers can read own payments" ON "public"."payments"
  FOR SELECT
  TO "authenticated"
  USING (((EXISTS ( SELECT 1
   FROM (public.orders o
     JOIN public.customers c ON ((c.id = o.customer_id)))
  WHERE ((o.id = payments.order_id) AND (c.auth_user_id = ( SELECT auth.uid() AS uid))))) OR public.is_admin()));

CREATE POLICY "Resellers read referred payments" ON "public"."payments"
  FOR SELECT
  TO "authenticated"
  USING ((public.is_admin() OR (EXISTS ( SELECT 1
   FROM (public.orders o
     JOIN public.customers c ON ((c.id = o.customer_id)))
  WHERE ((o.id = payments.order_id) AND ((c.reseller_id = ( SELECT auth.uid() AS uid)) OR (c.auth_user_id = ( SELECT auth.uid() AS uid))))))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."payments" TO "anon", "authenticated", "postgres", "service_role";
