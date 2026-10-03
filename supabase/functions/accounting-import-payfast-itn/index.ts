import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import md5 from "npm:js-md5@0.8.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const mode = (Deno.env.get("PAYFAST_MODE") || "sandbox").toLowerCase();
const headers = { "Content-Type": "text/plain", "Vary": "Origin" };
const response = (body: string, status = 200) => new Response(body, { status, headers });
const encode = (value: string) => encodeURIComponent(String(value).trim()).replace(/%20/g, "+");

function validSignature(fields: Record<string, string>, passphrase: string) {
  const parts = Object.entries(fields)
    .filter(([key, value]) => key !== "signature" && value !== "")
    .map(([key, value]) => `${key}=${encode(value)}`);
  if (passphrase) parts.push(`passphrase=${encode(passphrase)}`);
  return md5(parts.join("&")).toLowerCase() === String(fields.signature || "").toLowerCase();
}

async function validPayfastSource(ip: string) {
  if (!ip) return false;
  const hosts = mode === "live"
    ? ["www.payfast.co.za", "w1w.payfast.co.za", "w2w.payfast.co.za"]
    : ["sandbox.payfast.co.za", "www.payfast.co.za", "w1w.payfast.co.za", "w2w.payfast.co.za"];
  const addresses = new Set<string>();
  for (const host of hosts) {
    try {
      for (const address of await Deno.resolveDns(host, "A")) addresses.add(address);
    } catch {
      continue;
    }
  }
  return addresses.has(ip);
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return response("OK");
  if (!supabaseUrl || !serviceKey) return response("Payment service unavailable", 503);

  try {
    const rawBody = await request.text();
    const params = new URLSearchParams(rawBody);
    const fields: Record<string, string> = {};
    for (const [key, value] of params.entries()) fields[key] = value;
    const merchantId = Deno.env.get("PAYFAST_MERCHANT_ID")?.trim() || "";
    const passphrase = Deno.env.get("PAYFAST_PASSPHRASE")?.trim() || "";
    if (!merchantId || fields.merchant_id !== merchantId || !validSignature(fields, passphrase)) return response("Invalid notification", 400);

    const sourceIp = (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "").split(",")[0].trim();
    if (!(await validPayfastSource(sourceIp))) return response("Invalid source", 403);

    const reference = String(fields.m_payment_id || "");
    const db = createClient(supabaseUrl, serviceKey);
    const { data: attempt, error: attemptError } = await db.from("accounting_import_payment_attempts")
      .select("id,import_id,amount,status")
      .eq("provider", "payfast")
      .eq("reference", reference)
      .maybeSingle();
    if (attemptError || !attempt) return response("Import payment not found", 404);

    const amount = Number(fields.amount_gross || 0);
    if (!Number.isFinite(amount) || Math.abs(amount - Number(attempt.amount)) > 0.01) return response("Amount mismatch", 400);

    const host = mode === "live" ? "www.payfast.co.za" : "sandbox.payfast.co.za";
    const validation = await fetch(`https://${host}/eng/query/validate`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: rawBody,
    });
    if ((await validation.text()).trim() !== "VALID") return response("PayFast validation failed", 400);

    const providerStatus = String(fields.payment_status || "").toUpperCase();
    if (providerStatus !== "COMPLETE" && providerStatus !== "CANCELLED" && providerStatus !== "FAILED") return response("OK");
    const { error } = await db.rpc("record_accounting_import_payment", {
      p_provider: "payfast",
      p_reference: reference,
      p_status: providerStatus === "COMPLETE" ? "successful" : "failed",
      p_provider_transaction_id: fields.pf_payment_id || null,
      p_amount: amount,
      p_metadata: { payment_status: providerStatus, pf_payment_id: fields.pf_payment_id || null },
    });
    if (error) throw error;
    return response("OK");
  } catch (error) {
    console.error(error);
    return response("Import payment processing failed", 500);
  }
});