CREATE TABLE "public"."admin_account_overrides" (
  "id"         uuid                     NOT NULL DEFAULT gen_random_uuid(),
  "request_id" uuid                     NOT NULL,
  "user_id"    uuid                     NOT NULL,
  "token_hash" text                     NOT NULL,
  "expires_at" timestamp with time zone NOT NULL DEFAULT (now() + '48:00:00'::interval),
  "used_at"    timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "admin_account_overrides_pkey" PRIMARY KEY (id),
  CONSTRAINT "admin_account_overrides_request_id_fkey" FOREIGN KEY (request_id) REFERENCES public.account_access_requests(id) ON DELETE CASCADE,
  CONSTRAINT "admin_account_overrides_token_hash_key" UNIQUE (token_hash),
  CONSTRAINT "admin_account_overrides_user_id_fkey" FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

ALTER TABLE "public"."admin_account_overrides"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX admin_account_overrides_request_idx ON public.admin_account_overrides USING btree (request_id);

CREATE INDEX admin_account_overrides_user_idx ON public.admin_account_overrides USING btree (user_id);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."admin_account_overrides" TO "anon", "authenticated", "postgres", "service_role";
