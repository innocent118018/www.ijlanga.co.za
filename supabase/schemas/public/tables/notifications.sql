CREATE TABLE "public"."notifications" (
  "id"                uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "recipient_user_id" uuid,
  "recipient_email"   text,
  "event_type"        text                     NOT NULL,
  "subject"           text                     NOT NULL,
  "message"           text                     NOT NULL,
  "entity_type"       text,
  "entity_id"         uuid,
  "channel"           text                     NOT NULL DEFAULT 'email'::text,
  "status"            text                     NOT NULL DEFAULT 'pending'::text,
  "sent_at"           timestamp with time zone,
  "created_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "notifications_pkey" PRIMARY KEY (id),
  CONSTRAINT "notifications_recipient_user_id_fkey" FOREIGN KEY (recipient_user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."notifications"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX notifications_created_idx ON public.notifications USING btree (created_at DESC);

CREATE INDEX notifications_status_created_idx ON public.notifications USING btree (status, created_at);

CREATE POLICY "notifications_admin_all" ON "public"."notifications"
  FOR ALL
  TO "authenticated"
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "notifications_own" ON "public"."notifications"
  FOR SELECT
  TO "authenticated"
  USING ((recipient_user_id = auth.uid()));

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."notifications" TO "anon", "authenticated", "postgres", "service_role";
