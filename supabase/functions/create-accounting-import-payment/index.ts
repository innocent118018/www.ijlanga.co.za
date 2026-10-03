import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import md5 from "npm:js-md5@0.8.3";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { unzipSync } from "npm:fflate@0.8.2";
import { XMLParser } from "npm:fast-xml-parser@5.2.5";
import { calculateAccountingImportCharge } from "../_shared/accounting-import-billing.js";

const site = Deno.env.get("SITE_URL") || "https://www.ijlanga.co.za";
const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const cors = {
  "Access-Control-Allow-Origin": site,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});
const enc = (value: string) => encodeURIComponent(String(value).trim()).replace(/%20/g, "+");
const md5Signature = (fields: Record<string, string>, passphrase = "") => {
  const parts = Object.entries(fields).filter(([, value]) => value !== "").map(([key, value]) => `${key}=${enc(value)}`);
  if (passphrase) parts.push(`passphrase=${enc(passphrase)}`);
  return md5(parts.join("&"));
};
const hmacSha256 = async (value: string, secret: string) => {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret.trim()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};
const escapeIkhokha = (value: string) => value.replace(/[\\"']/g, "\\$&").replace(/\u0000/g, "\\0");

function payfastFields(importId: string, reference: string, amount: number, pageCount: number, fileName: string, email: string, merchantId: string, merchantKey: string, passphrase: string, notifyUrl: string) {
  const baseUrl = `${site}/app?accounting_import=${encodeURIComponent(importId)}`;
  const fields: Record<string, string> = {
    merchant_id: merchantId,
    merchant_key: merchantKey,
    return_url: `${baseUrl}&payment=success`,
    cancel_url: `${baseUrl}&payment=cancelled`,
    notify_url: notifyUrl,
    email_address: email,
    m_payment_id: reference,
    amount: amount.toFixed(2),
    item_name: `Accounting import ${pageCount} page(s)`,
    item_description: fileName.slice(0, 100),
    custom_str1: importId,
  };
  fields.signature = md5Signature(fields, passphrase);
  return fields;
}

function countWorkbookSheets(bytes: Uint8Array) {
  const workbookXml = unzipSync(bytes)["xl/workbook.xml"];
  if (!workbookXml) throw new Error("Excel workbook has no worksheet manifest.");
  const workbook = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", parseTagValue: false }).parse(new TextDecoder().decode(workbookXml));
  const sheets = workbook?.workbook?.sheets?.sheet;
  return Math.max(1, Array.isArray(sheets) ? sheets.length : sheets ? 1 : 0);
}

async function countBillableUnits(fileName: string, bytes: Uint8Array) {
  const extension = fileName.split(".").at(-1)?.toLowerCase() || "";
  if (extension === "pdf") {
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false });
    const pageCount = pdf.getPageCount();
    if (pageCount > 1000) throw new Error("Files are limited to 1,000 pages or billable units.");
    return pageCount;
  }
  if (["xlsx", "xlsm", "xltx"].includes(extension)) return countWorkbookSheets(bytes);
  if (["csv", "xml", "ubl", "json", "png", "jpg", "jpeg", "tif", "tiff", "bmp", "gif", "webp"].includes(extension)) return 1;
  throw new Error("Unsupported import file type.");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } }, 405);
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: { code: "NOT_CONFIGURED", message: "Import payments are not configured." } }, 503);

  try {
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: request.headers.get("Authorization") || "" } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } }, 401);

    const body = await request.json();
    const importId = String(body?.import_id || "").trim();
    const provider = String(body?.provider || "").toLowerCase();
    if (!/^[0-9a-f-]{36}$/i.test(importId)) return json({ error: { code: "INVALID_IMPORT", message: "A valid import ID is required." } }, 400);
    if (!new Set(["payfast", "ikhokha"]).has(provider)) return json({ error: { code: "INVALID_PROVIDER", message: "Choose PayFast or iKhokha." } }, 400);

    const db = createClient(supabaseUrl, serviceKey);
    const [{ data: importRecord }, { data: isAdminData }, { data: customer }] = await Promise.all([
      db.from("accounting_imports").select("id,customer_id,created_by,original_name,storage_path,mime_type,file_size_bytes,status,payment_status").eq("id", importId).maybeSingle(),
      userClient.rpc("is_admin"),
      db.from("customers").select("id,auth_user_id").eq("auth_user_id", user.id).maybeSingle(),
    ]);
    if (!importRecord) return json({ error: { code: "IMPORT_NOT_FOUND", message: "Import not found." } }, 404);
    const isAdmin = isAdminData === true;
    if (!isAdmin && (!customer || customer.id !== importRecord.customer_id || importRecord.created_by !== user.id)) {
      return json({ error: { code: "FORBIDDEN", message: "You cannot access this import." } }, 403);
    }
    if (!new Set(["awaiting_payment", "failed"]).has(importRecord.status) || !new Set(["pending", "failed"]).has(importRecord.payment_status)) {
      return json({ error: { code: "IMPORT_STATE_CONFLICT", message: "This import is not awaiting payment." } }, 409);
    }
    if (Number(importRecord.file_size_bytes) <= 0 || Number(importRecord.file_size_bytes) > 50 * 1024 * 1024) {
      return json({ error: { code: "INVALID_FILE_SIZE", message: "Import files must be 50 MB or smaller." } }, 422);
    }

    const { data: file, error: downloadError } = await db.storage.from("accounting-imports").download(importRecord.storage_path);
    if (downloadError || !file) return json({ error: { code: "SOURCE_UNAVAILABLE", message: "The original file could not be retrieved." } }, 422);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const pageCount = await countBillableUnits(importRecord.original_name, bytes);
    if (pageCount < 1 || pageCount > 1000) return json({ error: { code: "INVALID_PAGE_COUNT", message: "Files must contain between 1 and 1,000 billable units." } }, 422);

    const sourceHash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const { amount, discountPercent } = calculateAccountingImportCharge(pageCount);
    if (isAdmin) {
      const { error: exemptionError } = await db.from("accounting_imports").update({
        page_count: pageCount,
        amount_due: 0,
        discount_percent: discountPercent,
        price_per_page: 10,
        source_sha256: sourceHash,
        source_retention_locked: true,
        payment_status: "exempt",
        payment_provider: "admin_exemption",
        exemption_reason: "Administrator import exemption",
        exempted_by: user.id,
        exempted_at: new Date().toISOString(),
        verified_at: new Date().toISOString(),
        status: "queued",
        updated_at: new Date().toISOString(),
      }).eq("id", importId);
      if (exemptionError) throw exemptionError;
      return json({ ok: true, exempt: true, import_id: importId, page_count: pageCount, amount_due: 0 }, 200);
    }

    const payfastMerchantId = Deno.env.get("PAYFAST_MERCHANT_ID")?.trim() || "";
    const payfastMerchantKey = Deno.env.get("PAYFAST_MERCHANT_KEY")?.trim() || "";
    const payfastPassphrase = Deno.env.get("PAYFAST_PASSPHRASE")?.trim() || "";
    const payfastMode = (Deno.env.get("PAYFAST_MODE") || "sandbox").toLowerCase();
    const ikhokhaAppId = Deno.env.get("IKHOKHA_APP_ID")?.trim() || "";
    const ikhokhaAppSecret = Deno.env.get("IKHOKHA_APP_SECRET")?.trim() || "";
    const ikhokhaEntityId = Deno.env.get("IKHOKHA_ENTITY_ID")?.trim() || ikhokhaAppId;
    if (provider === "payfast" && (!payfastMerchantId || !payfastMerchantKey)) {
      return json({ error: { code: "PROVIDER_NOT_CONFIGURED", message: "PayFast is not configured." } }, 503);
    }
    if (provider === "ikhokha" && (!ikhokhaAppId || !ikhokhaAppSecret || !ikhokhaEntityId)) {
      return json({ error: { code: "PROVIDER_NOT_CONFIGURED", message: "iKhokha is not configured." } }, 503);
    }

    const { data: pendingAttempt } = await db.from("accounting_import_payment_attempts")
      .select("id,provider,reference,amount,metadata").eq("import_id", importId).eq("status", "pending").maybeSingle();
    if (pendingAttempt) {
      if (pendingAttempt.provider !== provider || Math.abs(Number(pendingAttempt.amount) - amount) > 0.01) {
        return json({ error: { code: "PAYMENT_PENDING", message: "Resume the existing payment with its original provider before starting another." } }, 409);
      }
      if (provider === "payfast") {
        const fields = payfastFields(importId, pendingAttempt.reference, amount, pageCount, importRecord.original_name, user.email || "", payfastMerchantId, payfastMerchantKey, payfastPassphrase, `${supabaseUrl}/functions/v1/accounting-import-payfast-itn`);
        const host = payfastMode === "live" ? "www.payfast.co.za" : "sandbox.payfast.co.za";
        return json({ ok: true, import_id: importId, payment_reference: pendingAttempt.reference, amount_due: amount, page_count: pageCount, discount_percent: discountPercent, provider, payment_url: `https://${host}/eng/process`, fields }, 200);
      }
      const paymentUrl = String(pendingAttempt.metadata?.payment_url || "");
      if (!paymentUrl) return json({ error: { code: "PAYMENT_PENDING", message: "The existing iKhokha checkout is still being prepared. Refresh and retry shortly." } }, 409);
      return json({ ok: true, import_id: importId, payment_reference: pendingAttempt.reference, amount_due: amount, page_count: pageCount, discount_percent: discountPercent, provider, payment_url: paymentUrl }, 200);
    }

    const reference = `AI-${crypto.randomUUID()}`;
    const { error: attemptError } = await db.from("accounting_import_payment_attempts").insert({
      import_id: importId,
      user_id: user.id,
      provider,
      reference,
      amount,
      metadata: { page_count: pageCount, discount_percent: discountPercent },
    });
    if (attemptError) throw attemptError;

    const { error: importUpdateError } = await db.from("accounting_imports").update({
      page_count: pageCount,
      amount_due: amount,
      discount_percent: discountPercent,
      price_per_page: 10,
      source_sha256: sourceHash,
      source_retention_locked: true,
      payment_status: "pending",
      payment_provider: provider,
      payment_reference: reference,
      status: "awaiting_payment",
      updated_at: new Date().toISOString(),
    }).eq("id", importId);
    if (importUpdateError) throw importUpdateError;

    if (provider === "payfast") {
      const fields = payfastFields(importId, reference, amount, pageCount, importRecord.original_name, user.email || "", payfastMerchantId, payfastMerchantKey, payfastPassphrase, `${supabaseUrl}/functions/v1/accounting-import-payfast-itn`);
      const host = payfastMode === "live" ? "www.payfast.co.za" : "sandbox.payfast.co.za";
      return json({ ok: true, import_id: importId, payment_reference: reference, amount_due: amount, page_count: pageCount, discount_percent: discountPercent, provider, payment_url: `https://${host}/eng/process`, fields }, 201);
    }

    const endpoint = "https://api.ikhokha.com/public-api/v1/api/payment";
    const payload = {
      entityID: ikhokhaEntityId,
      externalEntityID: importRecord.customer_id,
      amount: Math.round(amount * 100),
      currency: "ZAR",
      requesterUrl: site,
      mode: Deno.env.get("IKHOKHA_MODE") || "live",
      description: `Accounting import ${pageCount} page(s)`,
      paymentReference: reference,
      externalTransactionID: reference,
      urls: {
        callbackUrl: `${supabaseUrl}/functions/v1/accounting-import-ikhokha-webhook`,
        successPageUrl: `${site}/app?accounting_import=${encodeURIComponent(importId)}&payment=success`,
        failurePageUrl: `${site}/app?accounting_import=${encodeURIComponent(importId)}&payment=failed`,
        cancelUrl: `${site}/app?accounting_import=${encodeURIComponent(importId)}&payment=cancelled`,
      },
    };
    const payloadText = JSON.stringify(payload);
    const signature = await hmacSha256(escapeIkhokha(new URL(endpoint).pathname + payloadText), ikhokhaAppSecret);
    let response: Response;
    let result: Record<string, unknown>;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "IK-APPID": ikhokhaAppId, "IK-SIGN": signature },
        body: payloadText,
      });
      result = await response.json().catch(() => ({}));
    } catch (providerError) {
      await Promise.all([
        db.from("accounting_import_payment_attempts").update({ status: "failed", updated_at: new Date().toISOString() }).eq("reference", reference),
        db.from("accounting_imports").update({ payment_status: "failed", status: "awaiting_payment", updated_at: new Date().toISOString() }).eq("id", importId),
      ]);
      throw providerError;
    }
    if (!response.ok || result.responseCode !== "00" || !result.paylinkUrl) {
      await Promise.all([
        db.from("accounting_import_payment_attempts").update({ status: "failed", metadata: { error: String(result.message || "Provider link creation failed") }, updated_at: new Date().toISOString() }).eq("reference", reference),
        db.from("accounting_imports").update({ payment_status: "failed", status: "awaiting_payment", updated_at: new Date().toISOString() }).eq("id", importId),
      ]);
      throw new Error(result.message || "iKhokha could not create a payment link.");
    }
    await db.from("accounting_import_payment_attempts").update({ provider_transaction_id: String(result.paylinkID || "") || null, metadata: { page_count: pageCount, discount_percent: discountPercent, paylink_id: result.paylinkID || null, payment_url: result.paylinkUrl } }).eq("reference", reference);
    return json({ ok: true, import_id: importId, payment_reference: reference, amount_due: amount, page_count: pageCount, discount_percent: discountPercent, provider, payment_url: String(result.paylinkUrl) }, 201);
  } catch (error) {
    console.error(error);
    return json({ error: { code: "PAYMENT_START_FAILED", message: error instanceof Error ? error.message : "Could not start import payment." } }, 400);
  }
});