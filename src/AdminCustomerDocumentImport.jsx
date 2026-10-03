import React, { useRef, useState } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import { supabase } from './lib/supabase';
import {
  hashStoredClientDocuments,
  inferClientDocumentType,
  matchCustomerFromFilename,
  MAX_CLIENT_DOCUMENT_SIZE,
  sha256Blob,
} from './lib/client-document-import';
import './admin-crm.css';

const customerLabel = (customer) => customer.company_name || customer.contact_name || 'Individual customer';

export default function AdminCustomerDocumentImport({ customers, onClose, onComplete }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef(null);
  const nextId = useRef(0);

  async function addFiles(event) {
    const selectedFiles = Array.from(event.target.files || []);
    event.target.value = '';
    setError('');
    setNotice('');

    const additions = await Promise.all(selectedFiles.map(async (file) => {
      const id = `${Date.now()}-${nextId.current++}`;
      const match = matchCustomerFromFilename(file.name, customers);
      const item = {
        id,
        file,
        hash: '',
        customerId: match?.customer.id || '',
        matchedBy: match?.matchedBy || '',
        status: '',
        message: '',
      };

      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        return { ...item, status: 'invalid', message: 'Choose a PDF file.' };
      }
      if (file.size > MAX_CLIENT_DOCUMENT_SIZE) {
        return { ...item, status: 'invalid', message: 'PDF must be 10 MB or smaller.' };
      }

      try {
        return { ...item, hash: await sha256Blob(file) };
      } catch (hashError) {
        return { ...item, status: 'invalid', message: hashError.message || 'Could not check this PDF.' };
      }
    }));

    setItems((current) => [...current, ...additions]);
  }

  function updateItem(id, patch) {
    setItems((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function removeItem(id) {
    setItems((current) => current.filter((item) => item.id !== id));
  }

  async function importFiles(event) {
    event.preventDefault();
    if (!items.length || items.some((item) => !item.hash || !item.customerId || item.status === 'invalid')) return;

    setBusy(true);
    setError('');
    setNotice('');
    setItems((current) => current.map((item) => ({ ...item, status: 'checking', message: 'Checking for duplicates…' })));

    try {
      const customerIds = [...new Set(items.map((item) => item.customerId))];
      const { data: existingDocuments, error: queryError } = await supabase.from('client_documents')
        .select('id,customer_id,title,document_type,storage_path')
        .in('customer_id', customerIds);
      if (queryError) throw queryError;

      const { hashes, unreadableCustomerIds } = await hashStoredClientDocuments(supabase, existingDocuments || []);
      const existingHashes = new Set(hashes.map(({ customerId, hash }) => `${customerId}:${hash}`));
      const unverifiedCustomers = new Set(unreadableCustomerIds);
      const seenBatchHashes = new Set();
      let imported = 0;
      let duplicates = 0;
      let failed = 0;

      for (const item of items) {
        if (seenBatchHashes.has(item.hash)) {
          duplicates += 1;
          updateItem(item.id, { status: 'duplicate', message: 'Identical PDF already appears in this batch.' });
          continue;
        }
        seenBatchHashes.add(item.hash);

        if (unverifiedCustomers.has(item.customerId)) {
          failed += 1;
          updateItem(item.id, { status: 'failed', message: 'Existing profile documents could not all be checked; skipped to avoid a duplicate.' });
          continue;
        }

        if (existingHashes.has(`${item.customerId}:${item.hash}`)) {
          duplicates += 1;
          updateItem(item.id, { status: 'duplicate', message: 'Identical content is already attached to this customer.' });
          continue;
        }

        const storagePath = `${item.customerId}/${item.hash}.pdf`;
        const { error: uploadError } = await supabase.storage.from('client-documents').upload(storagePath, item.file, {
          contentType: 'application/pdf',
          upsert: false,
        });

        if (uploadError) {
          failed += 1;
          updateItem(item.id, { status: 'failed', message: uploadError.message || 'Could not upload this PDF.' });
          continue;
        }

        const customer = customers.find((candidate) => candidate.id === item.customerId);
        const { error: insertError } = await supabase.from('client_documents').insert({
          customer_id: item.customerId,
          title: item.file.name,
          document_type: inferClientDocumentType(item.file.name),
          storage_path: storagePath,
        });

        if (insertError) {
          await supabase.storage.from('client-documents').remove([storagePath]);
          failed += 1;
          updateItem(item.id, { status: 'failed', message: insertError.message || 'Could not save the document record.' });
          continue;
        }

        imported += 1;
        existingHashes.add(`${item.customerId}:${item.hash}`);
        updateItem(item.id, { status: 'uploaded', message: `Saved to ${customer ? customerLabel(customer) : 'customer profile'}.` });
      }

      if (imported) await onComplete?.();
      setNotice(`Imported ${imported} PDF(s); skipped ${duplicates} duplicate(s); ${failed} could not be imported.`);
    } catch (importError) {
      setError(importError.message || 'Could not check or import these PDFs.');
      setItems((current) => current.map((item) => item.status === 'checking'
        ? { ...item, status: 'failed', message: 'Import stopped before this file was uploaded.' }
        : item));
    } finally {
      setBusy(false);
    }
  }

  const canImport = items.length > 0 && !busy && items.every((item) => item.hash && item.customerId && item.status !== 'invalid');

  return <div className="admin-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="admin-form admin-document-import-form" role="dialog" aria-modal="true" aria-labelledby="document-import-title">
      <button type="button" className="modal-close" aria-label="Close" onClick={onClose} disabled={busy}><X size={18}/></button>
      <span className="eyebrow">CUSTOMER PROFILES</span>
      <h2 id="document-import-title">Bulk PDF import</h2>
      <p>Select PDFs, review the customer match for each file, then import. Matches use the filename against customer or contact names and email addresses.</p>
      <label className="admin-document-import-picker"><Upload size={16}/> Choose PDFs<input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple onChange={addFiles}/></label>
      {items.length > 0 && <form onSubmit={importFiles}>
        <div className="admin-document-import-summary"><strong>{items.length} PDF(s) selected</strong><span>Maximum 10 MB per file</span></div>
        <div className="admin-document-import-list">
          {items.map((item) => {
            const customer = customers.find((candidate) => candidate.id === item.customerId);
            return <article className="admin-document-import-row" key={item.id}>
              <div className="admin-document-import-file">
                <FileText size={17}/>
                <div><strong>{item.file.name}</strong><small>{(item.file.size / 1024 / 1024).toFixed(2)} MB · {inferClientDocumentType(item.file.name).replace('_', ' ')}</small></div>
                <button type="button" className="icon-action" aria-label={`Remove ${item.file.name}`} disabled={busy} onClick={() => removeItem(item.id)}><X size={15}/></button>
              </div>
              <label className="admin-document-import-customer">Assign to customer
                <select value={item.customerId} disabled={busy} onChange={(event) => updateItem(item.id, { customerId: event.target.value, status: '', message: '' })}>
                  <option value="">Choose customer…</option>
                  {customers.map((option) => <option key={option.id} value={option.id}>{customerLabel(option)}{option.email ? ` · ${option.email}` : ''}</option>)}
                </select>
                <small>{customer ? `Matched by ${item.matchedBy || 'manual selection'}${customer.email ? ` · ${customer.email}` : ''}` : 'No confident match; choose the correct customer.'}</small>
              </label>
              <div className={`admin-document-import-status ${item.status || ''}`} role="status">{item.message || 'Ready'}</div>
            </article>;
          })}
        </div>
        <div className="admin-top-actions admin-document-import-actions">
          <button type="button" className="admin-btn ghost" onClick={onClose} disabled={busy}>Close</button>
          <button className="admin-btn" disabled={!canImport}><Upload size={15}/>{busy ? 'Checking and importing…' : `Import ${items.length} PDF(s)`}</button>
        </div>
      </form>}
      {error && <div className="admin-error" role="alert">{error}</div>}
      {notice && <div className="admin-notice" role="status">{notice}</div>}
    </section>
  </div>;
}