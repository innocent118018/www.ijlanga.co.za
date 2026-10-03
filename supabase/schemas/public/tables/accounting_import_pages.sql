CREATE TABLE "public"."accounting_import_pages" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "import_id"        uuid                     NOT NULL,
  "page_number"      integer                  NOT NULL,
  "status"           text                     NOT NULL DEFAULT 'pending'::text,
  "extracted_text"   text,
  "extraction_data"  jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "confidence"       numeric(5,4),
  "error_message"    text,
  "attempts"         integer                  NOT NULL DEFAULT 0,
  "processed_at"     timestamp with time zone,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  "source_location"  text,
  "extracted_values" jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT "accounting_import_pages_attempts_check" CHECK ((attempts >= 0)),
  CONSTRAINT "accounting_import_pages_confidence_check" CHECK (((confidence >= (0)::numeric) AND (confidence <= (1)::numeric))),
  CONSTRAINT "accounting_import_pages_import_id_page_number_key" UNIQUE (import_id, page_number),
  CONSTRAINT "accounting_import_pages_page_number_check" CHECK (((page_number >= 1) AND (page_number <= 1000))),
  CONSTRAINT "accounting_import_pages_pkey" PRIMARY KEY (id),
  CONSTRAINT "accounting_import_pages_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'processing'::text, 'extracted'::text, 'needs_review'::text, 'failed'::text]))),
  CONSTRAINT "accounting_import_pages_import_id_fkey" FOREIGN KEY (import_id) REFERENCES public.accounting_imports(id) ON DELETE CASCADE
);

ALTER TABLE "public"."accounting_import_pages"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX accounting_pages_import_status_idx ON public.accounting_import_pages USING btree (import_id, status, page_number);

CREATE POLICY "accounting_pages_read_via_import" ON "public"."accounting_import_pages"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.accounting_imports i
  WHERE ((i.id = accounting_import_pages.import_id) AND ((i.customer_id = public.current_customer_id()) OR public.is_admin())))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."accounting_import_pages" TO "anon", "authenticated", "postgres", "service_role";
