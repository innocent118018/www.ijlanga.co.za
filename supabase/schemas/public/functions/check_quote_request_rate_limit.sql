CREATE OR REPLACE FUNCTION public.check_quote_request_rate_limit (
  p_bucket_key     text,
  p_limit          integer DEFAULT 5,
  p_window_seconds integer DEFAULT 900
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare
  v_started timestamptz;
  v_count integer;
begin
  if length(coalesce(p_bucket_key,'')) < 8 then
    return false;
  end if;

  insert into public.quote_request_rate_limits(bucket_key, window_started_at, request_count, updated_at)
  values (p_bucket_key, now(), 1, now())
  on conflict (bucket_key) do update
    set window_started_at = case
      when public.quote_request_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
        then now()
      else public.quote_request_rate_limits.window_started_at
    end,
    request_count = case
      when public.quote_request_rate_limits.window_started_at <= now() - make_interval(secs => p_window_seconds)
        then 1
      else public.quote_request_rate_limits.request_count + 1
    end,
    updated_at = now();

  select window_started_at, request_count into v_started, v_count
  from public.quote_request_rate_limits where bucket_key = p_bucket_key;

  return v_started > now() - make_interval(secs => p_window_seconds)
     and v_count <= p_limit;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."check_quote_request_rate_limit"(text, integer, integer) TO "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."check_quote_request_rate_limit"(text, integer, integer) FROM PUBLIC, "anon", "authenticated";
