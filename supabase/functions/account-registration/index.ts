import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const clean = (v: FormDataEntryValue | null) => String(v ?? "").trim();
const allowedMime = new Set(["application/pdf", "image/jpeg", "image/png"]);
const maxBytes = 7 * 1024 * 1024;

function ext(file: File) {
  const n = file.name.toLowerCase();
  if (file.type === "application/pdf" || n.endsWith(".pdf")) return "pdf";
  if (file.type === "image/png" || n.endsWith(".png")) return "png";
  return "jpg";
}

async function saveFile(admin: any, file: File, path: string) {
  if (!file || file.size === 0) throw new Error("Both verification documents are required.");
  if (file.size > maxBytes) throw new Error("Each verification document must be 7 MB or smaller.");
  if (!allowedMime.has(file.type)) throw new Error("Verification documents must be PDF, JPG or PNG files.");
  const { error } = await admin.storage.from("account-verification").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error("Document upload failed: " + error.message);
  return path;
}

const SITE_URL = "https://www.ijlanga.co.za";
const DASHBOARD_URL = SITE_URL + "/dashboard.html";
const AUTH_CONFIRM_URL = SITE_URL + "/account-verification.html";

function authEmailHtml(email: string, link: string, token: string) {
  return `<html><body style="margin:0;background:#f4f7f9;font-family:Arial,sans-serif;color:#10243a"><div style="max-width:620px;margin:30px auto;background:#fff;border:1px solid #dfe6ed;border-radius:18px;overflow:hidden"><div style="background:#0b2239;padding:26px 30px;color:#fff"><strong style="font-size:18px;letter-spacing:2px">IJ LANGA CONSULTING</strong><div style="font-size:11px;color:#c69b4a;margin-top:6px">ACCOUNTING YOU CAN TRUST</div></div><div style="padding:34px"><h1 style="font-size:25px;margin:0 0 14px;color:#0b2239">Confirm your IJ Langa Consulting account</h1><p style="line-height:1.7;color:#637487">Your account has been created. Please confirm your email address before signing in.</p><p style="text-align:center;margin:30px 0"><a href="${link}" style="display:inline-block;background:#0b2239;color:#fff;text-decoration:none;padding:14px 22px;border-radius:9px;font-weight:bold">Confirm email</a></p><p style="font-size:12px;color:#81909e;line-height:1.6">If the button does not work, copy and paste this link into your browser:<br><span style="word-break:break-all">${link}</span></p><p style="font-size:13px;color:#637487">Your one-time verification code: <strong style="color:#0b2239">${token}</strong></p><p style="font-size:11px;color:#9aa7b3;margin-top:28px">This email was sent to ${email}. If you did not request this action, you can safely ignore this message.</p></div></div></body></html>`;
}

async function issueAdminOverride(admin: any, requestId: string, userId: string, name: string, userEmail: string) {
  const rawToken = crypto.randomUUID() + "." + crypto.randomUUID();
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(rawToken));
  const tokenHash = Array.from(new Uint8Array(bytes)).map((b) => b.toString(16).padStart(2, "0")).join("");
  const { error: tokenError } = await admin.from("admin_account_overrides").insert({ request_id: requestId, user_id: userId, token_hash: tokenHash });
  if (tokenError) throw new Error("Could not create the administrator verification override: " + tokenError.message);
  const link = SITE_URL + "/admin-verification.html?token=" + encodeURIComponent(rawToken);
  // Verification override links are sent only to the designated administrator mailbox.
  const recipients = [{ id: null, email: "info@ijlanga.co.za" }];
  const key = Deno.env.get("RESEND_API_KEY") || Deno.env.get("resend");
  const from = Deno.env.get("RESEND_FROM") || "IJ Langa Consulting <no-reply@ijlanga.co.za>";
  if (!key) return { emailed: false };
  const html = `<html><body style="margin:0;background:#f4f7f9;font-family:Arial,sans-serif;color:#10243a"><div style="max-width:650px;margin:30px auto;background:#fff;border:1px solid #dfe6ed;border-radius:18px;overflow:hidden"><div style="background:#0b2239;padding:26px 30px;color:#fff"><strong style="font-size:18px;letter-spacing:2px">IJ LANGA CONSULTING</strong><div style="font-size:11px;color:#c69b4a;margin-top:6px">ADMINISTRATOR VERIFICATION</div></div><div style="padding:34px"><h1 style="color:#0b2239">Account verification requires administrator action</h1><p style="line-height:1.7;color:#637487">Registration: <strong>${name}</strong> (${userEmail}).</p><p style="line-height:1.7;color:#637487">Use the secure administrator link to bypass email verification and activate the account. The link expires in 48 hours and can only be used once.</p><p style="text-align:center;margin:30px 0"><a href="${link}" style="display:inline-block;background:#0b2239;color:#fff;text-decoration:none;padding:14px 22px;border-radius:9px;font-weight:bold">Verify &amp; Activate Account</a></p><p style="font-size:12px;color:#81909e;line-height:1.6;word-break:break-all">${link}</p><p style="font-size:11px;color:#9aa7b3;margin-top:28px">For authorised IJ Langa administrators only.</p></div></div></body></html>`;
  let sent = 0;
  for (const a of recipients) {
    if (!a.email) continue;
    try {
      const response = await fetch("https://api.resend.com/emails", { method:"POST", headers:{Authorization:"Bearer "+key,"Content-Type":"application/json"}, body:JSON.stringify({from,to:[a.email],subject:"Administrator action required: verify and activate account",html,text:"Administrator action required for "+name+" ("+userEmail+"). Verify and activate: "+link+"\n\nThis link expires in 48 hours and can only be used once."}) });
      if (response.ok) sent++;
    } catch (_) {}
  }
  return { emailed: sent > 0 };
}

