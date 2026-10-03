CREATE POLICY "admins manage client documents" ON "storage"."objects"
  FOR ALL
  TO "authenticated"
  USING (((bucket_id = 'client-documents'::text) AND public.is_admin()))
  WITH CHECK (((bucket_id = 'client-documents'::text) AND public.is_admin()));

CREATE POLICY "clients read own documents" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'client-documents'::text) AND (EXISTS ( SELECT 1
   FROM public.customers c
  WHERE ((c.auth_user_id = auth.uid()) AND ((objects.name = (c.id)::text) OR (objects.name ~~ ((c.id)::text || '/%'::text))))))));

CREATE POLICY "account_verification_admin_read" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'account-verification'::text) AND public.is_admin()));

CREATE POLICY "accounting_storage_insert_own" ON "storage"."objects"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((bucket_id = 'accounting-imports'::text) AND ((storage.foldername(name))[1] = (public.current_customer_id())::text)));

CREATE POLICY "accounting_storage_read_own_or_admin" ON "storage"."objects"
  FOR SELECT
  TO "authenticated"
  USING (((bucket_id = 'accounting-imports'::text) AND (EXISTS ( SELECT 1
   FROM public.accounting_imports i
  WHERE ((i.storage_path = objects.name) AND ((i.customer_id = public.current_customer_id()) OR public.is_admin()))))));
