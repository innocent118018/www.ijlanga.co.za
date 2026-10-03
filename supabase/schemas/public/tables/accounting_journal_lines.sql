CREATE TABLE "public"."accounting_journal_lines" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "journal_id"  uuid                     NOT NULL,
  "account_id"  uuid                     NOT NULL,
  "description" text                     NOT NULL DEFAULT ''::text,
  "debit"       numeric(14,2)            NOT NULL DEFAULT 0,
  "credit"      numeric(14,2)            NOT NULL DEFAULT 0,
  "vat_code"    text,
  "vat_amount"  numeric(14,2)            NOT NULL DEFAULT 0,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "accounting_journal_lines_account_id_fkey" FOREIGN KEY (account_id) REFERENCES public.accounting_chart_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT "accounting_journal_lines_check" CHECK ((NOT ((debit > (0)::numeric) AND (credit > (0)::numeric)))),
  CONSTRAINT "accounting_journal_lines_credit_check" CHECK ((credit >= (0)::numeric)),
  CONSTRAINT "accounting_journal_lines_debit_check" CHECK ((debit >= (0)::numeric)),
  CONSTRAINT "accounting_journal_lines_pkey" PRIMARY KEY (id),
  CONSTRAINT "accounting_journal_lines_vat_amount_check" CHECK ((vat_amount >= (0)::numeric)),
  CONSTRAINT "accounting_journal_lines_journal_id_fkey" FOREIGN KEY (journal_id) REFERENCES public.accounting_journals(id) ON DELETE CASCADE
);

ALTER TABLE "public"."accounting_journal_lines"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_journal_lines_read_via_journal" ON "public"."accounting_journal_lines"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.accounting_journals j
  WHERE ((j.id = accounting_journal_lines.journal_id) AND ((j.customer_id = public.current_customer_id()) OR public.is_admin())))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."accounting_journal_lines" TO "anon", "authenticated", "postgres", "service_role";
