CREATE TABLE "public"."shelf_company_reviews" (
  "shelf_company_id"         uuid                     NOT NULL,
  "business_overview"        text                     NOT NULL DEFAULT ''::text,
  "historical_financials"    text                     NOT NULL DEFAULT ''::text,
  "current_year_performance" text                     NOT NULL DEFAULT ''::text,
  "indicative_valuation"     text                     NOT NULL DEFAULT ''::text,
  "assets_and_customers"     text                     NOT NULL DEFAULT ''::text,
  "shareholder_structure"    text                     NOT NULL DEFAULT ''::text,
  "sale_rationale"           text                     NOT NULL DEFAULT ''::text,
  "material_matters"         text                     NOT NULL DEFAULT ''::text,
  "updated_by"               uuid,
  "updated_at"               timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "shelf_company_reviews_pkey" PRIMARY KEY (shelf_company_id),
  CONSTRAINT "shelf_company_reviews_shelf_company_id_fkey" FOREIGN KEY (shelf_company_id) REFERENCES public.shelf_companies(id) ON DELETE CASCADE,
  CONSTRAINT "shelf_company_reviews_updated_by_fkey" FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE "public"."shelf_company_reviews"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Approved clients read active shelf reviews" ON "public"."shelf_company_reviews"
  FOR SELECT
  TO "authenticated"
  USING (((EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = auth.uid()) AND (p.role = 'client'::text) AND (p.is_active = true) AND (p.approval_status = 'approved'::text)))) AND (EXISTS ( SELECT 1
   FROM public.shelf_companies s
  WHERE
    ((s.id = shelf_company_reviews.shelf_company_id) AND (s.status = 'published'::text) AND ((s.auction_start IS NULL) OR (s.auction_start <= now())) AND ((s.auction_end IS NULL)
    OR (s.auction_end > now())))))));

CREATE POLICY "Shelf review admins manage" ON "public"."shelf_company_reviews"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."shelf_company_reviews" TO "authenticated", "postgres", "service_role";

REVOKE ALL ON TABLE "public"."shelf_company_reviews" FROM "anon";
