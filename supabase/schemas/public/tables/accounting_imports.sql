CREATE TABLE "public"."accounting_imports" (
  "id"                      uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "customer_id"             uuid                     NOT NULL,
  "created_by"              uuid                     NOT NULL,
  "original_name"           text                     NOT NULL,
  "storage_path"            text                     NOT NULL,
  "mime_type"               text                     NOT NULL,
  "file_size_bytes"         bigint                   NOT NULL,
  "page_count"              integer                  NOT NULL DEFAULT 0,
  "processed_pages"         integer                  NOT NULL DEFAULT 0,
  "failed_pages"            integer                  NOT NULL DEFAULT 0,
  "status"                  text                     NOT NULL DEFAULT 'awaiting_payment'::text,
  "payment_status"          text                     NOT NULL DEFAULT 'pending'::text,
  "payment_provider"        text,
  "payment_reference"       text,
  "amount_due"              numeric(12,2)            NOT NULL DEFAULT 0,
  "exemption_reason"        text,
  "exempted_by"             uuid,
  "exempted_at"             timestamp with time zone,
  "verified_at"             timestamp with time zone,
  "error_message"           text,
  "created_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"              timestamp with time zone NOT NULL DEFAULT now(),
  "customer_user_id"        uuid,
  "discount_percent"        numeric(5,2)             NOT NULL DEFAULT 0,
  "price_per_page"          numeric(10,2)            NOT NULL DEFAULT 10,
  "report_release_status"   text                     NOT NULL DEFAULT 'not_requested'::text,
  "source_sha256"           text,
  "source_retention_locked" boolean                  NOT NULL DEFAULT true,
  "last_error_at"           timestamp with time zone,
  CONSTRAINT "accounting_imports_amount_due_check" CHECK ((amount_due >= (0)::numeric)),
  CONSTRAINT "accounting_imports_check" CHECK (((payment_status <> 'exempt'::text) OR ((exempted_by IS NOT NULL) AND (exempted_at IS
    NOT NULL) AND (NULLIF(TRIM(BOTH FROM exemption_reason), ''::text) IS NOT NULL)))),
  CONSTRAINT "accounting_imports_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE RESTRICT,
  CONSTRAINT "accounting_imports_exempted_by_fkey" FOREIGN KEY (exempted_by) REFERENCES auth.users(id),
  CONSTRAINT "accounting_imports_failed_pages_check" CHECK ((failed_pages >= 0)),
  CONSTRAINT "accounting_imports_file_size_bytes_check" CHECK ((file_size_bytes > 0)),
  CONSTRAINT "accounting_imports_page_count_check" CHECK (((page_count >= 0) AND (page_count <= 1000))),
  CONSTRAINT "accounting_imports_payment_provider_check" CHECK ((payment_provider = ANY (ARRAY['payfast'::text, 'ikhokha'::text, 'admin_exemption'::text]))),
  CONSTRAINT "accounting_imports_payment_status_check" CHECK ((payment_status = ANY (ARRAY['pending'::text, 'verified'::text, 'exempt'::text, 'failed'::text, 'refunded'::text]))),
  CONSTRAINT "accounting_imports_pkey" PRIMARY KEY (id),
  CONSTRAINT "accounting_imports_processed_pages_check" CHECK ((processed_pages >= 0)),
  CONSTRAINT "accounting_imports_status_check"
    CHECK
    ((status = ANY (ARRAY['awaiting_payment'::text, 'queued'::text, 'processing'::text, 'review_required'::text, 'approved'::text, 'completed'::text, 'failed'::text,
    'cancelled'::text]))),
  CONSTRAINT "accounting_imports_storage_path_key" UNIQUE (storage_path),
  CONSTRAINT "accounting_imports_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT
);

ALTER TABLE "public"."accounting_imports"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX accounting_imports_customer_created_idx ON public.accounting_imports USING btree (customer_id, created_at DESC);

CREATE POLICY "accounting_imports_admin_update" ON "public"."accounting_imports"
  FOR UPDATE
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "accounting_imports_create_own" ON "public"."accounting_imports"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((customer_id = public.current_customer_id()) AND (created_by = auth.uid())));

CREATE POLICY "accounting_imports_read_own_or_admin" ON "public"."accounting_imports"
  FOR SELECT
  TO "authenticated"
  USING (((customer_id = public.current_customer_id()) OR public.is_admin()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."accounting_imports" TO "anon", "authenticated", "postgres", "service_role";
