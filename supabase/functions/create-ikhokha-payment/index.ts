import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

async function sign(body: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors })

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
  })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Authentication required' }, { status: 401, headers: cors })

  const { order_id } = await req.json()
  if (!order_id) return Response.json({ error: 'order_id is required' }, { status: 400, headers: cors })

  const { data: order, error: orderError } = await supabase
    .from('orders')
    .select('id,order_number,total,payment_status,customer_id,customers!inner(auth_user_id,contact_name,email)')
    .eq('id', order_id)
    .eq('customers.auth_user_id', user.id)
    .maybeSingle()

  if (orderError || !order) return Response.json({ error: 'Order not found or access denied' }, { status: 404, headers: cors })
  if (order.payment_status === 'paid') return Response.json({ error: 'Order is already paid' }, { status: 409, headers: cors })

  const appId = Deno.env.get('IKHOKHA_APP_ID')
  const appSecret = Deno.env.get('IKHOKHA_APP_SECRET')
  const entityId = Deno.env.get('IKHOKHA_ENTITY_ID')
  const baseUrl = Deno.env.get('IKHOKHA_API_BASE_URL') || 'https://api.ikhokha.com/api'
  const siteUrl = Deno.env.get('SITE_URL') || 'https://www.ijlanga.co.za'
  const mode = Deno.env.get('IKHOKHA_MODE') || 'live'

  if (!appId || !appSecret || !entityId) {
    return Response.json({ error: 'iKhokha credentials are not configured yet' }, { status: 503, headers: cors })
  }

  const externalTransactionID = order.order_number
  const amountCents = Math.round(Number(order.total) * 100)
  const payload = {
    entityID: entityId,
    amount: amountCents,
    currency: 'ZAR',
    requesterUrl: siteUrl,
    mode,
    externalTransactionID,
    description: `IJ Langa Consulting order ${order.order_number}`,
    urls: {
      callbackUrl: `${Deno.env.get('SUPABASE_URL')}/functions/v1/ikhokha-webhook`,
      successPageUrl: `${siteUrl}/?payment=success&order=${encodeURIComponent(order.order_number)}`,
      failurePageUrl: `${siteUrl}/?payment=failed&order=${encodeURIComponent(order.order_number)}`,
      cancelUrl: `${siteUrl}/?payment=cancelled&order=${encodeURIComponent(order.order_number)}`,
    },
  }

  const body = JSON.stringify(payload)
  const signature = await sign(body, appSecret)
  const response = await fetch(`${baseUrl}/paymentLink`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'IK-AppID': appId, 'ik-appid': appId, 'ik-sign': signature },
    body,
  })
  const result = await response.json().catch(() => ({}))

  if (!response.ok || result.responseCode !== '00' || !result.paylinkUrl) {
    return Response.json({ error: result.message || 'Unable to create iKhokha payment link', provider: result }, { status: 502, headers: cors })
  }

  const { error: paymentError } = await supabase.from('payments').insert({
    order_id: order.id,
    provider: 'ikhokha',
    reference: externalTransactionID,
    amount: Number(order.total),
    status: 'pending',
    provider_transaction_id: result.paylinkID ?? null,
    metadata: result,
  })
  if (paymentError) console.error('Payment record insert failed', paymentError)

  await supabase.from('orders').update({ payment_status: 'pending', payment_reference: externalTransactionID }).eq('id', order.id)

  return Response.json({ payment_url: result.paylinkUrl, paylink_id: result.paylinkID, order_number: order.order_number }, { headers: cors })
})
