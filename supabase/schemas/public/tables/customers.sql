CREATE TABLE "public"."customers" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "auth_user_id" uuid,
  "company_name" text,
  "contact_name" text                     NOT NULL,
  "email"        text                     NOT NULL,
  "phone"        text,
  "notes"        text,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "reseller_id"  uuid,
  CONSTRAINT "customers_auth_user_id_fkey" FOREIGN KEY (auth_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "customers_auth_user_id_key" UNIQUE (auth_user_id),
  CONSTRAINT "customers_pkey" PRIMARY KEY (id),
  CONSTRAINT "customers_reseller_id_fkey" FOREIGN KEY (reseller_id) REFERENCES public.profiles(id) ON DELETE SET NULL
);

ALTER TABLE "public"."customers"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX customers_auth_user_id_idx ON public.customers USING btree (auth_user_id);

CREATE INDEX customers_email_idx ON public.customers USING btree (lower(email));

CREATE INDEX idx_customers_reseller_id ON public.customers USING btree (reseller_id);

CREATE POLICY "Admins can manage customers" ON "public"."customers"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Customers can insert own record" ON "public"."customers"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((auth_user_id = auth.uid()));

CREATE POLICY "Customers can read own record" ON "public"."customers"
  FOR SELECT
  TO "authenticated"
  USING ((auth_user_id = auth.uid()));

CREATE POLICY "Customers can update own record" ON "public"."customers"
  FOR UPDATE
  TO "authenticated"
  USING ((auth_user_id = auth.uid()))
  WITH CHECK ((auth_user_id = auth.uid()));

CREATE POLICY "Resellers read own customers" ON "public"."customers"
  FOR SELECT
  TO "authenticated"
  USING (((reseller_id = ( SELECT auth.uid() AS uid)) OR (auth_user_id = ( SELECT auth.uid() AS uid)) OR public.is_admin()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."customers" TO "anon", "authenticated", "postgres", "service_role";
