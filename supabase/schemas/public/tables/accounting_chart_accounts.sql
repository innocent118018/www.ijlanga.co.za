CREATE TABLE "public"."accounting_chart_accounts" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "customer_id"  uuid                     NOT NULL,
  "code"         text                     NOT NULL,
  "name"         text                     NOT NULL,
  "account_type" text                     NOT NULL,
  "tax_code"     text,
  "is_active"    boolean                  NOT NULL DEFAULT true,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "accounting_chart_accounts_account_type_check" CHECK ((account_type = ANY (ARRAY['asset'::text, 'liability'::text, 'equity'::text, 'income'::text, 'expense'::text]))),
  CONSTRAINT "accounting_chart_accounts_customer_id_code_key" UNIQUE (customer_id, code),
  CONSTRAINT "accounting_chart_accounts_customer_id_id_key" UNIQUE (customer_id, id),
  CONSTRAINT "accounting_chart_accounts_pkey" PRIMARY KEY (id),
  CONSTRAINT "accounting_chart_accounts_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT
);

ALTER TABLE "public"."accounting_chart_accounts"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_chart_accounts_admin_manage" ON "public"."accounting_chart_accounts"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "accounting_chart_accounts_read_own_or_admin" ON "public"."accounting_chart_accounts"
  FOR SELECT
  TO "authenticated"
  USING (((customer_id = public.current_customer_id()) OR public.is_admin()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."accounting_chart_accounts" TO "anon", "authenticated", "postgres", "service_role";
