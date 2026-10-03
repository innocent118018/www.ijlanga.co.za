CREATE TABLE "public"."shelf_company_bids" (
  "id"               uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "shelf_company_id" uuid                     NOT NULL,
  "bidder_id"        uuid                     NOT NULL,
  "bidder_name"      text                     NOT NULL,
  "bidder_email"     text                     NOT NULL,
  "amount"           numeric(14,2)            NOT NULL,
  "created_at"       timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "shelf_company_bids_amount_check" CHECK ((amount > (0)::numeric)),
  CONSTRAINT "shelf_company_bids_bidder_id_fkey" FOREIGN KEY (bidder_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "shelf_company_bids_pkey" PRIMARY KEY (id),
  CONSTRAINT "shelf_company_bids_shelf_company_id_fkey" FOREIGN KEY (shelf_company_id) REFERENCES public.shelf_companies(id) ON DELETE CASCADE
);

ALTER TABLE "public"."shelf_company_bids"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX shelf_bids_company_idx ON public.shelf_company_bids USING btree (shelf_company_id, amount DESC, created_at DESC);

CREATE POLICY "shelf_bids_admin_all" ON "public"."shelf_company_bids"
  FOR ALL
  TO PUBLIC
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "shelf_bids_owner_insert" ON "public"."shelf_company_bids"
  FOR INSERT
  TO PUBLIC
  WITH CHECK ((bidder_id = auth.uid()));

CREATE POLICY "shelf_bids_owner_read" ON "public"."shelf_company_bids"
  FOR SELECT
  TO PUBLIC
  USING ((bidder_id = auth.uid()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."shelf_company_bids" TO "authenticated", "postgres", "service_role";

REVOKE ALL ON TABLE "public"."shelf_company_bids" FROM "anon";
