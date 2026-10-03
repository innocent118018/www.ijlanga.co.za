CREATE TABLE "public"."products" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "sku"         text                     NOT NULL,
  "slug"        text                     NOT NULL,
  "name"        text                     NOT NULL,
  "category"    text                     NOT NULL,
  "description" text,
  "price"       numeric(12,2),
  "price_label" text,
  "icon"        text,
  "is_active"   boolean                  NOT NULL DEFAULT true,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "archived_at" timestamp with time zone,
  CONSTRAINT "products_pkey" PRIMARY KEY (id),
  CONSTRAINT "products_sku_key" UNIQUE (sku),
  CONSTRAINT "products_slug_key" UNIQUE (slug)
);

ALTER TABLE "public"."products"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX products_active_idx ON public.products USING btree (is_active);

CREATE INDEX products_active_sku_idx ON public.products USING btree (is_active, sku);

CREATE INDEX products_category_idx ON public.products USING btree (category);

CREATE POLICY "Admins can manage products" ON "public"."products"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "public can view active products" ON "public"."products"
  FOR SELECT
  TO PUBLIC
  USING ((is_active = true));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."products" TO "anon", "authenticated", "postgres", "service_role";
