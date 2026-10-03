CREATE OR REPLACE FUNCTION public.record_notification (
  p_recipient_user_id uuid,
  p_recipient_email   text,
  p_event_type        text,
  p_subject           text,
  p_message           text,
  p_entity_type       text DEFAULT NULL::text,
  p_entity_id         uuid DEFAULT NULL::uuid
)
  RETURNS uuid
  LANGUAGE sql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
 insert into public.notifications(recipient_user_id,recipient_email,event_type,subject,message,entity_type,entity_id)
 values(p_recipient_user_id,p_recipient_email,p_event_type,p_subject,p_message,p_entity_type,p_entity_id) returning id;
$function$;

GRANT EXECUTE ON FUNCTION "public"."record_notification"(uuid, text, text, text, text, text, uuid) TO "anon", "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."record_notification"(uuid, text, text, text, text, text, uuid) FROM PUBLIC;