async function sendSignupConfirmation(admin: any, email: string, password: string, metadata: Record<string,unknown>, existingUserId?: string) {
  let user: any;
  let tokenHash = "";
  let token = "";

  if (existingUserId) {
    const { error: updateError } = await admin.auth.admin.updateUserById(existingUserId, {
      password,
      phone: String(metadata.phone || ""),
      email_confirm: false,
      user_metadata: metadata,
    });
    if (updateError) throw new Error("Could not repair the existing authentication account: " + updateError.message);

    const { data, error } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: { redirectTo: DASHBOARD_URL },
    });
    if (error || !data?.properties?.hashed_token || !data?.user?.id) {
      throw new Error("Could not generate the email verification link for the existing account: " + (error?.message || "missing verification token"));
    }
    user = data.user;
    tokenHash = data.properties.hashed_token;
    token = data.properties.email_otp || "";
  } else {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: { data: metadata, redirectTo: DASHBOARD_URL },
    });
    if (error || !data?.properties?.hashed_token || !data?.user?.id) {
      throw new Error("Could not generate the email verification link: " + (error?.message || "missing verification token"));
    }
    user = data.user;
    tokenHash = data.properties.hashed_token;
    token = data.properties.email_otp || "";
  }

  const link = AUTH_CONFIRM_URL + "?" + new URLSearchParams({
    token_hash: tokenHash,
    type: "email",
    redirect_to: DASHBOARD_URL,
  }).toString();

  const resendKey = Deno.env.get("RESEND_API_KEY") || Deno.env.get("resend");
  const from = Deno.env.get("RESEND_FROM") || "IJ Langa Consulting <no-reply@ijlanga.co.za>";
  if (!resendKey) throw new Error("RESEND_API_KEY is not configured.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: "Bearer " + resendKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [email],
      subject: "Confirm your IJ Langa Consulting account",
      html: authEmailHtml(email, link, token),
      text: "Confirm your IJ Langa Consulting account: " + link + "\n\nYour one-time verification code: " + token,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result?.message || "Resend rejected the verification email.");
  return user;
}

