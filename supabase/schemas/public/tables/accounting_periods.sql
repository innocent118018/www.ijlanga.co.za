CREATE TABLE "public"."accounting_periods" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "customer_id" uuid                     NOT NULL,
  "starts_on"   date                     NOT NULL,
  "ends_on"     date                     NOT NULL,
  "is_closed"   boolean                  NOT NULL DEFAULT false,
  "closed_by"   uuid,
  "closed_at"   timestamp with time zone,
  CONSTRAINT "accounting_periods_check1" CHECK (((NOT is_closed) OR ((closed_by IS NOT NULL) AND (closed_at IS NOT NULL)))),
  CONSTRAINT "accounting_periods_check" CHECK ((ends_on >= starts_on)),
  CONSTRAINT "accounting_periods_closed_by_fkey" FOREIGN KEY (closed_by) REFERENCES auth.users(id),
  CONSTRAINT "accounting_periods_customer_id_starts_on_ends_on_key" UNIQUE (customer_id, starts_on, ends_on),
  CONSTRAINT "accounting_periods_pkey" PRIMARY KEY (id),
  CONSTRAINT "accounting_periods_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT
);

ALTER TABLE "public"."accounting_periods"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_periods_admin_manage" ON "public"."accounting_periods"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "accounting_periods_read_own_or_admin" ON "public"."accounting_periods"
  FOR SELECT
  TO "authenticated"
  USING (((customer_id = public.current_customer_id()) OR public.is_admin()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."accounting_periods" TO "anon", "authenticated", "postgres", "service_role";
