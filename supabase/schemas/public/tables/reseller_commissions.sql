CREATE TABLE "public"."reseller_commissions" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "reseller_id" uuid                     NOT NULL,
  "order_id"    uuid                     NOT NULL,
  "amount"      numeric                  NOT NULL DEFAULT 0,
  "status"      text                     NOT NULL DEFAULT 'pending'::text,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "reseller_commissions_amount_check" CHECK ((amount >= (0)::numeric)),
  CONSTRAINT "reseller_commissions_order_id_fkey" FOREIGN KEY (order_id) REFERENCES public.orders(id) ON DELETE CASCADE,
  CONSTRAINT "reseller_commissions_pkey" PRIMARY KEY (id),
  CONSTRAINT "reseller_commissions_reseller_id_fkey" FOREIGN KEY (reseller_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT "reseller_commissions_reseller_id_order_id_key" UNIQUE (reseller_id, order_id),
  CONSTRAINT "reseller_commissions_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'paid'::text, 'cancelled'::text])))
);

ALTER TABLE "public"."reseller_commissions"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_commissions_reseller_id ON public.reseller_commissions USING btree (reseller_id);

CREATE POLICY "Admins manage commissions" ON "public"."reseller_commissions"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Resellers read own commissions" ON "public"."reseller_commissions"
  FOR SELECT
  TO "authenticated"
  USING ((reseller_id = ( SELECT auth.uid() AS uid)));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."reseller_commissions" TO "anon", "authenticated", "postgres", "service_role";
