CREATE TABLE "public"."account_access_requests" (
  "id"                          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "user_id"                     uuid,
  "email"                       text                     NOT NULL,
  "first_name"                  text,
  "last_name"                   text,
  "surname"                     text,
  "phone"                       text,
  "id_number"                   text,
  "company_registration_number" text,
  "matched_employer_id"         uuid,
  "request_type"                text                     NOT NULL DEFAULT 'new_account'::text,
  "status"                      text                     NOT NULL DEFAULT 'pending'::text,
  "id_copy_path"                text,
  "proof_of_address_path"       text,
  "notes"                       text,
  "reviewed_by"                 uuid,
  "reviewed_at"                 timestamp with time zone,
  "created_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "employer_approval_status"    text                     NOT NULL DEFAULT 'not_required'::text,
  "employer_reviewed_by"        uuid,
  "employer_reviewed_at"        timestamp with time zone,
  "admin_approval_status"       text                     NOT NULL DEFAULT 'pending'::text,
  "admin_reviewed_by"           uuid,
  "admin_reviewed_at"           timestamp with time zone,
  CONSTRAINT "account_access_requests_admin_approval_status_check" CHECK ((admin_approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
  CONSTRAINT "account_access_requests_admin_reviewed_by_fkey" FOREIGN KEY (admin_reviewed_by) REFERENCES auth.users(id),
  CONSTRAINT "account_access_requests_employer_approval_status_check"
    CHECK ((employer_approval_status = ANY (ARRAY['not_required'::text, 'pending'::text, 'approved'::text, 'rejected'::text]))),
  CONSTRAINT "account_access_requests_employer_reviewed_by_fkey" FOREIGN KEY (employer_reviewed_by) REFERENCES auth.users(id),
  CONSTRAINT "account_access_requests_pkey" PRIMARY KEY (id),
  CONSTRAINT "account_access_requests_request_type_check" CHECK ((request_type = ANY (ARRAY['new_account'::text, 'existing_account_update'::text]))),
  CONSTRAINT "account_access_requests_reviewed_by_fkey" FOREIGN KEY (reviewed_by) REFERENCES auth.users(id),
  CONSTRAINT "account_access_requests_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
  CONSTRAINT "account_access_requests_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "account_access_requests_matched_employer_id_fkey" FOREIGN KEY (matched_employer_id) REFERENCES public.profiles(id)
);

ALTER TABLE "public"."account_access_requests"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX account_access_requests_employer_idx ON public.account_access_requests USING btree (matched_employer_id, status);

CREATE INDEX account_access_requests_status_idx ON public.account_access_requests USING btree (status, created_at DESC);

CREATE POLICY "account_access_requests_admin_all" ON "public"."account_access_requests"
  FOR ALL
  TO PUBLIC
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "account_access_requests_employer_read" ON "public"."account_access_requests"
  FOR SELECT
  TO "authenticated"
  USING ((matched_employer_id = auth.uid()));

CREATE POLICY "account_access_requests_employer_update" ON "public"."account_access_requests"
  FOR UPDATE
  TO "authenticated"
  USING ((matched_employer_id = auth.uid()))
  WITH CHECK ((matched_employer_id = auth.uid()));

CREATE POLICY "account_access_requests_own_read" ON "public"."account_access_requests"
  FOR SELECT
  TO PUBLIC
  USING ((auth.uid() = user_id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."account_access_requests" TO "anon", "authenticated", "postgres", "service_role";
