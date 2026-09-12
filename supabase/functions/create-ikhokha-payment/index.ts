import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const site = Deno.env.get("SITE_URL") || "https://www.ijlanga.co.za";
const cors = {
  "Access-Control-Allow-Origin": site,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

function jsStringEscape(value: string) {
  return value
    .replace(/[\\"']/g, "\\$&")
    .replace(/\u0000/g, "\\0");
}

function createPayloadToSign(endpoint: string, body: string) {
  const path = new URL(endpoint).pathname;
  return jsStringEscape(path + body);
}

async function signPayload(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret.trim()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      { global: { headers: { Authorization: req.headers.get("Authorization") || "" } } },
    );

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return json({ error: "Authentication required" }, 401);

    const { order_id } = await req.json();
    if (!order_id) return json({ error: "order_id is required" }, 400);

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id,order_number,total,payment_status,customer_id,customers!inner(auth_user_id,contact_name,email)")
      .eq("id", order_id)
      .eq("customers.auth_user_id", user.id)
      .maybeSingle();

    if (orderError || !order) {
      return json({ error: "Order not found or access denied" }, 404);
    }
    if (order.payment_status === "paid") {
      return json({ error: "Order is already paid" }, 409);
    }

    const appId = Deno.env.get("IKHOKHA_APP_ID");
    const appSecret = Deno.env.get("IKHOKHA_APP_SECRET");
    // The Merchant Dashboard secure-key screen provides the application ID/key
    // and secret. If a separate entity ID is configured, use it; otherwise the
    // application ID is used as entityID, matching the two-key setup.
    const entityId = Deno.env.get("IKHOKHA_ENTITY_ID") || appId;
    const endpoint = "https://api.ikhokha.com/public-api/v1/api/payment";
    const mode = Deno.env.get("IKHOKHA_MODE") || "live";

    if (!appId || !appSecret || !entityId) {
      return json({ error: "iKhokha credentials are not configured yet" }, 503);
    }

    // Catalogue/order totals are stored excluding VAT. iKhokha receives the
    // customer-facing VAT-inclusive amount in cents.
    const amountExclVat = Number(order.total || 0);
    const amountInclVat = Math.round(amountExclVat * 1.15 * 100) / 100;
    const amountCents = Math.round(amountInclVat * 100);
    const externalTransactionID = String(order.order_number);

    const payload = {
      entityID: entityId,
      externalEntityID: String(order.customer_id),
      amount: amountCents,
      currency: "ZAR",
      requesterUrl: site,
      mode,
      description: `IJ Langa Consulting order ${order.order_number}`,
      paymentReference: externalTransactionID,
      externalTransactionID,
      urls: {
        callbackUrl: `${Deno.env.get("SUPABASE_URL")}/functions/v1/ikhokha-webhook`,
        successPageUrl: `${site}/?payment=success&order=${encodeURIComponent(order.order_number)}`,
        failurePageUrl: `${site}/?payment=failed&order=${encodeURIComponent(order.order_number)}`,
        cancelUrl: `${site}/?payment=cancelled&order=${encodeURIComponent(order.order_number)}`,
      },
    };

    const body = JSON.stringify(payload);
    const payloadToSign = createPayloadToSign(endpoint, body);
    const signature = await signPayload(payloadToSign, appSecret);

    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "IK-APPID": appId.trim(),
        "IK-SIGN": signature,
      },
      body,
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || result.responseCode !== "00" || !result.paylinkUrl) {
      console.error("iKhokha create payment response", response.status, result);
      return json({
        error: result.message || "Unable to create iKhokha payment link",
        response_code: result.responseCode || null,
      }, 502);
    }

    const { error: paymentError } = await supabase.from("payments").insert({
      order_id: order.id,
      provider: "ikhokha",
      reference: externalTransactionID,
      amount: amountInclVat,
      status: "pending",
      provider_transaction_id: result.paylinkID ?? null,
      metadata: {
        ...result,
        amountExclVat,
        vatRate: 15,
        amountInclVat,
        paymentReference: externalTransactionID,
      },
    });
    if (paymentError) console.error("Payment record insert failed", paymentError);

    await supabase
      .from("orders")
      .update({
        payment_status: "pending",
        payment_reference: externalTransactionID,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    return json({
      payment_url: result.paylinkUrl,
      paylink_id: result.paylinkID,
      order_number: order.order_number,
      amount: amountInclVat,
      amount_excl_vat: amountExclVat,
      vat_rate: 15,
    });
  } catch (error) {
    console.error("create-ikhokha-payment error", error);
    return json({
      error: error instanceof Error ? error.message : "Could not start payment.",
    }, 400);
  }
});
