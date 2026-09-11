import { supabase } from './lib/supabase';

let pendingItems = [];
let handled = false;

function captureCart() {
  pendingItems = [...document.querySelectorAll('.cart-item')].map(row => ({
    sku: row.querySelector('small')?.textContent?.trim() || '',
    quantity: Number(row.querySelector('.qty span')?.textContent || 1),
  })).filter(item => item.sku);
}

function renderQuoteForm() {
  if (handled || !pendingItems.length) return;
  const modal = [...document.querySelectorAll('.overlay .login-panel')].find(el => el.textContent.includes('Your quote is almost ready'));
  if (!modal) return;
  handled = true;
  modal.innerHTML = `
    <button class="icon-btn close-login" id="quote-flow-close">×</button>
    <span class="eyebrow">QUOTE REQUEST</span>
    <h2>Tell us where to send your quote.</h2>
    <p>Your selected services are ready. Enter your details and we will create your secure customer account and quote.</p>
    <form id="quote-flow-form" style="display:grid;gap:12px;text-align:left;margin-top:18px">
      <label>Full name<input name="name" required autocomplete="name" placeholder="Full name" /></label>
      <label>Email address<input name="email" type="email" required autocomplete="email" placeholder="you@example.com" /></label>
      <label>Phone number<input name="phone" autocomplete="tel" placeholder="Optional" /></label>
      <label>Coupon code<input name="coupon_code" autocomplete="off" placeholder="Optional coupon code" /></label>
      <button class="primary full" type="submit">Submit Quote Request</button>
      <div id="quote-flow-status" class="shop-status" aria-live="polite"></div>
    </form>`;
  document.getElementById('quote-flow-close')?.addEventListener('click', () => window.location.hash = '#shop');
  document.getElementById('quote-flow-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const status = document.getElementById('quote-flow-status');
    const button = form.querySelector('button[type="submit"]');
    const fd = new FormData(form);
    button.disabled = true;
    button.textContent = 'Creating quote…';
    status.textContent = '';
    try {
      const { data, error } = await supabase.functions.invoke('create-quote', {
        body: {
          customer: { name: fd.get('name'), email: fd.get('email'), phone: fd.get('phone') },
          coupon_code: String(fd.get('coupon_code') || '').trim().toUpperCase() || null,
          items: pendingItems,
        },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || 'Could not create the quote.');
      modal.innerHTML = `
        <span class="eyebrow">QUOTE CREATED</span>
        <h2>${data.quote.quote_number}</h2>
        <p>Your quote request has been securely captured. We can now review it and convert it into an order.</p>
        ${Number(data.discount || 0) > 0 ? `<div class="cart-total"><span>Discount</span><strong>- R ${Number(data.discount).toLocaleString('en-ZA',{minimumFractionDigits:2})}</strong></div>` : ''}
        <div class="cart-total"><span>Estimated subtotal excl. VAT</span><strong>R ${Number(data.subtotal || 0).toLocaleString('en-ZA',{minimumFractionDigits:2})}</strong></div>
        <div style="display:grid;gap:10px;margin-top:18px">
          <a class="primary full" href="/portal.html">Open Client Portal</a>
          <button class="secondary full" id="quote-flow-done">Close</button>
        </div>`;
      document.getElementById('quote-flow-done')?.addEventListener('click', () => window.location.hash = '#shop');
    } catch (err) {
      status.textContent = err?.message || 'We could not create the quote. Please try again.';
      button.disabled = false;
      button.textContent = 'Submit Quote Request';
    }
  });
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.textContent.includes('Convert to Quote')) {
    captureCart();
    handled = false;
    setTimeout(renderQuoteForm, 0);
  }
});

new MutationObserver(renderQuoteForm).observe(document.body, { childList: true, subtree: true });
