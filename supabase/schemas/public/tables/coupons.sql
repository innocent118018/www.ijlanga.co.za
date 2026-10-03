CREATE TABLE "public"."coupons" (
  "id"             uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "code"           text                     NOT NULL,
  "description"    text,
  "discount_type"  text                     NOT NULL DEFAULT 'percentage'::text,
  "discount_value" numeric                  NOT NULL DEFAULT 0,
  "min_subtotal"   numeric                  NOT NULL DEFAULT 0,
  "max_uses"       integer,
  "used_count"     integer                  NOT NULL DEFAULT 0,
  "starts_at"      timestamp with time zone,
  "expires_at"     timestamp with time zone,
  "is_active"      boolean                  NOT NULL DEFAULT true,
  "created_at"     timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "coupons_code_key" UNIQUE (code),
  CONSTRAINT "coupons_discount_type_check" CHECK ((discount_type = ANY (ARRAY['percentage'::text, 'fixed'::text]))),
  CONSTRAINT "coupons_discount_value_check" CHECK ((discount_value >= (0)::numeric)),
  CONSTRAINT "coupons_max_uses_check" CHECK (((max_uses IS NULL) OR (max_uses > 0))),
  CONSTRAINT "coupons_min_subtotal_check" CHECK ((min_subtotal >= (0)::numeric)),
  CONSTRAINT "coupons_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."coupons"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX coupons_code_idx ON public.coupons USING btree (code);

CREATE POLICY "coupons_admin_all" ON "public"."coupons"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "coupons_public_active" ON "public"."coupons"
  FOR SELECT
  TO "anon", "authenticated"
  USING
    (((is_active = true) AND ((starts_at IS NULL) OR (starts_at <= now())) AND ((expires_at IS NULL) OR (expires_at >= now())) AND ((max_uses IS NULL) OR (used_count < max_uses))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."coupons" TO "anon", "authenticated", "postgres", "service_role";
