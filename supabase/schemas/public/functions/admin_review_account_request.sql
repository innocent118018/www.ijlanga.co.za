CREATE OR REPLACE FUNCTION public.admin_review_account_request (
  p_request_id uuid,
  p_status     text,
  p_notes      text DEFAULT NULL::text
)
  RETURNS public.account_access_requests
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_request public.account_access_requests; v_final boolean;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_status not in ('approved','rejected') then raise exception 'Invalid review status'; end if;

  select * into v_request from public.account_access_requests where id=p_request_id for update;
  if not found then raise exception 'Account request not found'; end if;

  update public.account_access_requests
  set admin_approval_status=p_status, admin_reviewed_by=auth.uid(), admin_reviewed_at=now(),
      notes=coalesce(p_notes,notes), updated_at=now()
  where id=p_request_id
  returning * into v_request;

  v_final := p_status='approved' and v_request.employer_approval_status in ('approved','not_required');

  if v_request.user_id is not null then
    update public.profiles
    set is_active=v_final,
        approval_status=case when p_status='rejected' or v_request.employer_approval_status='rejected' then 'rejected' when v_final then 'approved' else 'pending' end,
        approval_notes=p_notes,
        approved_at=case when v_final then now() else null end,
        approved_by=case when v_final then auth.uid() else null end,
        updated_at=now()
    where id=v_request.user_id;
  end if;

  if v_final then
    update public.account_access_requests set status='approved',updated_at=now() where id=p_request_id;
    perform public.record_notification(v_request.user_id,v_request.email,'account_approved','Account approved','Your IJ Langa Consulting account has been approved. You can now sign in.','account_access_request',p_request_id);
  elsif p_status='rejected' then
    update public.account_access_requests set status='rejected',updated_at=now() where id=p_request_id;
    perform public.record_notification(v_request.user_id,v_request.email,'account_rejected','Account request not approved','Your IJ Langa Consulting account request was not approved. Please contact IJ Langa Consulting.','account_access_request',p_request_id);
  else
    update public.account_access_requests set status='pending',updated_at=now() where id=p_request_id;
    perform public.record_notification(v_request.user_id,v_request.email,'account_waiting_employer','Employer approval still required','IJ Langa Consulting approved the account, but employer approval is still required before you can sign in.','account_access_request',p_request_id);
  end if;

  select * into v_request from public.account_access_requests where id=p_request_id;
  return v_request;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."admin_review_account_request"(uuid, text, text) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."admin_review_account_request"(uuid, text, text) FROM PUBLIC, "anon";
