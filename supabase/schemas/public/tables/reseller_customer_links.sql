CREATE TABLE "public"."reseller_customer_links" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "reseller_user_id" uuid                     NOT NULL,
  "customer_id"      uuid                     NOT NULL,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reseller_customer_links_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE,
  CONSTRAINT "reseller_customer_links_pkey" PRIMARY KEY (id),
  CONSTRAINT "reseller_customer_links_reseller_user_id_customer_id_key" UNIQUE (reseller_user_id, customer_id),
  CONSTRAINT "reseller_customer_links_reseller_user_id_fkey" FOREIGN KEY (reseller_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

ALTER TABLE "public"."reseller_customer_links"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX reseller_customer_links_reseller_idx ON public.reseller_customer_links USING btree (reseller_user_id);

CREATE POLICY "Admins can manage reseller links" ON "public"."reseller_customer_links"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Resellers can view their customer links" ON "public"."reseller_customer_links"
  FOR SELECT
  TO "authenticated"
  USING ((reseller_user_id = auth.uid()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."reseller_customer_links" TO "anon", "authenticated", "postgres", "service_role";
