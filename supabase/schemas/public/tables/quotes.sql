CREATE TABLE "public"."quotes" (
  "id"              uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "quote_number"    text                     NOT NULL DEFAULT ((('Q-'::text || to_char(now(), 'YYYYMMDD'::text)) || '-'::text) || upper(substr((gen_random_uuid())::text, 1, 8))),
  "customer_id"     uuid,
  "customer_name"   text,
  "customer_email"  text,
  "status"          text                     NOT NULL DEFAULT 'draft'::text,
  "subtotal"        numeric(12,2)            NOT NULL DEFAULT 0,
  "notes"           text,
  "created_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"      timestamp with time zone NOT NULL DEFAULT now(),
  "coupon_code"     text,
  "discount_amount" numeric                  NOT NULL DEFAULT 0,
  CONSTRAINT "quotes_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL,
  CONSTRAINT "quotes_pkey" PRIMARY KEY (id),
  CONSTRAINT "quotes_quote_number_key" UNIQUE (quote_number),
  CONSTRAINT "quotes_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'sent'::text, 'accepted'::text, 'declined'::text, 'expired'::text])))
);

ALTER TABLE "public"."quotes"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX quotes_coupon_idx ON public.quotes USING btree (coupon_code);

CREATE INDEX quotes_customer_id_idx ON public.quotes USING btree (customer_id);

CREATE INDEX quotes_customer_status_created_idx ON public.quotes USING btree (customer_id, status, created_at DESC);

CREATE POLICY "Customers can create own quotes" ON "public"."quotes"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((customer_id = public.current_customer_id()) OR public.is_admin()));

CREATE POLICY "Customers can delete own draft quotes" ON "public"."quotes"
  FOR DELETE
  TO "authenticated"
  USING ((((customer_id = public.current_customer_id()) AND (status = 'draft'::text)) OR public.is_admin()));

CREATE POLICY "Customers can read own quotes" ON "public"."quotes"
  FOR SELECT
  TO "authenticated"
  USING (((customer_id = public.current_customer_id()) OR public.is_admin()));

CREATE POLICY "Customers can update own draft quotes" ON "public"."quotes"
  FOR UPDATE
  TO "authenticated"
  USING ((((customer_id = public.current_customer_id()) AND (status = 'draft'::text)) OR public.is_admin()))
  WITH CHECK ((((customer_id = public.current_customer_id()) AND (status = 'draft'::text)) OR public.is_admin()));

CREATE POLICY "Resellers read own quotes" ON "public"."quotes"
  FOR SELECT
  TO "authenticated"
  USING (((customer_id = public.current_customer_id()) OR public.is_admin() OR (EXISTS ( SELECT 1
   FROM public.customers c
  WHERE ((c.id = quotes.customer_id) AND (c.reseller_id = auth.uid()))))));

CREATE POLICY "authenticated users manage own quotes" ON "public"."quotes"
  FOR ALL
  TO "authenticated"
  USING (((customer_id = public.current_customer_id()) OR public.is_admin()))
  WITH CHECK (((customer_id = public.current_customer_id()) OR public.is_admin()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quotes" TO "anon", "authenticated", "postgres", "service_role";
