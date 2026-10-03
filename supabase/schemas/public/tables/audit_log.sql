CREATE TABLE "public"."audit_log" (
  "id"            uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "actor_user_id" uuid,
  "action"        text                     NOT NULL,
  "entity_type"   text,
  "entity_id"     uuid,
  "details"       jsonb                    NOT NULL DEFAULT '{}'::jsonb,
  "created_at"    timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "audit_log_actor_user_id_fkey" FOREIGN KEY (actor_user_id) REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT "audit_log_pkey" PRIMARY KEY (id)
);

ALTER TABLE "public"."audit_log"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX audit_log_created_idx ON public.audit_log USING btree (created_at DESC);

CREATE POLICY "audit_admin_read" ON "public"."audit_log"
  FOR SELECT
  TO "authenticated"
  USING (public.is_admin());

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."audit_log" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."audit_log" FROM "authenticated";

GRANT SELECT ON TABLE "public"."audit_log" TO "authenticated";

REVOKE ALL ON TABLE "public"."audit_log" FROM "anon";
