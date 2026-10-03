CREATE TABLE "public"."employment_records" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "employer_user_id"  uuid                     NOT NULL,
  "employee_user_id"  uuid                     NOT NULL,
  "job_title"         text,
  "department"        text,
  "employment_status" text                     NOT NULL DEFAULT 'active'::text,
  "start_date"        date,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "employment_records_employer_user_id_employee_user_id_key" UNIQUE (employer_user_id, employee_user_id),
  CONSTRAINT "employment_records_employment_status_check" CHECK ((employment_status = ANY (ARRAY['active'::text, 'on_leave'::text, 'terminated'::text]))),
  CONSTRAINT "employment_records_pkey" PRIMARY KEY (id),
  CONSTRAINT "employment_records_employee_user_id_fkey" FOREIGN KEY (employee_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  CONSTRAINT "employment_records_employer_user_id_fkey" FOREIGN KEY (employer_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE
);

ALTER TABLE "public"."employment_records"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX employment_records_employee_idx ON public.employment_records USING btree (employee_user_id);

CREATE INDEX employment_records_employer_idx ON public.employment_records USING btree (employer_user_id);

CREATE POLICY "Admins can manage employment records" ON "public"."employment_records"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Employees can view their employment record" ON "public"."employment_records"
  FOR SELECT
  TO "authenticated"
  USING ((employee_user_id = auth.uid()));

CREATE POLICY "Employers can view their employment records" ON "public"."employment_records"
  FOR SELECT
  TO "authenticated"
  USING ((employer_user_id = auth.uid()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."employment_records" TO "anon", "authenticated", "postgres", "service_role";
