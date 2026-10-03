CREATE TABLE "public"."shelf_companies" (
  "id"                  uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "company_name"        text                     NOT NULL,
  "registration_number" text                     NOT NULL,
  "compliance_status"   text                     NOT NULL DEFAULT 'Pending Review'::text,
  "proposed_amount"     numeric(14,2)            NOT NULL DEFAULT 0,
  "auction_start"       timestamp with time zone,
  "auction_end"         timestamp with time zone,
  "status"              text                     NOT NULL DEFAULT 'draft'::text,
  "description"         text,
  "industry"            text,
  "province"            text,
  "year_registered"     integer,
  "vat_registered"      boolean                  NOT NULL DEFAULT false,
  "cipc_status"         text,
  "documents_note"      text,
  "created_by"          uuid,
  "created_at"          timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"          timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "shelf_auction_dates" CHECK (((auction_end IS NULL) OR (auction_start IS NULL) OR (auction_end > auction_start))),
  CONSTRAINT "shelf_companies_compliance_status_check"
    CHECK ((compliance_status = ANY (ARRAY['Compliant'::text, 'Non-compliant'::text, 'Pending Review'::text, 'Not Verified'::text]))),
  CONSTRAINT "shelf_companies_created_by_fkey" FOREIGN KEY (created_by) REFERENCES auth.users(id),
  CONSTRAINT "shelf_companies_pkey" PRIMARY KEY (id),
  CONSTRAINT "shelf_companies_proposed_amount_check" CHECK ((proposed_amount >= (0)::numeric)),
  CONSTRAINT "shelf_companies_registration_number_key" UNIQUE (registration_number),
  CONSTRAINT "shelf_companies_status_check" CHECK ((status = ANY (ARRAY['draft'::text, 'published'::text, 'sold'::text, 'withdrawn'::text, 'expired'::text])))
);

ALTER TABLE "public"."shelf_companies"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX shelf_companies_public_idx ON public.shelf_companies USING btree (status, auction_end);

CREATE POLICY "shelf_admin_all" ON "public"."shelf_companies"
  FOR ALL
  TO PUBLIC
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "shelf_public_read" ON "public"."shelf_companies"
  FOR SELECT
  TO PUBLIC
  USING (((status = 'published'::text) AND ((auction_end IS NULL) OR (auction_end > now()))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."shelf_companies" TO "anon", "authenticated", "postgres", "service_role";
