import React, { useEffect, useState } from 'react';
import { Check, Download, FileText, RefreshCw, Upload } from 'lucide-react';
import Papa from 'papaparse';
import AccountingImportCenter from './AccountingImportCenter';
import { supabase } from './lib/supabase';
import './admin-crm.css';

const money = (amount) => `R ${Number(amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const documentTypes = ['sales_invoice','purchase_invoice','sales_quote','purchase_quote','sales_order','purchase_order','sales_credit_note','purchase_credit_note','expense_receipt','customer_receipt','supplier_payment','invoice_unclassified','quote_unclassified','credit_note_unclassified','unclassified'];

export default function AdminAccountingImports({ customers }) {
  const [imports, setImports] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [reports, setReports] = useState([]);
  const [adminUserId, setAdminUserId] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [selected, setSelected] = useState(null);
  const [pages, setPages] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function load() {
    const { data: authData } = await supabase.auth.getUser();
    setAdminUserId(authData.user?.id || '');
    setSelectedCustomerId((current) => current || customers[0]?.id || '');
    const [importsResult, accountsResult, reportsResult] = await Promise.all([
      supabase.from('accounting_imports').select('*').order('created_at', { ascending: false }).limit(250),
      supabase.from('accounting_chart_accounts').select('*').eq('is_active', true).order('customer_id').order('code'),
      supabase.from('accounting_report_requests').select('*').order('created_at', { ascending: false }).limit(100),
    ]);
    const queryError = importsResult.error || accountsResult.error || reportsResult.error;
    if (queryError) setError(queryError.message);
    else {
      setImports(importsResult.data || []);
      setAccounts(accountsResult.data || []);
      setReports(reportsResult.data || []);
    }
  }

  useEffect(() => { load(); }, []);

  async function openImport(record) {
    setError('');
    setSelected(record);
    const [pagesResult, transactionsResult] = await Promise.all([
      supabase.from('accounting_import_pages').select('*').eq('import_id', record.id).order('page_number'),
      supabase.from('accounting_import_transactions').select('*').eq('import_id', record.id).order('row_number'),
    ]);
    const queryError = pagesResult.error || transactionsResult.error;
    if (queryError) setError(queryError.message);
    else {
      setPages(pagesResult.data || []);
      setTransactions(transactionsResult.data || []);
    }
  }

  async function updateTransaction(transaction, patch) {
    setBusy(true);
    setError('');
    const { error: updateError } = await supabase.from('accounting_import_transactions').update(patch).eq('id', transaction.id);
    if (updateError) setError(updateError.message);
    else setTransactions((current) => current.map((row) => row.id === transaction.id ? { ...row, ...patch } : row));
    setBusy(false);
  }

  async function updateDocumentType(documentType) {
    if (!selected || busy) return;
    setBusy(true);
    const { error: updateError } = await supabase.from('accounting_imports').update({ document_type: documentType, updated_at: new Date().toISOString() }).eq('id', selected.id);
    if (updateError) setError(updateError.message);
    else setSelected((current) => ({ ...current, document_type: documentType }));
    setBusy(false);
  }

  async function addJournalRow() {
    if (!selected || busy || !pages[0]) return;
    setBusy(true);
    const rowNumber = Math.max(0, ...transactions.map((row) => Number(row.row_number))) + 1;
    const { data, error: insertError } = await supabase.from('accounting_import_transactions').insert({
      import_id: selected.id,
      page_id: pages[0].id,
      row_number: rowNumber,
      description: 'Manual control entry',
      debit: 0,
      credit: 0,
      review_status: 'pending',
      source_data: { manually_added: true },
    }).select('*').single();
    if (insertError) setError(insertError.message);
    else setTransactions((current) => [...current, data]);
    setBusy(false);
  }

  async function postImport() {
    if (!selected || busy) return;
    if (!window.confirm(`Approve and post ${selected.original_name} to the accounting ledger?`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!['verified', 'exempt'].includes(selected.payment_status)) throw new Error('Verified payment or administrator exemption is required.');
      if (pages.length !== Number(selected.page_count) || pages.some((page) => !['extracted', 'needs_review'].includes(page.status))) {
        throw new Error('Every paid source page must be extracted and reviewed.');
      }
      if (!transactions.length || transactions.some((row) => row.review_status !== 'accepted' || ((Number(row.debit) + Number(row.credit)) > 0 && !row.account_id))) {
        throw new Error('Accept every row and assign an account before posting.');
      }
      const debits = transactions.reduce((sum, row) => sum + Number(row.debit || 0), 0);
      const credits = transactions.reduce((sum, row) => sum + Number(row.credit || 0), 0);
      if (debits <= 0 || Math.abs(debits - credits) > 0.01) throw new Error(`Journal must balance before posting. Debits ${money(debits)}; credits ${money(credits)}.`);

      if (selected.status !== 'approved') {
        const { error: approvalError } = await supabase.from('accounting_imports').update({ status: 'approved', updated_at: new Date().toISOString() }).eq('id', selected.id);
        if (approvalError) throw approvalError;
      }
      const { data: journalId, error: postError } = await supabase.rpc('post_accounting_import', { p_import_id: selected.id });
      if (postError) throw postError;
      setNotice(`Posted to journal ${journalId}.`);
      await load();
      const updated = imports.find((entry) => entry.id === selected.id);
      if (updated) await openImport({ ...updated, status: 'completed' });
    } catch (postError) {
      setError(postError.message || 'Could not post this accounting import.');
    } finally {
      setBusy(false);
    }
  }

  async function generateAndReleaseReport(report) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { data: journals, error: journalsError } = await supabase.from('accounting_journals')
        .select('id,journal_number,journal_date,memo')
        .eq('customer_id', report.customer_id)
        .eq('status', 'posted')
        .order('journal_date', { ascending: true });
      if (journalsError) throw journalsError;
      if (!journals?.length) throw new Error('No posted journals are available for this customer report.');

      const journalIds = journals.map((journal) => journal.id);
      const [linesResult, accountsResult] = await Promise.all([
        supabase.from('accounting_journal_lines').select('journal_id,account_id,description,debit,credit,vat_code,vat_amount').in('journal_id', journalIds),
        supabase.from('accounting_chart_accounts').select('id,code,name').eq('customer_id', report.customer_id),
      ]);
      if (linesResult.error || accountsResult.error) throw linesResult.error || accountsResult.error;
      const journalMap = new Map(journals.map((journal) => [journal.id, journal]));
      const accountMap = new Map((accountsResult.data || []).map((account) => [account.id, account]));
      const rows = (linesResult.data || []).map((line) => {
        const journal = journalMap.get(line.journal_id) || {};
        const account = accountMap.get(line.account_id) || {};
        return {
          date: journal.journal_date,
          journal_number: journal.journal_number,
          memo: journal.memo,
          account_code: account.code,
          account: account.name,
          description: line.description,
          debit: line.debit,
          credit: line.credit,
          vat_code: line.vat_code,
          vat_amount: line.vat_amount,
        };
      });
      const safeRows = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [
        key,
        typeof value === 'string' && /^[=+@\-\t\r]/.test(value) ? `'${value}` : value,
      ])));
      const csv = Papa.unparse(safeRows);
      const file = new File([csv], `general-ledger-${new Date().toISOString().slice(0, 10)}.csv`, { type: 'text/csv;charset=utf-8' });
      const path = `${report.customer_id}/${report.id}/${crypto.randomUUID()}.csv`;
      const { error: uploadError } = await supabase.storage.from('accounting-reports').upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) throw uploadError;
      const { error: releaseError } = await supabase.from('accounting_report_requests').update({ output_path: path, status: 'released' }).eq('id', report.id);
      if (releaseError) throw releaseError;
      const recipient = customers.find((customer) => customer.id === report.customer_id);
      const { error: noticeError } = await supabase.rpc('record_notification', {
        p_recipient_user_id: recipient?.auth_user_id || report.requested_by,
        p_recipient_email: recipient?.email || null,
        p_event_type: 'accounting_report_released',
        p_subject: 'Your accounting report is ready',
        p_message: 'Your accounting report has been verified and is available in your client profile. Sign in to download the released CSV report.',
        p_entity_type: 'accounting_report_request',
        p_entity_id: report.id,
      });
      setNotice(noticeError
        ? 'Report was released to the profile, but its email notification could not be queued.'
        : 'Report was released to the profile and its email notification was queued.');
      await load();
    } catch (releaseError) {
      setError(releaseError.message || 'Could not release the report.');
    } finally {
      setBusy(false);
    }
  }

  async function openSource(record) {
    const { data, error: linkError } = await supabase.storage.from('accounting-imports').createSignedUrl(record.storage_path, 300);
    if (linkError) setError(linkError.message);
    else if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  const customerName = (id) => {
    const customer = customers.find((entry) => entry.id === id);
    return customer?.company_name || customer?.contact_name || id;
  };
  const accountOptions = accounts.filter((account) => account.customer_id === selected?.customer_id);
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);

  return <div className="admin-shell">
    <header className="admin-top"><div><span className="eyebrow">ACCOUNTING OPERATIONS</span><h1>Import review</h1><p>Verify source pages, assign tenant accounts, and post only balanced journals.</p></div><div className="admin-top-actions"><button className="admin-btn ghost" onClick={load} disabled={busy}><RefreshCw size={15}/> Refresh</button></div></header>
    {error && <div className="admin-error" role="alert">{error}</div>}
    {notice && <div className="admin-notice" role="status">{notice}</div>}
    <section className="admin-card"><div className="card-head"><div><span className="eyebrow">ADMIN IMPORT</span><h2>Free customer import</h2></div></div><label>Customer<select value={selectedCustomerId} disabled={busy} onChange={(event) => setSelectedCustomerId(event.target.value)}><option value="">Choose customer…</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.company_name || customer.contact_name || customer.email}</option>)}</select></label></section>
    {selectedCustomer && adminUserId && <AccountingImportCenter customer={selectedCustomer} userId={adminUserId} isAdmin/>}
    <section className="admin-card">
      <div className="card-head"><div><span className="eyebrow">PAID IMPORTS</span><h2>Customer files</h2></div></div>
      {!imports.length ? <p className="admin-muted">No accounting imports yet.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Source</th><th>Customer</th><th>Units</th><th>Charge</th><th>Payment</th><th>Review</th><th>Actions</th></tr></thead><tbody>{imports.map((record) => <tr key={record.id}>
        <td><strong>{record.original_name}</strong><small>{record.document_type} · {new Date(record.created_at).toLocaleDateString('en-ZA')}</small></td>
        <td>{customerName(record.customer_id)}</td><td>{record.page_count}</td><td>{money(record.amount_due)}</td>
        <td>{record.payment_status}</td><td>{record.status.replaceAll('_', ' ')}</td>
        <td><div className="admin-row-actions"><button className="admin-btn ghost" onClick={() => openImport(record)}>Review</button><button className="admin-btn ghost" onClick={() => openSource(record)}><FileText size={14}/> Source</button></div></td>
      </tr>)}</tbody></table></div>}
    </section>

    {selected && <section className="admin-card">
      <div className="card-head"><div><span className="eyebrow">SOURCE REVIEW</span><h2>{selected.original_name}</h2><p>{customerName(selected.customer_id)} · {selected.payment_status} · {selected.status.replaceAll('_', ' ')}</p><label>Document type<select value={selected.document_type} disabled={busy || selected.status === 'completed'} onChange={(event) => updateDocumentType(event.target.value)}>{documentTypes.map((type) => <option key={type} value={type}>{type.replaceAll('_', ' ')}</option>)}</select></label></div><button className="admin-btn" disabled={busy || selected.status === 'completed'} onClick={postImport}><Check size={15}/> Approve &amp; post</button></div>
      {!pages.length ? <p className="admin-muted">No extracted pages are available.</p> : pages.map((page) => <details className="admin-finance-lines" key={page.id} open>
        <summary>Unit {page.page_number}: {page.source_location || page.status} · {page.status}</summary>
        <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 280, overflow: 'auto' }}>{page.extracted_text || 'No readable source text.'}</pre>
      </details>)}
      <div className="admin-row-actions"><button className="admin-btn ghost" disabled={busy || selected.status === 'completed'} onClick={addJournalRow}>Add journal row</button></div>
      {!transactions.length ? <p className="admin-muted">No financial rows were detected. Add rows manually before posting.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Row</th><th>Description</th><th>Debit</th><th>Credit</th><th>Account</th><th>Review</th></tr></thead><tbody>{transactions.map((row) => <tr key={row.id}>
        <td>{row.row_number}</td><td><input value={row.description || ''} disabled={busy || row.review_status === 'posted'} onChange={(event) => setTransactions((current) => current.map((item) => item.id === row.id ? { ...item, description: event.target.value } : item))} onBlur={(event) => updateTransaction(row, { description: event.target.value })}/><small>{row.reference || row.classification}</small></td><td><input type="number" min="0" step="0.01" value={row.debit} disabled={busy || row.review_status === 'posted'} onChange={(event) => setTransactions((current) => current.map((item) => item.id === row.id ? { ...item, debit: Number(event.target.value || 0) } : item))} onBlur={(event) => updateTransaction(row, { debit: Number(event.target.value || 0) })}/></td><td><input type="number" min="0" step="0.01" value={row.credit} disabled={busy || row.review_status === 'posted'} onChange={(event) => setTransactions((current) => current.map((item) => item.id === row.id ? { ...item, credit: Number(event.target.value || 0) } : item))} onBlur={(event) => updateTransaction(row, { credit: Number(event.target.value || 0) })}/></td>
        <td><select value={row.account_id || ''} disabled={busy || row.review_status === 'posted'} onChange={(event) => updateTransaction(row, { account_id: event.target.value || null })}><option value="">Choose account…</option>{accountOptions.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select></td>
        <td><select value={row.review_status} disabled={busy || row.review_status === 'posted'} onChange={(event) => updateTransaction(row, { review_status: event.target.value })}><option value="pending">Pending</option><option value="accepted">Accept</option><option value="duplicate">Duplicate</option><option value="rejected">Reject</option></select></td>
      </tr>)}</tbody></table></div>}
    </section>}

    <section className="admin-card"><div className="card-head"><div><span className="eyebrow">REPORT RELEASE</span><h2>Customer report requests</h2></div></div>
      {!reports.length ? <p className="admin-muted">No report requests yet.</p> : reports.map((report) => <div className="admin-list-row" key={report.id}>
        <div><strong>{report.report_type.replaceAll('_', ' ')}</strong><small>{customerName(report.customer_id)} · {report.format.toUpperCase()} · {report.status.replaceAll('_', ' ')}</small></div>
        {report.status === 'admin_review' && <button className="admin-btn" disabled={busy} onClick={() => generateAndReleaseReport(report)}><Download size={14}/> Generate CSV &amp; release</button>}
        {report.status === 'released' && <span className="status-pill">Released</span>}
      </div>)}
    </section>
  </div>;
}