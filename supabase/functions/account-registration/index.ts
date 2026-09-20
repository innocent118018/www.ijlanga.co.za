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
      .select("id,email,full_name,role,employer_id,approval_status")
      .eq("id_number", id_number)
      .maybeSingle();

    const { data: existingByCompany } = company_registration_number
      ? await admin.from("profiles").select("id,email,full_name,role,employer_id,approval_status")
          .eq("company_registration_number", company_registration_number).maybeSingle()
      : { data: null };

    const { data: existingByEmail } = await admin.from("profiles")
      .select("id,email,full_name,role,employer_id,approval_status")
      .ilike("email", email)
      .maybeSingle();

    const existing = existingById || existingByCompany || existingByEmail;

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
        first_name, last_name, surname, phone, id_number,
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

    const { data: created, error: createError } = await admin.auth.admin.createUser({
      email,
      password,
      // Public registration is gated by the IJ Langa approval workflow.
      // The account itself is email-confirmed here so users are not blocked by
      // a second confirmation step after their identity documents are submitted.
      email_confirm: true,
      user_metadata: {
        first_name, last_name, surname,
        full_name: first_name + " " + last_name + " " + surname,
      },
    });
    if (createError || !created.user) return json({ error: createError?.message || "Could not create the account." }, 400);

    const full_name = first_name + " " + last_name + " " + surname;
    const { error: profileError } = await admin.from("profiles").insert({
      id: created.user.id,
      email,
      full_name,
      first_name, last_name, surname,
      phone,
      id_number,
      company_registration_number: company_registration_number || null,
      role,
      employer_id: employer?.id || null,
      organization_name: employer?.organization_name || null,
      is_active: false,
      approval_status: "pending",
    });

    if (profileError) {
      await admin.auth.admin.deleteUser(created.user.id);
      return json({ error: "Account could not be prepared: " + profileError.message }, 500);
    }

    const idPath = created.user.id + "/" + requestId + "-id-copy." + ext(idCopy);
    const addressPath = created.user.id + "/" + requestId + "-proof-of-address." + ext(proofOfAddress);
    try {
      await saveFile(admin, idCopy, idPath);
      await saveFile(admin, proofOfAddress, addressPath);
    } catch (e) {
      await admin.storage.from("account-verification").remove([idPath, addressPath]);
      await admin.from("profiles").delete().eq("id", created.user.id);
      await admin.auth.admin.deleteUser(created.user.id);
      throw e;
    }

    const { error: reqError } = await admin.from("account_access_requests").insert({
      id: requestId,
      user_id: created.user.id,
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
      await admin.from("profiles").delete().eq("id", created.user.id);
      await admin.auth.admin.deleteUser(created.user.id);
      throw reqError;
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
      message: employer
        ? "Account created as Employee. Your employer and IJ Langa administrator must approve the account before you can sign in."
        : "Account created. IJ Langa Consulting must approve your verification documents before you can sign in.",
    });
  } catch (e) {
    return json({ error: e?.message || "Unable to process account registration." }, 500);
  }
});