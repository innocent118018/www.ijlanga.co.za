CREATE TABLE "public"."tasks" (
  "id"          uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "title"       text                     NOT NULL,
  "description" text,
  "status"      text                     NOT NULL DEFAULT 'pending'::text,
  "priority"    text                     NOT NULL DEFAULT 'normal'::text,
  "due_date"    date,
  "assigned_to" uuid,
  "created_by"  uuid,
  "customer_id" uuid,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "tasks_assigned_to_fkey" FOREIGN KEY (assigned_to) REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT "tasks_created_by_fkey" FOREIGN KEY (created_by) REFERENCES public.profiles(id) ON DELETE SET NULL,
  CONSTRAINT "tasks_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE SET NULL,
  CONSTRAINT "tasks_pkey" PRIMARY KEY (id),
  CONSTRAINT "tasks_priority_check" CHECK ((priority = ANY (ARRAY['low'::text, 'normal'::text, 'high'::text, 'urgent'::text]))),
  CONSTRAINT "tasks_status_check" CHECK ((status = ANY (ARRAY['pending'::text, 'in_progress'::text, 'completed'::text, 'cancelled'::text])))
);

ALTER TABLE "public"."tasks"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_tasks_assigned_to ON public.tasks USING btree (assigned_to);

CREATE INDEX idx_tasks_created_by ON public.tasks USING btree (created_by);

CREATE INDEX idx_tasks_customer_id ON public.tasks USING btree (customer_id);

CREATE POLICY "Admins manage tasks" ON "public"."tasks"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Employers create team tasks" ON "public"."tasks"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1
   FROM public.profiles p
  WHERE ((p.id = tasks.assigned_to) AND (p.employer_id = ( SELECT auth.uid() AS uid)))))));

CREATE POLICY "Employers delete own tasks" ON "public"."tasks"
  FOR DELETE
  TO "authenticated"
  USING (((created_by = ( SELECT auth.uid() AS uid)) OR public.is_admin()));

CREATE POLICY "Users create own tasks" ON "public"."tasks"
  FOR INSERT
  TO "authenticated"
  WITH CHECK (((created_by = ( SELECT auth.uid() AS uid)) AND ((assigned_to = ( SELECT auth.uid() AS uid)) OR (assigned_to IS NULL))));

CREATE POLICY "Users read assigned tasks" ON "public"."tasks"
  FOR SELECT
  TO "authenticated"
  USING (((assigned_to = ( SELECT auth.uid() AS uid)) OR (created_by = ( SELECT auth.uid() AS uid))));

CREATE POLICY "Users update assigned tasks" ON "public"."tasks"
  FOR UPDATE
  TO "authenticated"
  USING (((assigned_to = ( SELECT auth.uid() AS uid)) OR (created_by = ( SELECT auth.uid() AS uid)) OR public.is_admin()))
  WITH CHECK (((assigned_to = ( SELECT auth.uid() AS uid)) OR (created_by = ( SELECT auth.uid() AS uid)) OR public.is_admin()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."tasks" TO "anon", "authenticated", "postgres", "service_role";
