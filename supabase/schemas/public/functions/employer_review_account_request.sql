CREATE OR REPLACE FUNCTION public.employer_review_account_request (
  p_request_id uuid,
  p_status     text,
  p_notes      text DEFAULT NULL::text
)
  RETURNS public.account_access_requests
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
  AS $function$
declare v_request public.account_access_requests; v_employer public.profiles; v_final boolean;
begin
  if p_status not in ('approved','rejected') then raise exception 'Invalid review status'; end if;
  select * into v_request from public.account_access_requests where id=p_request_id for update;
  if not found then raise exception 'Account request not found'; end if;
  if v_request.matched_employer_id is null then raise exception 'This request is not linked to an employer'; end if;
  select * into v_employer from public.profiles where id=v_request.matched_employer_id and role='employer' and is_active=true;
  if not found or v_employer.id <> auth.uid() then raise exception 'Employer access required'; end if;

  update public.account_access_requests
  set employer_approval_status=p_status, employer_reviewed_by=auth.uid(), employer_reviewed_at=now(),
      notes=coalesce(p_notes,notes), updated_at=now()
  where id=p_request_id
  returning * into v_request;

  v_final := p_status='approved' and v_request.admin_approval_status='approved';

  if v_request.user_id is not null then
    update public.profiles
    set is_active=v_final,
        approval_status=case when p_status='rejected' or v_request.admin_approval_status='rejected' then 'rejected' when v_final then 'approved' else 'pending' end,
        updated_at=now()
    where id=v_request.user_id;

    if p_status='approved' then
      perform public.record_notification(v_request.user_id,v_request.email,'employer_approved_employee','Employer approved your account','Your employer has approved your employee account. IJ Langa administrator approval is still required unless already completed.','account_access_request',p_request_id);
    elsif p_status='rejected' then
      perform public.record_notification(v_request.user_id,v_request.email,'employer_rejected_employee','Employer did not approve your account','Your employer did not approve the employee account request. Please contact IJ Langa Consulting.','account_access_request',p_request_id);
    end if;
  end if;

  if v_final then
    update public.account_access_requests set status='approved',updated_at=now() where id=p_request_id;
    perform public.record_notification(v_request.user_id,v_request.email,'account_approved','Account approved','Your IJ Langa Consulting account has been approved. You can now sign in.','account_access_request',p_request_id);
  elsif p_status='rejected' or v_request.admin_approval_status='rejected' then
    update public.account_access_requests set status='rejected',updated_at=now() where id=p_request_id;
  else
    update public.account_access_requests set status='pending',updated_at=now() where id=p_request_id;
  end if;

  select * into v_request from public.account_access_requests where id=p_request_id;
  return v_request;
end;
$function$;

GRANT EXECUTE ON FUNCTION "public"."employer_review_account_request"(uuid, text, text) TO "authenticated", "postgres", "service_role";

REVOKE ALL ON FUNCTION "public"."employer_review_account_request"(uuid, text, text) FROM PUBLIC, "anon";
