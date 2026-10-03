CREATE TABLE "public"."quote_request_rate_limits" (
  "bucket_key"        text                     NOT NULL,
  "window_started_at" timestamp with time zone NOT NULL DEFAULT now(),
  "request_count"     integer                  NOT NULL DEFAULT 0,
  "updated_at"        timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "quote_request_rate_limits_pkey" PRIMARY KEY (bucket_key)
);

ALTER TABLE "public"."quote_request_rate_limits"
  ENABLE ROW LEVEL SECURITY;

CREATE INDEX quote_request_rate_limits_updated_at_idx ON public.quote_request_rate_limits USING btree (updated_at);

GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE ON TABLE "public"."quote_request_rate_limits" TO "postgres", "service_role";

REVOKE ALL ON TABLE "public"."quote_request_rate_limits" FROM "anon", "authenticated";
