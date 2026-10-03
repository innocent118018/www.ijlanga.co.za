CREATE TABLE "public"."accounting_report_requests" (
  "id"           uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "customer_id"  uuid                     NOT NULL,
  "requested_by" uuid                     NOT NULL,
  "report_type"  text                     NOT NULL,
  "period_start" date,
  "period_end"   date,
  "format"       text                     NOT NULL DEFAULT 'pdf'::text,
  "status"       text                     NOT NULL DEFAULT 'pending'::text,
  "output_path"  text,
  "reviewed_by"  uuid,
  "reviewed_at"  timestamp with time zone,
  "created_at"   timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "accounting_report_requests_check" CHECK (((period_end IS NULL) OR (period_start IS NULL) OR (period_end >= period_start))),
  CONSTRAINT "accounting_report_requests_format_check" CHECK ((format = ANY (ARRAY['pdf'::text, 'xlsx'::text, 'csv'::text, 'xml'::text, 'json'::text]))),
  CONSTRAINT "accounting_report_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "accounting_report_requests_report_type_check"
    CHECK
    ((report_type = ANY (ARRAY['trial_balance'::text, 'general_ledger'::text, 'income_statement'::text, 'balance_sheet'::text, 'vat201_summary'::text, 'accounts_receivable'::text,
    'accounts_payable'::text, 'bank_reconciliation'::text]))),
  CONSTRAINT "accounting_report_requests_requested_by_fkey" FOREIGN KEY (requested_by) REFERENCES auth.users(id),
  CONSTRAINT "accounting_report_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id),
  CONSTRAINT "accounting_report_requests_status_check"
    CHECK ((status = ANY (ARRAY['pending'::text, 'generating'::text, 'admin_review'::text, 'released'::text, 'rejected'::text, 'failed'::text]))),
  CONSTRAINT "accounting_report_requests_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT
);

ALTER TABLE "public"."accounting_report_requests"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX accounting_report_requests_customer_idx ON public.accounting_report_requests USING btree (customer_id, created_at DESC);

CREATE POLICY "accounting_reports_admin_manage" ON "public"."accounting_report_requests"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "accounting_reports_create_own" ON "public"."accounting_report_requests"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((customer_id = public.current_customer_id()) AND (requested_by = auth.uid())));

CREATE POLICY "accounting_reports_read_own_or_admin" ON "public"."accounting_report_requests"
  FOR SELECT
  TO "authenticated"
  USING (((customer_id = public.current_customer_id()) OR public.is_admin()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."accounting_report_requests" TO "anon", "authenticated", "postgres", "service_role";
