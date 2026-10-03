import React, { useState } from 'react';
import { X } from 'lucide-react';
import './admin-crm.css';

const money = (value) => `R ${Number(value || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2 })}`;
const date = (value) => value ? new Date(value).toLocaleDateString('en-ZA', { dateStyle: 'medium' }) : '—';
const orderStatuses = ['pending', 'confirmed', 'in_progress', 'completed', 'cancelled'];

function Lines({ items, invoice = false }) {
  if (!items?.length) return <p className="admin-muted">No line items recorded.</p>;
  return <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Description</th><th>Qty</th><th>Unit price</th><th>Total</th></tr></thead><tbody>
    {items.map((item) => {
      const description = invoice ? item.description : item.product_name;
      const total = item.total ?? item.line_total ?? Number(item.quantity || 0) * Number(item.unit_price || 0);
      return <tr key={item.id}><td>{description}</td><td>{item.quantity}</td><td>{money(item.unit_price)}</td><td>{money(total)}</td></tr>;
    })}
  </tbody></table></div>;
}

export default function AdminRecordModal({ type, record, customer, busy, error, onClose, onSave, onEditQuote }) {
  const [status, setStatus] = useState(record.status || 'pending');
  const [notes, setNotes] = useState(record.notes || '');
  const [dueDate, setDueDate] = useState(record.due_date ? String(record.due_date).slice(0, 10) : '');
  const isQuote = type === 'quote';
  const isOrder = type === 'order';
  const title = isQuote ? record.quote_number : isOrder ? record.order_number : record.invoice_number;
  const lines = isQuote ? record.quote_items : isOrder ? record.order_items : record.invoice_items;

  async function submit(event) {
    event.preventDefault();
    const patch = isOrder ? { status, notes: notes.trim() || null } : { due_date: dueDate || null, notes: notes.trim() || null };
    await onSave(type, record.id, patch);
  }

  return <div className="admin-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <form className="admin-form admin-record-form" role="dialog" aria-modal="true" aria-labelledby="record-title" onSubmit={submit}>
      <button type="button" className="modal-close" aria-label="Close" onClick={onClose} disabled={busy}><X size={18}/></button>
      <span className="eyebrow">{isQuote ? 'QUOTE' : isOrder ? 'ORDER' : 'INVOICE'} DETAILS</span>
      <h2 id="record-title">{title}</h2>
      <p><strong>{customer?.company_name || customer?.contact_name || record.customer_name || 'Customer'}</strong>{record.customer_email ? ` · ${record.customer_email}` : customer?.email ? ` · ${customer.email}` : ''}</p>
      <div className="admin-record-summary">
        <span>Status<strong>{isOrder ? record.status : record.status}</strong></span>
        <span>{isQuote ? 'Subtotal excl. VAT' : isOrder ? 'Subtotal excl. VAT' : 'Invoice total'}<strong>{money(isQuote ? record.subtotal : isOrder ? record.total : record.total)}</strong></span>
        {isOrder && <span>Payment<strong>{record.payment_status || 'unpaid'}</strong></span>}
        {type === 'invoice' && <span>Balance due<strong>{money(record.balance_due)}</strong></span>}
      </div>
      <h3>Line items</h3>
      <Lines items={lines} invoice={type === 'invoice'} />
      {isOrder && <>
        <label>Order status<select value={status} onChange={(event) => setStatus(event.target.value)}>{orderStatuses.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label>Internal notes<textarea rows="3" value={notes} onChange={(event) => setNotes(event.target.value)}/></label>
      </>}
      {type === 'invoice' && <>
        <label>Due date<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)}/></label>
        <label>Invoice notes<textarea rows="3" value={notes} onChange={(event) => setNotes(event.target.value)}/></label>
        <p className="admin-muted">Payment status and amounts are controlled by recorded payments.</p>
      </>}
      {isQuote && <label>Notes<textarea rows="3" value={notes} readOnly/></label>}
      {error && <div className="admin-error" role="alert">{error}</div>}
      <div className="admin-top-actions">
        <button type="button" className="admin-btn ghost" onClick={onClose} disabled={busy}>Close</button>
        {isQuote && <button type="button" className="admin-btn" onClick={() => onEditQuote(record)}>Edit quote</button>}
        {!isQuote && <button className="admin-btn" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>}
      </div>
    </form>
  </div>;
}
