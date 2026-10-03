import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import md5 from "npm:js-md5@0.8.3";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const site = Deno.env.get("SITE_URL") || "https://www.ijlanga.co.za";
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
const encode = (value: string) => encodeURIComponent(value.trim()).replace(/%20/g, "+");
const payfastSignature = (fields: Record<string, string>, passphrase: string) => {
  const parts = Object.entries(fields)
    .filter(([, value]) => value !== "")
    .map(([key, value]) => `${key}=${encode(value)}`);
  if (passphrase) parts.push(`passphrase=${encode(passphrase)}`);
  return md5(parts.join("&"));
};
const splitName = (name: string) => {
  const parts = name.trim().split(/\s+/);
  return { first: parts.shift() || "Customer", last: parts.join(" ") || "" };
};
const escapeSignatureInput = (value: string) => value.replace(/[\\"']/g, "\\$&").replace(/\u0000/g, "\\0");
async function makeCheckoutKey(email: string, productId: string, quantity: number) {
  const identity = `${email}|${productId}|${quantity}|${Math.floor(Date.now() / 1_800_000)}`;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  const bytes = new Uint8Array(digest).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
async function signIkhokha(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret.trim()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!supabaseUrl || !serviceKey) return json({ error: "Checkout is not configured" }, 503);

  try {
    const body = await request.json();
    const name = String(body?.customer?.name || "").trim();
    const email = String(body?.customer?.email || "").trim().toLowerCase();
    const phone = String(body?.customer?.phone || "").trim();
    const notes = String(body?.customer?.notes || "").trim().slice(0, 2000);
    const provider = String(body?.provider || "payfast").toLowerCase();
    const item = Array.isArray(body?.items) ? body.items[0] : null;
    const productId = String(item?.product_id || "");
    const quantity = Number(item?.quantity || 1);

    if (!name || name.length > 160 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      return json({ error: "Enter a valid name and email address" }, 400);
    }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return json({ error: "Select a valid fixed-price service" }, 400);
    }
    if (provider !== "payfast" && provider !== "ikhokha") return json({ error: "Unsupported payment provider" }, 400);
    const suppliedKey = String(body?.checkout_key || "");
    const checkoutKey = suppliedKey || await makeCheckoutKey(email, productId, quantity);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutKey)) {
      return json({ error: "Invalid checkout key" }, 400);
    }

    const db = createClient(supabaseUrl, serviceKey);
    const { data: order, error: orderError } = await db.rpc("create_direct_order", {
      p_checkout_key: checkoutKey,
      p_customer_name: name,
      p_customer_email: email,
      p_customer_phone: phone || null,
      p_notes: notes || null,
      p_product_id: productId,
      p_quantity: quantity,
    });
    if (orderError || !order?.order_id) {
      console.error("create_direct_order failed", orderError);
      return json({ error: orderError?.message || "Could not create the order" }, 400);
    }

    const { data: prior } = await db.from("payments")
      .select("reference, amount, status, metadata")
      .eq("order_id", order.order_id)
      .eq("provider", provider)
      .eq("metadata->>checkout_key", checkoutKey)
      .maybeSingle();
    if (prior) {
      if (prior.status !== "pending") return json({ error: "This checkout has already been processed" }, 409);
      if (prior.metadata?.payment_url) {
        return json({ ok: true, order_number: order.order_number, payment_url: prior.metadata.payment_url, fields: prior.metadata.fields || null, provider, amount: prior.amount });
      }
    }

    const amount = Math.round(Number(order.subtotal) * 1.15 * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return json({ error: "The order amount is invalid" }, 400);
    const reference = prior?.reference || `${provider === "payfast" ? "PF" : "IK"}-${crypto.randomUUID()}`;
    let paymentUrl = "";
    let fields: Record<string, string> | null = null;
    let providerMetadata: Record<string, unknown> = {};

    if (provider === "payfast") {
      const merchantId = Deno.env.get("PAYFAST_MERCHANT_ID")?.trim() || "";
      const merchantKey = Deno.env.get("PAYFAST_MERCHANT_KEY")?.trim() || "";
      const passphrase = Deno.env.get("PAYFAST_PASSPHRASE")?.trim() || "";
      const mode = (Deno.env.get("PAYFAST_MODE") || "sandbox").toLowerCase();
      if (!merchantId || !merchantKey) return json({ error: "PayFast is not configured" }, 503);
      const person = splitName(name);
      fields = {
        merchant_id: merchantId,
        merchant_key: merchantKey,
        return_url: `${site}/payment-status?reference=${encodeURIComponent(reference)}`,
        cancel_url: `${site}/payment-status?reference=${encodeURIComponent(reference)}&cancelled=1`,
        notify_url: `${supabaseUrl}/functions/v1/payfast-itn`,
        name_first: person.first,
        name_last: person.last,
        email_address: email,
        m_payment_id: reference,
        amount: amount.toFixed(2),
        item_name: String(body?.item_name || order.order_number).slice(0, 100),
        item_description: `IJ Langa Consulting order ${order.order_number}`.slice(0, 255),
        custom_str1: order.order_id,
      };
      fields.signature = payfastSignature(fields, passphrase);
      paymentUrl = `https://${mode === "live" ? "www.payfast.co.za" : "sandbox.payfast.co.za"}/eng/process`;
      providerMetadata = { mode, merchant_id: merchantId, fields };
    } else {
      const appId = Deno.env.get("IKHOKHA_APP_ID") || "";
      const secret = Deno.env.get("IKHOKHA_APP_SECRET") || "";
      const entityId = Deno.env.get("IKHOKHA_ENTITY_ID") || appId;
      if (!appId || !secret || !entityId) return json({ error: "iKhokha is not configured" }, 503);
      const endpoint = "https://api.ikhokha.com/public-api/v1/api/payment";
      const payload = {
        entityID: entityId,
        externalEntityID: String(order.customer_id),
        amount: Math.round(amount * 100),
        currency: "ZAR",
        requesterUrl: site,
        mode: Deno.env.get("IKHOKHA_MODE") || "live",
        description: `IJ Langa Consulting order ${order.order_number}`,
        paymentReference: reference,
        externalTransactionID: reference,
        urls: {
          callbackUrl: `${supabaseUrl}/functions/v1/ikhokha-webhook`,
          successPageUrl: `${site}/payment-status?reference=${encodeURIComponent(reference)}`,
          failurePageUrl: `${site}/payment-status?reference=${encodeURIComponent(reference)}&failed=1`,
          cancelUrl: `${site}/payment-status?reference=${encodeURIComponent(reference)}&cancelled=1`,
        },
      };
      const raw = JSON.stringify(payload);
      const signature = await signIkhokha(escapeSignatureInput(new URL(endpoint).pathname + raw), secret);
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json", "IK-APPID": appId.trim(), "IK-SIGN": signature },
        body: raw,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.responseCode !== "00" || !result.paylinkUrl) {
        console.error("iKhokha checkout failed", response.status, result.responseCode);
        return json({ error: "iKhokha could not create the payment link" }, 502);
      }
      paymentUrl = String(result.paylinkUrl);
      providerMetadata = { paylink_id: result.paylinkID || null, response_code: result.responseCode };
    }

    const metadata = { checkout_key: checkoutKey, payment_url: paymentUrl, fields, ...providerMetadata };
    const { error: paymentError } = await db.from("payments").insert({
      order_id: order.order_id,
      provider,
      reference,
      amount,
      status: "pending",
      metadata,
      provider_transaction_id: providerMetadata.paylink_id || null,
    });
    if (paymentError) {
      console.error("Payment record creation failed", paymentError);
      return json({ error: "Payment was not recorded; please retry checkout" }, 500);
    }
    await db.from("orders").update({ payment_status: "pending", payment_reference: reference, updated_at: new Date().toISOString() }).eq("id", order.order_id);

    return json({ ok: true, order_number: order.order_number, payment_url: paymentUrl, fields, provider, amount });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Could not start checkout" }, 500);
  }
});
