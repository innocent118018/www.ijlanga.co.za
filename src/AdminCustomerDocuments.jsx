import React, { useEffect, useRef, useState } from 'react';
import { FileText, FolderOpen, Upload, X } from 'lucide-react';
import { supabase } from './lib/supabase';
import { hashStoredClientDocuments, inferClientDocumentType, MAX_CLIENT_DOCUMENT_SIZE, sha256Blob } from './lib/client-document-import';
import './admin-crm.css';

const date = (value) => value ? new Date(value).toLocaleDateString('en-ZA', { dateStyle: 'medium' }) : '—';

export default function AdminCustomerDocuments({ customer, onClose }) {
  const [documents, setDocuments] = useState([]);
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInput = useRef(null);

  async function load() {
    setLoading(true);
    const { data, error: queryError } = await supabase.from('client_documents')
      .select('id,title,document_type,storage_path,created_at')
      .eq('customer_id', customer.id)
      .order('created_at', { ascending: false });
    if (queryError) setError(queryError.message);
    else setDocuments(data || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, [customer.id]);

  async function upload(event) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError('');
    setNotice('');
    let storagePath = '';
    try {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        throw new Error('Choose a PDF file.');
      }
      if (file.size > MAX_CLIENT_DOCUMENT_SIZE) throw new Error('PDF must be 10 MB or smaller.');
      const fileHash = await sha256Blob(file);
      const { data: existingDocuments, error: queryError } = await supabase.from('client_documents')
        .select('id,customer_id,title,document_type,storage_path')
        .eq('customer_id', customer.id);
      if (queryError) throw queryError;
      const { hashes, unreadableCustomerIds } = await hashStoredClientDocuments(supabase, existingDocuments || []);
      if (unreadableCustomerIds.includes(customer.id)) throw new Error('Existing profile documents could not all be checked; upload stopped to avoid a duplicate.');
      if (hashes.some((entry) => entry.hash === fileHash)) {
        setFile(null);
        if (fileInput.current) fileInput.current.value = '';
        setNotice('This PDF is already attached to this customer profile.');
        return;
      }
      storagePath = `${customer.id}/${fileHash}.pdf`;
      const { error: uploadError } = await supabase.storage.from('client-documents').upload(storagePath, file, {
        contentType: 'application/pdf',
        upsert: false,
      });
      if (uploadError) throw uploadError;
      const { error: insertError } = await supabase.from('client_documents').insert({
        customer_id: customer.id,
        title: title.trim() || file.name,
        document_type: inferClientDocumentType(file.name),
        storage_path: storagePath,
      });
      if (insertError) {
        await supabase.storage.from('client-documents').remove([storagePath]);
        throw insertError;
      }
      setFile(null);
      setTitle('');
      if (fileInput.current) fileInput.current.value = '';
      setNotice('PDF uploaded to this customer profile.');
      await load();
    } catch (uploadError) {
      setError(uploadError.message || 'Could not upload the PDF.');
    } finally {
      setBusy(false);
    }
  }

  async function openDocument(document) {
    setError('');
    const { data, error: linkError } = await supabase.storage.from('client-documents').createSignedUrl(document.storage_path, 300);
    if (linkError) setError(linkError.message);
    else if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    else setError('Could not create a secure document link.');
  }

  return <div className="admin-modal" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="admin-form admin-documents-form" role="dialog" aria-modal="true" aria-labelledby="documents-title">
      <button type="button" className="modal-close" aria-label="Close" onClick={onClose} disabled={busy}><X size={18}/></button>
      <span className="eyebrow">CUSTOMER PROFILE</span>
      <h2 id="documents-title">{customer.company_name || customer.contact_name}</h2>
      <p>{customer.email || 'No email recorded'}</p>
      <form className="admin-document-upload" onSubmit={upload}>
        <label>Document title<input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Quote reference or document name"/></label>
        <label className="admin-document-file"><Upload size={16}/> Choose PDF<input ref={fileInput} type="file" accept="application/pdf,.pdf" onChange={(event) => setFile(event.target.files?.[0] || null)} required/></label>
        {file && <small>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</small>}
        <button className="admin-btn" disabled={busy || !file}><Upload size={15}/>{busy ? 'Uploading…' : 'Upload to customer profile'}</button>
      </form>
      {error && <div className="admin-error" role="alert">{error}</div>}
      {notice && <div className="admin-notice" role="status">{notice}</div>}
      <h3>Profile documents</h3>
      {loading ? <p className="admin-muted">Loading documents…</p> : !documents.length ? <p className="admin-muted">No documents attached to this customer.</p> : documents.map((document) => <div className="admin-list-row" key={document.id}>
        <div><strong><FileText size={15}/> {document.title}</strong><small>{document.document_type} · {date(document.created_at)}</small></div>
        <button className="admin-btn ghost" onClick={() => openDocument(document)}><FolderOpen size={15}/> Open</button>
      </div>)}
      <div className="admin-top-actions"><button className="admin-btn ghost" onClick={onClose}>Close</button></div>
    </section>
  </div>;
}
