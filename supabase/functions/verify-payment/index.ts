import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) return json({ error: "Payment verification is not configured" }, 503);

  try {
    const body = await request.json();
    const reference = String(body?.reference || "").trim();
    if (!/^(PF|IK)-[0-9a-f-]{36}$/i.test(reference)) return json({ error: "Invalid payment reference" }, 400);

    const db = createClient(url, key);
    const { data: payment, error } = await db.from("payments")
      .select("reference, amount, status, provider, order_id, orders!inner(order_number)")
      .eq("reference", reference)
      .maybeSingle();
    if (error || !payment) return json({ error: "Payment reference not found" }, 404);

    const status = payment.status === "successful" || payment.status === "paid"
      ? "paid"
      : payment.status === "failed" || payment.status === "cancelled" ? "failed" : "pending";
    const order = Array.isArray(payment.orders) ? payment.orders[0] : payment.orders;
    return json({
      ok: true,
      status,
      provider: payment.provider,
      order_number: order?.order_number || null,
      amount: Number(payment.amount),
    });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Could not verify payment" }, 500);
  }
});
