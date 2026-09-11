import { createClient } from 'npm:@supabase/supabase-js@2'

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'content-type, ik-appid, ik-sign' }

async function hmacHex(body: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body))
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return result === 0
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: cors })

  const rawBody = await req.text()
  const appId = Deno.env.get('IKHOKHA_APP_ID')
  const secret = Deno.env.get('IKHOKHA_APP_SECRET')
  const incomingAppId = req.headers.get('ik-appid') || req.headers.get('IK-AppID') || ''
  const incomingSign = req.headers.get('ik-sign') || ''
  if (!appId || !secret || incomingAppId !== appId) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: cors })

  const expected = await hmacHex(rawBody, secret)
  if (!safeEqual(expected.toLowerCase(), incomingSign.toLowerCase())) return Response.json({ error: 'Invalid signature' }, { status: 401, headers: cors })

  let payload: Record<string, unknown>
  try { payload = JSON.parse(rawBody) } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400, headers: cors }) }

  const externalReference = String(payload.externalTransactionID || payload.transactionId || '')
  const providerStatus = String(payload.status || '').toUpperCase()
  const responseCode = String(payload.responseCode || '')
  const successful = providerStatus === 'SUCCESS' || responseCode === '00'
  const failed = ['FAILED', 'FAILURE', 'DECLINED', 'CANCELLED', 'EXPIRED'].includes(providerStatus)
  if (!externalReference) return Response.json({ received: true }, { headers: cors })

  const secretKeysRaw = Deno.env.get('SUPABASE_SECRET_KEYS')
  const secretKeys = secretKeysRaw ? JSON.parse(secretKeysRaw) : {}
  const supabaseSecret = secretKeys.default
  if (!supabaseSecret) return Response.json({ error: 'Supabase secret key is not configured' }, { status: 500, headers: cors })
  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, supabaseSecret)

  const { data: order } = await supabase.from('orders').select('id,total,payment_status').eq('payment_reference', externalReference).maybeSingle()
  if (!order) return Response.json({ received: true, matched: false }, { headers: cors })

  const amountCents = Number(payload.amount || payload.amountCents || 0)
  const amount = amountCents > 100 ? amountCents / 100 : amountCents
  if (amount && Math.abs(amount - Number(order.total)) > 0.01) return Response.json({ error: 'Amount mismatch' }, { status: 400, headers: cors })

  const paymentStatus = successful ? 'successful' : failed ? 'failed' : 'pending'
  await supabase.from('payments').upsert({
    order_id: order.id,
    provider: 'ikhokha',
    reference: externalReference,
    amount: Number(order.total),
    status: paymentStatus,
    provider_transaction_id: String(payload.paylinkID || payload.transactionID || payload.transactionId || '') || null,
    metadata: payload,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'order_id,reference' }).catch(() => null)

  await supabase.from('orders').update({
    payment_status: successful ? 'paid' : failed ? 'failed' : 'pending',
    status: successful ? 'confirmed' : order.payment_status === 'paid' ? 'confirmed' : 'pending',
    updated_at: new Date().toISOString(),
  }).eq('id', order.id)

  return Response.json({ received: true, order_id: order.id, payment_status: paymentStatus }, { headers: cors })
})
