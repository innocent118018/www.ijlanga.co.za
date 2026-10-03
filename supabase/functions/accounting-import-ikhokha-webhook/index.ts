import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const site = Deno.env.get("SITE_URL") || "https://www.ijlanga.co.za";
const cors = {
  "Access-Control-Allow-Origin": site,
  "Access-Control-Allow-Headers": "content-type, ik-appid, ik-sign",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...cors, "Content-Type": "application/json" },
});
const escape = (value: string) => value.replace(/[\\"']/g, "\\$&").replace(/\u0000/g, "\\0");

async function hmacSha256(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret.trim()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: { code: "METHOD_NOT_ALLOWED", message: "Method not allowed." } }, 405);

  try {
    const rawBody = await request.text();
    const appId = Deno.env.get("IKHOKHA_APP_ID") || "";
    const secret = Deno.env.get("IKHOKHA_APP_SECRET") || "";
    const suppliedAppId = request.headers.get("ik-appid") || "";
    const suppliedSignature = request.headers.get("ik-sign") || "";
    if (!appId || !secret || suppliedAppId !== appId || !suppliedSignature) return json({ error: { code: "UNAUTHORIZED", message: "Invalid provider credentials." } }, 401);

    const callbackPath = new URL(`${Deno.env.get("SUPABASE_URL")}/functions/v1/accounting-import-ikhokha-webhook`).pathname;
    const expectedSignature = await hmacSha256(escape(callbackPath + rawBody), secret);
    if (!constantTimeEqual(expectedSignature.toLowerCase(), suppliedSignature.toLowerCase())) return json({ error: { code: "INVALID_SIGNATURE", message: "Invalid webhook signature." } }, 401);

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json({ error: { code: "INVALID_JSON", message: "Webhook body must be JSON." } }, 400);
    }
    const reference = String(payload.externalTransactionID || payload.transactionId || "");
    if (!reference) return json({ received: true, matched: false });

    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    if (!supabaseUrl || !serviceKey) return json({ error: { code: "NOT_CONFIGURED", message: "Payment service is unavailable." } }, 503);
    const db = createClient(supabaseUrl, serviceKey);
    const { data: attempt, error: attemptError } = await db.from("accounting_import_payment_attempts")
      .select("id,import_id,amount,status")
      .eq("provider", "ikhokha")
      .eq("reference", reference)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt) return json({ received: true, matched: false });

    const rawAmount = Number(payload.amount ?? payload.amountCents ?? 0);
    const amount = rawAmount > 100 ? rawAmount / 100 : rawAmount;
    if (!Number.isFinite(amount) || amount <= 0 || Math.abs(amount - Number(attempt.amount)) > 0.01) {
      return json({ error: { code: "AMOUNT_MISMATCH", message: "Payment amount does not match the import fee." } }, 400);
    }

    const status = String(payload.status || "").toUpperCase();
    const responseCode = String(payload.responseCode || "");
    const successful = status === "SUCCESS" || responseCode === "00";
    const failed = ["FAILED", "FAILURE", "DECLINED", "CANCELLED", "EXPIRED"].includes(status);
    if (!successful && !failed) return json({ received: true, payment_status: "pending" });

    const providerTransactionId = String(payload.paylinkID || payload.transactionID || payload.transactionId || "") || null;
    const { error } = await db.rpc("record_accounting_import_payment", {
      p_provider: "ikhokha",
      p_reference: reference,
      p_status: successful ? "successful" : "failed",
      p_provider_transaction_id: providerTransactionId,
      p_amount: amount,
      p_metadata: payload,
    });
    if (error) throw error;
    return json({ received: true, matched: true, payment_status: successful ? "successful" : "failed" });
  } catch (error) {
    console.error(error);
    return json({ error: { code: "WEBHOOK_FAILED", message: "Import payment processing failed." } }, 500);
  }
});