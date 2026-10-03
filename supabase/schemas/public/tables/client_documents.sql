CREATE TABLE "public"."client_documents" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "customer_id"   uuid                     NOT NULL,
  "title"         text                     NOT NULL,
  "document_type" text                     NOT NULL DEFAULT 'document'::text,
  "storage_path"  text,
  "description"   text,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "client_documents_pkey" PRIMARY KEY (id),
  CONSTRAINT "client_documents_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE CASCADE
);

ALTER TABLE "public"."client_documents"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX client_documents_customer_idx ON public.client_documents USING btree (customer_id, created_at DESC);

CREATE POLICY "documents_admin_all" ON "public"."client_documents"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "documents_customer_read" ON "public"."client_documents"
  FOR SELECT
  TO "authenticated"
  USING ((EXISTS ( SELECT 1
   FROM public.customers c
  WHERE ((c.id = client_documents.customer_id) AND (c.auth_user_id = auth.uid())))));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."client_documents" TO "anon", "authenticated", "postgres", "service_role";
