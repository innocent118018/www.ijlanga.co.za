CREATE TABLE "public"."accounting_journals" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "customer_id"    uuid                     NOT NULL,
  "import_id"      uuid,
  "journal_number" text                     NOT NULL,
  "journal_date"   date                     NOT NULL,
  "memo"           text                     NOT NULL DEFAULT ''::text,
  "status"         text                     NOT NULL DEFAULT 'draft'::text,
  "posted_by"      uuid,
  "posted_at"      timestamp with time zone,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "accounting_journals_check" CHECK (((status <> 'posted'::text) OR ((posted_by IS NOT NULL) AND (posted_at IS NOT NULL)))),
  CONSTRAINT "accounting_journals_customer_id_id_key" UNIQUE (customer_id, id),
  CONSTRAINT "accounting_journals_customer_id_journal_number_key" UNIQUE (customer_id, journal_number),
  CONSTRAINT "accounting_journals_import_id_fkey" FOREIGN KEY (import_id) REFERENCES public.accounting_imports(id) ON DELETE RESTRICT,
  CONSTRAINT "accounting_journals_pkey" PRIMARY KEY (id),
  CONSTRAINT "accounting_journals_posted_by_fkey" FOREIGN KEY (posted_by) REFERENCES auth.users(id),
  CONSTRAINT "accounting_journals_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'posted'::text, 'reversed'::text]))),
  CONSTRAINT "accounting_journals_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT
);

ALTER TABLE "public"."accounting_journals"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX accounting_journals_customer_date_idx ON public.accounting_journals USING btree (customer_id, journal_date);

CREATE POLICY "accounting_journals_read_own_or_admin" ON "public"."accounting_journals"
  FOR SELECT
  TO "authenticated"
  USING (((customer_id = public.current_customer_id()) OR public.is_admin()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."accounting_journals" TO "anon", "authenticated", "postgres", "service_role";
