CREATE TABLE "public"."profiles" (
  "id"                          uuid                     NOT NULL,
  "full_name"                   text,
  "email"                       text,
  "role"                        text                     NOT NULL DEFAULT 'client'::text,
  "created_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"                  timestamp with time zone NOT NULL DEFAULT now(),
  "phone"                       text,
  "job_title"                   text,
  "department"                  text,
  "is_active"                   boolean                  NOT NULL DEFAULT true,
  "employer_id"                 uuid,
  "organization_name"           text,
  "first_name"                  text,
  "last_name"                   text,
  "surname"                     text,
  "id_number"                   text,
  "company_registration_number" text,
  "approval_status"             text                     NOT NULL DEFAULT 'approved'::text,
  "approval_notes"              text,
  "approved_at"                 timestamp with time zone,
  "approved_by"                 uuid,
  "email_verified_at"           timestamp with time zone,
  CONSTRAINT "profiles_approval_status_check" CHECK ((approval_status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text]))),
  CONSTRAINT "profiles_approved_by_fkey" FOREIGN KEY (approved_by) REFERENCES auth.users(id),
  CONSTRAINT "profiles_id_fkey" FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT "profiles_pkey" PRIMARY KEY (id),
  CONSTRAINT "profiles_employer_id_fkey" FOREIGN KEY (employer_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT "profiles_role_check" CHECK ((role = ANY (ARRAY['admin'::text, 'employer'::text, 'reseller'::text, 'employee'::text, 'client'::text])))
);

ALTER TABLE "public"."profiles"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_profiles_employer_id ON public.profiles USING btree (employer_id);

CREATE UNIQUE INDEX profiles_company_reg_unique ON public.profiles USING btree (company_registration_number)
  WHERE ((company_registration_number IS NOT NULL) AND (btrim(company_registration_number) <> ''::text));

CREATE UNIQUE INDEX profiles_id_number_unique ON public.profiles USING btree (id_number)
  WHERE ((id_number IS NOT NULL) AND (btrim(id_number) <> ''::text));

CREATE INDEX profiles_role_active_idx ON public.profiles USING btree (ROLE, is_active);

CREATE TRIGGER protect_profile_authorization_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_authorization_fields();

CREATE TRIGGER sync_customer_from_profile
  AFTER INSERT OR UPDATE OF email, full_name, organization_name, phone, ROLE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_from_profile();

CREATE TRIGGER sync_customer_profile_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_from_profile();

CREATE TRIGGER sync_customer_profile_update
  AFTER UPDATE OF email, full_name, organization_name, phone, ROLE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_from_profile();

CREATE POLICY "Admins can manage profiles" ON "public"."profiles"
  FOR ALL
  TO "authenticated"
  USING (( SELECT public.is_admin() AS is_admin))
  WITH CHECK (( SELECT public.is_admin() AS is_admin));

CREATE POLICY "Employers can read team profiles" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING (((employer_id = ( SELECT auth.uid() AS uid)) OR (id = ( SELECT auth.uid() AS uid))));

CREATE POLICY "Users can create own profile" ON "public"."profiles"
  FOR INSERT
  TO "authenticated"
  WITH CHECK ((( SELECT auth.uid() AS uid) = id));

CREATE POLICY "Users can read own profile" ON "public"."profiles"
  FOR SELECT
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = id));

CREATE POLICY "Users can update own profile details" ON "public"."profiles"
  FOR UPDATE
  TO "authenticated"
  USING ((( SELECT auth.uid() AS uid) = id))
  WITH CHECK ((( SELECT auth.uid() AS uid) = id));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "anon";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."profiles" TO "postgres", "service_role";

REVOKE ALL ("department") ON TABLE "public"."profiles" FROM "authenticated";

GRANT UPDATE ("department") ON TABLE "public"."profiles" TO "authenticated";

REVOKE ALL ("email") ON TABLE "public"."profiles" FROM "authenticated";

GRANT UPDATE ("email") ON TABLE "public"."profiles" TO "authenticated";

REVOKE ALL ("full_name") ON TABLE "public"."profiles" FROM "authenticated";

GRANT UPDATE ("full_name") ON TABLE "public"."profiles" TO "authenticated";

REVOKE ALL ("job_title") ON TABLE "public"."profiles" FROM "authenticated";

GRANT UPDATE ("job_title") ON TABLE "public"."profiles" TO "authenticated";

REVOKE ALL ("phone") ON TABLE "public"."profiles" FROM "authenticated";

GRANT UPDATE ("phone") ON TABLE "public"."profiles" TO "authenticated";

REVOKE ALL ON TABLE "public"."profiles" FROM "authenticated";

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE ON TABLE "public"."profiles" TO "authenticated";
