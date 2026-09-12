import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const site = Deno.env.get("SITE_URL") || "https://www.ijlanga.co.za";
const cors = {
  "Access-Control-Allow-Origin": site,
  "Access-Control-Allow-Headers": "content-type, ik-appid, ik-sign",
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

function callbackPayloadToSign(callbackUrl: string, body: string) {
  return jsStringEscape(new URL(callbackUrl).pathname + body);
}

async function hmacHex(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret.trim()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const rawBody = await req.text();
    const appId = Deno.env.get("IKHOKHA_APP_ID");
    const secret = Deno.env.get("IKHOKHA_APP_SECRET");
    const incomingAppId = req.headers.get("ik-appid") || req.headers.get("IK-AppID") || "";
    const incomingSign = req.headers.get("ik-sign") || "";

    if (!appId || !secret || incomingAppId !== appId) {
      return json({ error: "Unauthorized" }, 401);
    }

    const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/ikhokha-webhook`;
    const expectedSignature = await hmacHex(
      callbackPayloadToSign(callbackUrl, rawBody),
      secret,
    );

    if (!safeEqual(expectedSignature.toLowerCase(), incomingSign.toLowerCase())) {
      return json({ error: "Invalid signature" }, 401);
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }

    const externalReference = String(
      payload.externalTransactionID || payload.transactionId || "",
    );
    const providerStatus = String(payload.status || "").toUpperCase();
    const responseCode = String(payload.responseCode || "");
    const successful = providerStatus === "SUCCESS" || responseCode === "00";
    const failed = ["FAILED", "FAILURE", "DECLINED", "CANCELLED", "EXPIRED"].includes(providerStatus);

    if (!externalReference) return json({ received: true });

    let secretKeys: Record<string, string> = {};
    try {
      secretKeys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    } catch {
      secretKeys = {};
    }
    const serviceKey = secretKeys.default || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!serviceKey) return json({ error: "Supabase secret key is not configured" }, 500);

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);
    const { data: order } = await supabase
      .from("orders")
      .select("id,order_number,customer_id,total,payment_status,customer_email")
      .eq("payment_reference", externalReference)
      .maybeSingle();

    if (!order) return json({ received: true, matched: false });

    // Orders store the catalogue/order subtotal excluding VAT; iKhokha receives
    // the customer-facing VAT-inclusive amount.
    const expectedAmount = Math.round(Number(order.total || 0) * 1.15 * 100) / 100;
    const rawAmount = Number(payload.amount ?? payload.amountCents ?? 0);
    const receivedAmount = rawAmount > 100 ? rawAmount / 100 : rawAmount;

    if (receivedAmount > 0 && Math.abs(receivedAmount - expectedAmount) > 0.01) {
      return json({ error: "Amount mismatch" }, 400);
    }

    const paymentStatus = successful ? "successful" : failed ? "failed" : "pending";
    const providerId = String(
      payload.paylinkID || payload.transactionID || payload.transactionId || "",
    ) || null;

    const { data: existingPayment } = await supabase
      .from("payments")
      .select("id")
      .eq("order_id", order.id)
      .eq("reference", externalReference)
      .maybeSingle();

    let paymentId: string | null = existingPayment?.id || null;
    if (paymentId) {
      await supabase.from("payments").update({
        amount: expectedAmount,
        status: paymentStatus,
        provider_transaction_id: providerId,
        metadata: payload,
        updated_at: new Date().toISOString(),
      }).eq("id", paymentId);
    } else {
      const { data: insertedPayment } = await supabase
        .from("payments")
        .insert({
          order_id: order.id,
          provider: "ikhokha",
          reference: externalReference,
          amount: expectedAmount,
          status: paymentStatus,
          provider_transaction_id: providerId,
          metadata: payload,
        })
        .select("id")
        .single();
      paymentId = insertedPayment?.id || null;
    }

    await supabase.from("orders").update({
      payment_status: successful ? "paid" : failed ? "failed" : "pending",
      status: successful ? "confirmed" : order.payment_status === "paid" ? "confirmed" : "pending",
      updated_at: new Date().toISOString(),
    }).eq("id", order.id);

    if (successful) {
      const { data: existingInvoice } = await supabase
        .from("invoices")
        .select("id,invoice_number,total,amount_paid")
        .eq("order_id", order.id)
        .maybeSingle();

      let invoice = existingInvoice;
      if (!invoice) {
        const { data: items } = await supabase
          .from("order_items")
          .select("product_id,sku,product_name,quantity,unit_price")
          .eq("order_id", order.id);

        const subtotal = (items || []).reduce(
          (sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0),
          0,
        );
        const vat = Math.round(subtotal * 0.15 * 100) / 100;
        const total = Math.round((subtotal + vat) * 100) / 100;

        const { data: created } = await supabase
          .from("invoices")
          .insert({
            order_id: order.id,
            customer_id: order.customer_id,
            status: "issued",
            subtotal,
            vat_rate: 15,
            vat_amount: vat,
            total,
            amount_paid: 0,
            notes: `Generated from ${order.order_number}`,
          })
          .select("id,invoice_number,total,amount_paid")
          .single();

        invoice = created;
        if (created && items?.length) {
          await supabase.from("invoice_items").insert(
            items.map((item) => ({
              invoice_id: created.id,
              product_id: item.product_id,
              sku: item.sku,
              description: item.product_name,
              quantity: item.quantity,
              unit_price: item.unit_price,
              vat_rate: 15,
            })),
          );
        }
      }

      if (invoice && paymentId) {
        const { data: receipt } = await supabase
          .from("receipts")
          .select("id")
          .eq("payment_id", paymentId)
          .maybeSingle();

        if (!receipt) {
          await supabase.from("receipts").insert({
            invoice_id: invoice.id,
            order_id: order.id,
            customer_id: order.customer_id,
            payment_id: paymentId,
            amount: expectedAmount,
            payment_method: "iKhokha",
            payment_reference: externalReference,
          });
        }

        await supabase.from("invoices").update({
          amount_paid: Number(invoice.total || expectedAmount),
          status: "paid",
          updated_at: new Date().toISOString(),
        }).eq("id", invoice.id);
      }

      const notificationRpc = await supabase.rpc("record_notification", {
        p_recipient_user_id: null,
        p_recipient_email: order.customer_email,
        p_event_type: "payment_success",
        p_subject: `Payment received — ${order.order_number}`,
        p_message: `Payment of R ${expectedAmount.toFixed(2)} including VAT was received for ${order.order_number}.`,
        p_entity_type: "order",
        p_entity_id: order.id,
      });
      if (notificationRpc.error) console.error("Payment notification queue failed", notificationRpc.error);
    }

    return json({ received: true, order_id: order.id, payment_status: paymentStatus });
  } catch (error) {
    console.error("ikhokha-webhook error", error);
    return json({ error: error instanceof Error ? error.message : "Webhook processing failed" }, 500);
  }
});
