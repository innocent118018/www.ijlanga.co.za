import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } }, 405);
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: { code: "NOT_CONFIGURED", message: "Import processing is not configured." } }, 503);

  try {
    const rawBody = await request.text();
    if (rawBody.length > 4 * 1024 * 1024) return json({ error: { code: "BATCH_TOO_LARGE", message: "Send no more than 10 pages per extraction batch." } }, 413);
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return json({ error: { code: "INVALID_JSON", message: "Request body must be valid JSON." } }, 400);
    }

    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: request.headers.get("Authorization") || "" } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: { code: "UNAUTHENTICATED", message: "Sign in to continue." } }, 401);

    const importId = String(body.import_id || "");
    const pages = Array.isArray(body.pages) ? body.pages : null;
    const transactions = Array.isArray(body.transactions) ? body.transactions : null;
    const finalize = body.finalize === true;
    if (!/^[0-9a-f-]{36}$/i.test(importId) || !pages || !transactions || pages.length > 10) {
      return json({ error: { code: "INVALID_BATCH", message: "A valid import and a batch of up to 10 pages are required." } }, 400);
    }
    if (transactions.length > 5000) return json({ error: { code: "TOO_MANY_ROWS", message: "Extraction batch contains too many rows." } }, 413);

    const db = createClient(supabaseUrl, serviceKey);
    const [{ data: importRecord }, { data: isAdminData }, { data: customer }] = await Promise.all([
      db.from("accounting_imports").select("id,customer_id,created_by,payment_status,status,page_count").eq("id", importId).maybeSingle(),
      userClient.rpc("is_admin"),
      db.from("customers").select("id,auth_user_id").eq("auth_user_id", user.id).maybeSingle(),
    ]);
    if (!importRecord) return json({ error: { code: "IMPORT_NOT_FOUND", message: "Import not found." } }, 404);
    const isAdmin = isAdminData === true;
    if (!isAdmin && (!customer || customer.id !== importRecord.customer_id || importRecord.created_by !== user.id)) {
      return json({ error: { code: "FORBIDDEN", message: "You cannot access this import." } }, 403);
    }
    if (!isAdmin && !["verified", "exempt"].includes(importRecord.payment_status)) {
      return json({ error: { code: "PAYMENT_REQUIRED", message: "Verified payment is required before extraction." } }, 402);
    }
    if (!["queued", "processing"].includes(importRecord.status)) {
      return json({ error: { code: "IMPORT_STATE_CONFLICT", message: "This import is not ready for extraction." } }, 409);
    }
    if (pages.some((page) => !Number.isInteger(page?.page_number) || page.page_number < 1 || page.page_number > importRecord.page_count)) {
      return json({ error: { code: "INVALID_PAGE", message: "Each page must have a valid page number." } }, 422);
    }

    const { error: saveError } = await db.rpc("save_accounting_import_extraction", {
      p_import_id: importId,
      p_pages: pages,
      p_transactions: transactions,
      p_document_metadata: finalize && body.document_metadata && typeof body.document_metadata === "object" ? body.document_metadata : {},
      p_finalize: finalize,
    });
    if (saveError) throw saveError;

    return json({ ok: true, import_id: importId, stored_pages: pages.length, stored_rows: transactions.length, finalized: finalize }, 200);
  } catch (error) {
    console.error(error);
    return json({ error: { code: "EXTRACTION_SAVE_FAILED", message: error instanceof Error ? error.message : "Could not save extracted rows." } }, 400);
  }
});