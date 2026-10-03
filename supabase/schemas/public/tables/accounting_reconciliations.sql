CREATE TABLE "public"."accounting_reconciliations" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "customer_id"       uuid                     NOT NULL,
  "account_id"        uuid                     NOT NULL,
  "period_start"      date                     NOT NULL,
  "period_end"        date                     NOT NULL,
  "statement_opening" numeric(14,2)            NOT NULL DEFAULT 0,
  "statement_closing" numeric(14,2)            NOT NULL DEFAULT 0,
  "status"            text                     NOT NULL DEFAULT 'in_progress'::text,
  "completed_by"      uuid,
  "completed_at"      timestamp with time zone,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "accounting_reconciliations_account_id_fkey" FOREIGN KEY (account_id) REFERENCES public.accounting_chart_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT "accounting_reconciliations_check1" CHECK (((status <> 'completed'::text) OR ((completed_by IS NOT NULL) AND (completed_at IS NOT NULL)))),
  CONSTRAINT "accounting_reconciliations_check" CHECK ((period_end >= period_start)),
  CONSTRAINT "accounting_reconciliations_completed_by_fkey" FOREIGN KEY (completed_by) REFERENCES auth.users(id),
  CONSTRAINT "accounting_reconciliations_pkey" PRIMARY KEY (id),
  CONSTRAINT "accounting_reconciliations_status_check" CHECK ((status = ANY (ARRAY['in_progress'::text, 'review_required'::text, 'completed'::text]))),
  CONSTRAINT "accounting_reconciliations_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT
);

ALTER TABLE "public"."accounting_reconciliations"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_reconciliations_read_own_or_admin" ON "public"."accounting_reconciliations"
  FOR SELECT
  TO "authenticated"
  USING (((customer_id = public.current_customer_id()) OR public.is_admin()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."accounting_reconciliations" TO "anon", "authenticated", "postgres", "service_role";
