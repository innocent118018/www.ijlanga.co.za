CREATE TABLE "public"."accounting_audit_log" (
  "id"          bigint                   GENERATED ALWAYS AS IDENTITY NOT NULL,
  "customer_id" uuid,
  "actor_id"    uuid,
  "action"      text                     NOT NULL,
  "entity_type" text                     NOT NULL,
  "entity_id"   uuid,
  "details"     jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"  timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "accounting_audit_log_actor_id_fkey" FOREIGN KEY (actor_id) REFERENCES auth.users(id),
  CONSTRAINT "accounting_audit_log_pkey" PRIMARY KEY (id),
  CONSTRAINT "accounting_audit_log_customer_id_fkey" FOREIGN KEY (customer_id) REFERENCES public.customers(id) ON DELETE RESTRICT
);

ALTER TABLE "public"."accounting_audit_log"
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "accounting_audit_read_admin_only" ON "public"."accounting_audit_log"
  FOR SELECT
  TO "authenticated"
  USING (public.is_admin());

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."accounting_audit_log" TO "anon", "authenticated", "postgres", "service_role";
