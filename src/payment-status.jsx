import React, { useEffect, useState } from 'react';
import { CheckCircle2, CircleHelp, LoaderCircle, XCircle } from 'lucide-react';
import { supabase } from './lib/supabase';

export default function PaymentStatus() {
  const reference = new URLSearchParams(window.location.search).get('reference') || '';
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let timer;
    async function verify() {
      setError('');
      const { data, error: invokeError } = await supabase.functions.invoke('verify-payment', { body: { reference } });
      if (!active) return;
      if (invokeError || !data?.ok) {
        setError(invokeError?.message || data?.error || 'Payment status could not be checked.');
        return;
      }
      setResult(data);
      if (data.status === 'pending' && attempt < 8) {
        timer = window.setTimeout(() => setAttempt((current) => current + 1), 2500);
      }
    }
    if (!reference) setError('No payment reference was provided.');
    else verify();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [reference, attempt]);

  const paid = result?.status === 'paid';
  const failed = result?.status === 'failed';
  const Icon = paid ? CheckCircle2 : failed ? XCircle : result ? CircleHelp : LoaderCircle;
  const title = paid ? 'Payment received' : failed ? 'Payment not completed' : result ? 'Payment processing' : 'Checking payment';
  const detail = paid
    ? `Order ${result.order_number} is paid.`
    : failed
      ? `Order ${result.order_number} has no confirmed payment. You can return to the client portal for help.`
      : result
        ? 'Your payment has not been confirmed yet. This page will check again automatically.'
        : 'We are checking the provider confirmation against your order.';

  return <main className="portal-auth"><section className="portal-auth-card" aria-live="polite">
    <div className="portal-eyebrow">IJ LANGA CONSULTING</div>
    <Icon size={36} aria-hidden="true" />
    <h1>{title}</h1>
    <p>{detail}</p>
    {result?.order_number && <p>Order reference: <strong>{result.order_number}</strong></p>}
    {error && <p role="alert">{error}</p>}
    <button type="button" onClick={() => setAttempt((current) => current + 1)}>Check status</button>
    <a href="/app">Open client portal</a>
    <a href="/">Return to website</a>
  </section></main>;
}
