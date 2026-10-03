CREATE TABLE "public"."accounting_import_transactions" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "import_id"        uuid                     NOT NULL,
  "page_id"          uuid,
  "row_number"       integer                  NOT NULL,
  "transaction_date" date,
  "description"      text                     NOT NULL DEFAULT ''::text,
  "reference"        text,
  "debit"            numeric(14,2)            NOT NULL DEFAULT 0,
  "credit"           numeric(14,2)            NOT NULL DEFAULT 0,
  "vat_amount"       numeric(14,2)            NOT NULL DEFAULT 0,
  "vat_code"         text,
  "account_id"       uuid,
  "classification"   text,
  "confidence"       numeric(5,4),
  "duplicate_key"    text,
  "review_status"    text                     NOT NULL DEFAULT 'pending'::text,
  "source_data"      jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "accounting_import_transactions_account_fk" FOREIGN KEY (account_id) REFERENCES public.accounting_chart_accounts(id) ON DELETE RESTRICT,
  CONSTRAINT "accounting_import_transactions_check" CHECK ((NOT ((debit > (0)::numeric) AND (credit > (0)::numeric)))),
  CONSTRAINT "accounting_import_transactions_confidence_check" CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
  CONSTRAINT "accounting_import_transactions_credit_check" CHECK ((credit >= (0)::numeric)),
  CONSTRAINT "accounting_import_transactions_debit_check" CHECK ((debit >= (0)::numeric)),
  CONSTRAINT "accounting_import_transactions_import_id_row_number_key" UNIQUE (import_id, row_number),
  CONSTRAINT "accounting_import_transactions_page_id_fkey" FOREIGN KEY (page_id) REFERENCES public.accounting_import_pages(id) ON DELETE SET NULL,
  CONSTRAINT "accounting_import_transactions_pkey" PRIMARY KEY (id),
  CONSTRAINT "accounting_import_transactions_review_status_check"
    CHECK ((review_status = ANY (ARRAY['pending'::text, 'accepted'::text, 'rejected'::text, 'duplicate'::text, 'posted'::text]))),
  CONSTRAINT "accounting_import_transactions_row_number_check" CHECK ((row_number > 0)),
  CONSTRAINT "accounting_import_transactions_vat_amount_check" CHECK ((vat_amount >= (0)::numeric)),
  CONSTRAINT "accounting_import_transactions_import_id_fkey" FOREIGN KEY (import_id) REFERENCES public.accounting_imports(id) ON DELETE CASCADE
);

ALTER TABLE "public"."accounting_import_transactions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX accounting_transactions_import_idx ON public.accounting_import_transactions USING btree (import_id, review_status);

CREATE POLICY "accounting_transactions_read_via_import" ON "public"."accounting_import_transactions"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.accounting_imports i
  WHERE ((i.id = accounting_import_transactions.import_id) AND ((i.customer_id = public.current_customer_id()) OR public.is_admin())))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE "public"."accounting_import_transactions"
  TO "anon", "authenticated", "postgres", "service_role";
