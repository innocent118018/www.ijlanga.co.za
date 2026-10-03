import { createHmac } from 'node:crypto';

export async function verifyWebhookSignature({
  rawBody,
  signature,
  secret,
  prefix = '',
}: {
  rawBody: string;
  signature: string | null;
  secret: string;
  prefix?: string;
}) {
  if (!signature) {
    return { valid: false, reason: 'missing-signature' };
  }

  const expected = createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  const candidate = prefix ? `${prefix}${expected}` : expected;
  const safeSignature = String(signature).trim();

  return {
    valid: safeSignature === candidate,
    reason: safeSignature === candidate ? 'ok' : 'signature-mismatch',
    expected,
    received: safeSignature,
  };
}

export async function processIdempotentWebhook({
  provider,
  eventId,
  eventType,
  payload,
  signature,
  secret,
  providerName,
  supabase,
}: {
  provider: string;
  eventId: string;
  eventType: string;
  payload: Record<string, any>;
  signature?: string | null;
  secret: string;
  providerName: string;
  supabase: any;
}) {
  const valid = await verifyWebhookSignature({
    rawBody: JSON.stringify(payload),
    signature,
    secret,
    prefix: '',
  });

  if (!valid.valid) {
    return { status: 401, ok: false, error: 'invalid-signature' };
  }

  const { data: existing } = await supabase
    .from('payment_events')
    .select('id')
    .eq('provider', provider)
    .eq('provider_event_id', eventId)
    .maybeSingle();

  if (existing) {
    return { status: 200, ok: true, idempotent: true, duplicate: true };
  }

  const { error } = await supabase.from('payment_events').insert({
    payment_id: payload.payment_id ?? null,
    provider: providerName,
    provider_event_id: eventId,
    event_type: eventType,
    payload,
    signature_valid: true,
  });

  if (error) {
    return { status: 500, ok: false, error: error.message };
  }

  return { status: 200, ok: true, idempotent: false, duplicate: false };
}