async function findAuthUserByEmail(admin: any, email: string) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error("Could not check the existing authentication account: " + error.message);
  return (data?.users || []).find((u: any) => String(u.email || "").toLowerCase() === email.toLowerCase()) || null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST required." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

    const form = await req.formData();
    const first_name = clean(form.get("first_name"));
    const last_name = clean(form.get("last_name"));
    const surname = clean(form.get("surname"));
    const email = clean(form.get("email")).toLowerCase();
    const phone = clean(form.get("phone"));
    const id_number = clean(form.get("id_number"));
    const company_registration_number = clean(form.get("company_registration_number"));
    const password = clean(form.get("password"));
    const idCopy = form.get("id_copy");
    const proofOfAddress = form.get("proof_of_address");

    if (!first_name || !last_name || !surname || !email || !phone || (!id_number && !company_registration_number)) {
      return json({ error: "First Name, Last Name, Surname, Email Address, Cell Number and either an ID Number or Company Registration Number are required." }, 400);
    }
    if (!email.includes("@")) return json({ error: "Enter a valid email address." }, 400);
    if (!password || password.length < 8) return json({ error: "Password must be at least 8 characters." }, 400);
    if (!(idCopy instanceof File) || !(proofOfAddress instanceof File)) {
      return json({ error: "ID Copy and Proof Of Address are required for verification." }, 400);
    }

    const { data: existingById } = await admin.from("profiles")
      .select("id,email,full_name,role,employer_id,approval_status,first_name,last_name,surname,phone,id_number,company_registration_number,is_active")
      .eq("id_number", id_number)
      .maybeSingle();

    const { data: existingByCompany } = company_registration_number
      ? await admin.from("profiles").select("id,email,full_name,role,employer_id,approval_status,first_name,last_name,surname,phone,id_number,company_registration_number,is_active")
          .eq("company_registration_number", company_registration_number).maybeSingle()
      : { data: null };

    const { data: existingByEmail } = await admin.from("profiles")
      .select("id,email,full_name,role,employer_id,approval_status")
      .ilike("email", email)
      .maybeSingle();

    const existing = existingById || existingByCompany || existingByEmail;

    // Repair accounts that were created by an earlier/incomplete registration
    // flow but never received the applicant's registration details.
    const incompleteExisting = existing &&
      !existing.full_name &&
      !existing.first_name &&
      !existing.last_name &&
      !existing.surname &&
      !existing.phone &&
      !existing.id_number &&
      !existing.company_registration_number;

    if (incompleteExisting) {
      const full_name = first_name + " " + last_name + " " + surname;
      const { error: updateAuthError } = await admin.auth.admin.updateUserById(existing.id, {
        password,
        phone,
        email_confirm: false,
        user_metadata: {
          ...(existing.user_metadata || {}),
          first_name,
          last_name,
          surname,
          full_name,
          phone,
          id_number: id_number || null,
          company_registration_number: company_registration_number || null,
        },
      });
      if (updateAuthError) return json({ error: "The existing account could not be completed: " + updateAuthError.message }, 400);

      const { data: employer } = await admin.from("profiles")
        .select("id,email,full_name,organization_name")
        .eq("role","employer")
        .eq("is_active",true)
        .eq("id_number",id_number)
        .maybeSingle();

      const role = employer ? "employee" : "client";
      const requestId = crypto.randomUUID();

      const { error: profileUpdateError } = await admin.from("profiles").update({
        email,
        full_name,
        first_name,
        last_name,
        surname,
        phone,
        id_number: id_number || null,
        company_registration_number: company_registration_number || null,
        role,
        employer_id: employer?.id || null,
        organization_name: employer?.organization_name || null,
        is_active: false,
        approval_status: "pending",
        approved_at: null,
        approved_by: null,
        email_verified_at: null,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);

      if (profileUpdateError) return json({ error: "The account profile could not be completed: " + profileUpdateError.message }, 500);

      const idPath = existing.id + "/" + requestId + "-id-copy." + ext(idCopy);
      const addressPath = existing.id + "/" + requestId + "-proof-of-address." + ext(proofOfAddress);
      try {
        await saveFile(admin, idCopy, idPath);
        await saveFile(admin, proofOfAddress, addressPath);
      } catch (e) {
        await admin.storage.from("account-verification").remove([idPath, addressPath]);
        throw e;
      }

      const { error: reqError } = await admin.from("account_access_requests").insert({
        id: requestId,
        user_id: existing.id,
        email,
        first_name,
        last_name,
        surname,
        phone,
        id_number: id_number || null,
        company_registration_number: company_registration_number || null,
        matched_employer_id: employer?.id || null,
        request_type: "new_account",
        status: "pending",
        id_copy_path: idPath,
        proof_of_address_path: addressPath,
        notes: "Legacy incomplete account repaired and registration details attached. Awaiting email verification and required approval.",
      });
      if (reqError) throw reqError;

      try {
        await issueAdminOverride(admin, requestId, existing.id, full_name, email);
      } catch (overrideError) {
        console.error("Administrator override email could not be prepared:", overrideError);
      }

      return json({
        ok: true,
        existing_account: false,
        repaired_account: true,
        employee_match: Boolean(employer),
        request_id: requestId,
        role,
        message: "Your existing incomplete account has been completed with your registration details. Check your email to verify the account, then wait for the required approval before signing in.",
      });
    }

    if (existing) {
      const requestId = crypto.randomUUID();
      const idPath = existing.id + "/" + requestId + "-id-copy." + ext(idCopy);
      const addressPath = existing.id + "/" + requestId + "-proof-of-address." + ext(proofOfAddress);

      await saveFile(admin, idCopy, idPath);
      try {
        await saveFile(admin, proofOfAddress, addressPath);
      } catch (e) {
        await admin.storage.from("account-verification").remove([idPath]);
        throw e;
      }

      const { error: reqError } = await admin.from("account_access_requests").insert({
        id: requestId,
        user_id: existing.id,
        email: existing.email || email,
        first_name, last_name, surname, phone, id_number: id_number || null,
        company_registration_number: company_registration_number || null,
        request_type: "existing_account_update",
        status: "pending",
        id_copy_path: idPath,
        proof_of_address_path: addressPath,
        notes: "Existing account detected during public sign-up. Verification documents submitted for administrator review.",
      });
      if (reqError) {
        await admin.storage.from("account-verification").remove([idPath, addressPath]);
        throw reqError;
      }

      try {
        await issueAdminOverride(admin, requestId, existing.id, first_name + " " + last_name + " " + surname, existing.email || email);
      } catch (overrideError) {
        console.error("Administrator override email could not be prepared:", overrideError);
      }

      const admins = await admin.from("profiles").select("id,email").eq("role","admin").eq("is_active",true);
      const recipients = admins.data?.length ? admins.data : [{ id: null, email: "info@ijlanga.co.za" }];
      for (const a of recipients) {
        await admin.from("notifications").insert({
          recipient_user_id: a.id,
          recipient_email: a.email,
          event_type: "account_verification_pending",
          subject: "Account verification requires approval",
          message: first_name + " " + last_name + " " + surname + " submitted ID Copy and Proof Of Address to update an existing account. Please review and approve or reject the request.",
          entity_type: "account_access_request",
          entity_id: requestId,
          channel: "email",
          status: "pending",
        });
      }

      return json({
        ok: true,
        existing_account: true,
        request_id: requestId,
        message: "An existing account was found. Your verification documents have been submitted for administrator review. If you know the registered email address, you can use Forgot password to regain access.",
        reset_email: existing.email || null,
        verification_url: AUTH_CONFIRM_URL + "?type=email&redirect_to=" + encodeURIComponent(DASHBOARD_URL),
      });
    }

    const { data: employer } = await admin.from("profiles")
      .select("id,email,full_name,organization_name")
      .eq("role","employer")
      .eq("is_active",true)
      .eq("id_number",id_number)
      .maybeSingle();

    const role = employer ? "employee" : "client";
    const requestId = crypto.randomUUID();

    const metadata = {
      first_name,
      last_name,
      surname,
      full_name: first_name + " " + last_name + " " + surname,
      phone,
      id_number: id_number || null,
      company_registration_number: company_registration_number || null,
    };
    let createdUser: any;
    let createdNewAuthUser = false;
    try {
      // Profiles are not the source of truth for authentication. If an older
      // account exists in auth.users without a profile row, repair that account
      // instead of calling generateLink(signup) and creating a second profile.
      const authExisting = await findAuthUserByEmail(admin, email);
      createdNewAuthUser = !authExisting;
      createdUser = await sendSignupConfirmation(admin, email, password, metadata, authExisting?.id);
      if (!createdUser?.id) throw new Error("Supabase did not return a user ID.");
    } catch (createError: any) {
      if (createdNewAuthUser && createdUser?.id) await admin.auth.admin.deleteUser(createdUser.id);
      return json({ error: createError?.message || "Could not create or prepare the authentication account." }, 400);
    }

    const full_name = first_name + " " + last_name + " " + surname;
    const profilePayload = {
      id: createdUser.id,
      email,
      full_name,
      first_name, last_name, surname,
      phone,
      id_number: id_number || null,
      company_registration_number: company_registration_number || null,
      role,
      employer_id: employer?.id || null,
      organization_name: employer?.organization_name || null,
      is_active: false,
      approval_status: "pending",
      email_verified_at: null,
      updated_at: new Date().toISOString(),
    };

    // The auth.users trigger may create a minimal profile before this code
    // runs. Upsert makes this operation idempotent and removes the duplicate
    // primary-key race that caused "profiles_pkey" failures.
    const { error: profileError } = await admin.from("profiles")
      .upsert(profilePayload, { onConflict: "id" });
    if (profileError) {
      if (createdNewAuthUser) await admin.auth.admin.deleteUser(createdUser.id);
      return json({ error: "Account profile could not be prepared: " + profileError.message }, 500);
    }

    const idPath = createdUser.id + "/" + requestId + "-id-copy." + ext(idCopy);
    const addressPath = createdUser.id + "/" + requestId + "-proof-of-address." + ext(proofOfAddress);
    try {
      await saveFile(admin, idCopy, idPath);
      await saveFile(admin, proofOfAddress, addressPath);
    } catch (e) {
      await admin.storage.from("account-verification").remove([idPath, addressPath]);
      await admin.from("profiles").delete().eq("id", createdUser.id);
      await admin.auth.admin.deleteUser(createdUser.id);
      throw e;
    }

    const { error: reqError } = await admin.from("account_access_requests").insert({
      id: requestId,
      user_id: createdUser.id,
      email,
      first_name, last_name, surname, phone, id_number,
      company_registration_number: company_registration_number || null,
      matched_employer_id: employer?.id || null,
      request_type: "new_account",
      status: "pending",
      id_copy_path: idPath,
      proof_of_address_path: addressPath,
      notes: employer
        ? "ID matched employer profile " + (employer.full_name || employer.email) + ". Account auto-classified as employee and is awaiting approval."
        : "New public account registration awaiting administrator approval.",
    });

    if (reqError) {
      await admin.storage.from("account-verification").remove([idPath, addressPath]);
      await admin.from("profiles").delete().eq("id", createdUser.id);
      await admin.auth.admin.deleteUser(createdUser.id);
      throw reqError;
    }

    let overrideResult: { emailed: boolean } | null = null;
    try {
      overrideResult = await issueAdminOverride(admin, requestId, createdUser.id, full_name, email);
    } catch (overrideError) {
      console.error("Administrator override email could not be prepared:", overrideError);
    }

    const admins = await admin.from("profiles").select("id,email").eq("role","admin").eq("is_active",true);
    const adminRecipients = admins.data?.length ? admins.data : [{ id: null, email: "info@ijlanga.co.za" }];
    for (const a of adminRecipients) {
      await admin.from("notifications").insert({
        recipient_user_id: a.id,
        recipient_email: a.email,
        event_type: "account_registration_pending",
        subject: employer ? "Employee account requires approval" : "New account requires approval",
        message: employer
          ? full_name + " registered with an ID number matching employer " + (employer.full_name || employer.organization_name || employer.email) + ". The account was auto-classified as Employee and requires approval."
          : full_name + " registered a new IJ Langa Consulting account and submitted verification documents for approval.",
        entity_type: "account_access_request",
        entity_id: requestId,
        channel: "email",
        status: "pending",
      });
    }

    if (employer) {
      await admin.from("notifications").insert({
        recipient_user_id: employer.id,
        recipient_email: employer.email,
        event_type: "employee_account_pending",
        subject: "Employee account requires your approval",
        message: full_name + " has created an account using an ID number linked to your employer profile. The employee account is waiting for employer and administrator approval.",
        entity_type: "account_access_request",
        entity_id: requestId,
        channel: "email",
        status: "pending",
      });
    }

    return json({
      ok: true,
      existing_account: false,
      employee_match: Boolean(employer),
      request_id: requestId,
      role,
      admin_override_email_sent: Boolean(overrideResult?.emailed),
      verification_url: AUTH_CONFIRM_URL + "?type=email&redirect_to=" + encodeURIComponent(DASHBOARD_URL),
      message: employer
        ? "Account created as Employee. Check your email to verify it. Your employer and IJ Langa administrator must approve the account before normal sign-in is available."
        : "Account created. Check your email to verify it. IJ Langa Consulting must approve your verification documents before normal sign-in is available.",
    });
  } catch (e) {
    return json({ error: e?.message || "Unable to process account registration." }, 500);
  }
});