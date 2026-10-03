import React, { useEffect, useState } from 'react';
import { Download, FileText, RefreshCw, Upload, X } from 'lucide-react';
import Papa from 'papaparse';
import { supabase } from './lib/supabase';
import { matchCustomerFromFilename, sha256Blob } from './lib/client-document-import';
import { guessFinancialDocumentType, parseFinancialAmount, parseFinancialImportFile, suggestFinancialAccount } from './lib/financial-import-parsers';
import './admin-crm.css';

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 1000;
const IMPORT_ACCEPT = '.pdf,.xlsx,.xlsm,.xltx,.csv,.xml,.ubl,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.gif';
const DOCUMENT_TYPES = [
  ['sales_invoice', 'Sales invoice'],
  ['purchase_invoice', 'Purchase invoice'],
  ['sales_quote', 'Sales quote'],
  ['purchase_quote', 'Purchase quote'],
  ['sales_order', 'Sales order'],
  ['purchase_order', 'Purchase order'],
  ['sales_credit_note', 'Sales credit note'],
  ['purchase_credit_note', 'Purchase credit note'],
  ['expense_receipt', 'Expense receipt'],
  ['customer_receipt', 'Customer receipt'],
  ['supplier_payment', 'Supplier payment'],
  ['invoice_unclassified', 'Unclassified invoice'],
  ['quote_unclassified', 'Unclassified quote'],
  ['credit_note_unclassified', 'Unclassified credit note'],
  ['unclassified', 'Unclassified document'],
];
const POSTABLE_TYPES = new Set(['sales_invoice','purchase_invoice','expense_receipt','customer_receipt','supplier_payment','sales_credit_note','purchase_credit_note']);
const SETTLEMENT_TYPES = new Set(['customer_receipt','supplier_payment']);
const SALES_TYPES = new Set(['sales_invoice','sales_quote','sales_order','sales_credit_note','customer_receipt']);
const PURCHASE_TYPES = new Set(['purchase_invoice','purchase_quote','purchase_order','purchase_credit_note','expense_receipt','supplier_payment']);
const formatMoney = (value) => `R ${Number(value || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const customerName = (customer) => customer.company_name || customer.contact_name || customer.email || 'Individual';
const normalizedName = (value) => String(value || '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]/g, '');
const typeLabel = (type) => DOCUMENT_TYPES.find(([value]) => value === type)?.[1] || type;
const extensionOf = (name) => name.split('.').at(-1)?.toLowerCase() || '';
const mimeFor = (file) => file.type || ({ pdf: 'application/pdf', csv: 'text/csv', xml: 'application/xml', ubl: 'application/xml', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsm: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xltx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template' }[extensionOf(file.name)] || 'application/octet-stream');

function inferPartyName(filename, extractedText) {
  const fromText = extractedText.match(/(?:and\s+customer|customer|supplier|vendor)\s*[:\-]?\s*([^\n]+)/i)?.[1]?.trim();
  if (fromText) return fromText;
  return filename.replace(/\.[^.]+$/, '').split(/[—–]/).at(-1)?.trim() || '';
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === '') return null;
  return parseFinancialAmount(value);
}

function accountSuggestionId(line, type, accounts) {
  const suggestion = suggestFinancialAccount(line.description || line.rawText, type);
  const account = accounts.find((candidate) => candidate.code === suggestion.code);
  return { accountId: account?.id || '', code: suggestion.code, confidence: suggestion.confidence };
}

function makeDraft(file, parsed, hash, customers, suppliers, accounts, id) {
  const matchText = `${file.name}\n${parsed.extractedText}`;
  const matchedCustomer = matchCustomerFromFilename(matchText, customers);
  const supplierMatch = matchCustomerFromFilename(matchText, suppliers.map((supplier) => ({
    id: supplier.id,
    company_name: supplier.supplier_name,
    contact_name: supplier.supplier_name,
    email: supplier.email,
  })));
  const documentType = parsed.suggestedType || guessFinancialDocumentType(file.name, parsed.extractedText);
  const partyName = matchedCustomer
    ? customerName(matchedCustomer.customer)
    : supplierMatch
      ? supplierMatch.customer.company_name
      : inferPartyName(file.name, parsed.extractedText);
  const partyEmail = matchedCustomer?.customer.email || supplierMatch?.customer.email || '';
  const lines = parsed.lines.map((line) => {
    const suggestion = accountSuggestionId(line, documentType, accounts);
    return {
      ...line,
      id: `${id}-${line.lineNumber}`,
      accountId: line.isFinancialLine ? suggestion.accountId : '',
      suggestedAccountCode: suggestion.code,
      classificationConfidence: suggestion.confidence,
    };
  });
  const detectedSubtotal = lines.filter((line) => line.isFinancialLine).reduce((sum, line) => sum + Number(line.netAmount ?? line.grossAmount ?? 0), 0);
  const detectedVat = lines.reduce((sum, line) => sum + Number(line.vatAmount || 0), 0);
  const subtotal = parsed.subtotal ?? detectedSubtotal;
  const vatAmount = parsed.vatAmount ?? detectedVat;

  return {
    id,
    file,
    hash,
    parsed,
    documentType,
    customerId: SALES_TYPES.has(documentType) ? matchedCustomer?.customer.id || '' : '',
    supplierId: PURCHASE_TYPES.has(documentType) ? supplierMatch?.customer.id || '' : '',
    partyName,
    partyEmail,
    documentNumber: parsed.documentNumber || '',
    issueDate: parsed.issueDate || new Date().toISOString().slice(0, 10),
    dueDate: parsed.dueDate || '',
    currency: 'ZAR',
    subtotal,
    vatAmount,
    roundingAmount: parsed.roundingAmount || 0,
    total: parsed.total ?? subtotal + vatAmount,
    amountPaid: 0,
    lines,
    status: '',
    message: '',
    recordId: '',
  };
}

function postValidation(item, accounts) {
  if (!POSTABLE_TYPES.has(item.documentType)) return 'Quotes and orders do not post to the ledger.';
  if (SALES_TYPES.has(item.documentType) && !item.customerId) return 'Assign this sales document to a customer.';
  if (PURCHASE_TYPES.has(item.documentType) && !item.partyName.trim()) return 'Enter a supplier name.';
  if (SETTLEMENT_TYPES.has(item.documentType)) return Number(item.total || 0) > 0 ? '' : 'A positive payment amount is required.';
  if (!item.lines.some((line) => line.isFinancialLine)) return 'No financial line items were detected.';
  const financialLines = item.lines.filter((line) => line.isFinancialLine);
  if (financialLines.some((line) => line.netAmount === null || !line.accountId)) return 'Every financial line needs an amount and account.';

  const allowedTypes = item.documentType.startsWith('sales_')
    ? new Set(['revenue'])
    : new Set(['expense','asset']);
  if (financialLines.some((line) => !allowedTypes.has(accounts.find((account) => account.id === line.accountId)?.account_type))) {
    return item.documentType.startsWith('sales_') ? 'Sales lines must use revenue accounts.' : 'Purchase lines must use expense or asset accounts.';
  }

  const lineSubtotal = financialLines.reduce((sum, line) => sum + Number(line.netAmount || 0), 0);
  if (Math.abs(lineSubtotal - Number(item.subtotal || 0)) > 0.01) return 'Line amounts must add up to the document subtotal.';
  if (Math.abs(Number(item.subtotal || 0) + Number(item.vatAmount || 0) + Number(item.roundingAmount || 0) - Number(item.total || 0)) > 0.02) {
    return 'Subtotal plus VAT and rounding must equal the total.';
  }
  if (Number(item.total || 0) <= 0) return 'A positive total is required to post.';
  return '';
}

function saveCsv(rows, filename) {
  const safeRows = rows.map((row) => Object.fromEntries(Object.entries(row).map(([key, value]) => [
    key,
    typeof value === 'string' && /^[=+@\-\t\r]/.test(value) ? `'${value}` : value,
  ])));
  const csv = Papa.unparse(safeRows);
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function AdminFinancialImports({ customers, onBack }) {
  const [accounts, setAccounts] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [balances, setBalances] = useState([]);
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadWorkspace() {
    const [accountResult, supplierResult, documentResult, balanceResult] = await Promise.all([
      supabase.from('accounting_accounts').select('*').eq('is_active', true).order('code'),
      supabase.from('finance_suppliers').select('*').order('supplier_name'),
      supabase.from('finance_documents').select('*').order('created_at', { ascending: false }).limit(250),
      supabase.from('accounting_account_balances').select('*').order('code'),
    ]);
    const queryError = accountResult.error || supplierResult.error || documentResult.error || balanceResult.error;
    if (queryError) setError(queryError.message);
    else {
      setAccounts(accountResult.data || []);
      setSuppliers(supplierResult.data || []);
      setDocuments(documentResult.data || []);
      setBalances(balanceResult.data || []);
    }
    setLoading(false);
  }

  useEffect(() => {
    loadWorkspace();
    const channel = supabase.channel('finance-import-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'finance_documents' }, loadWorkspace)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'accounting_journals' }, loadWorkspace)
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  async function addFilesFromList(fileList) {
    const files = Array.from(fileList || []);
    setError('');
    setNotice('');
    const additions = await Promise.all(files.map(async (file, index) => {
      const id = `${Date.now()}-${index}-${Math.random().toString(16).slice(2)}`;
      const extension = extensionOf(file.name);
      if (!['pdf','csv','xlsx','xlsm','xltx','xml','ubl','png','jpg','jpeg','tif','tiff','bmp','gif'].includes(extension)) {
        return { id, file, error: 'Supported types: PDF, CSV, XLSX, XLSM, XML, UBL and common image formats.' };
      }
      if (file.size > MAX_FILE_BYTES) return { id, file, error: 'File must be 20 MB or smaller.' };
      try {
        const parsed = await parseFinancialImportFile(file);
        const hash = await sha256Blob(file);
        const draft = makeDraft(file, parsed, hash, customers, suppliers, accounts, id);
        const duplicate = documents.find((document) => document.content_sha256 === hash);
        return { ...draft, status: duplicate ? 'duplicate' : '', message: duplicate ? `Already imported as ${duplicate.document_number || duplicate.source_file_name}.` : '' };
      } catch (parseError) {
        return { id, file, error: parseError.message || 'Could not parse this file.' };
      }
    }));

    setQueue((current) => {
      const seenHashes = new Set([...documents, ...current].map((document) => document.content_sha256 || document.hash).filter(Boolean));
      return [...current, ...additions.map((item) => {
        if (!item.hash || !seenHashes.has(item.hash)) {
          if (item.hash) seenHashes.add(item.hash);
          return item;
        }
        return { ...item, status: 'duplicate', message: 'Identical file already exists in this profile or batch.' };
      })];
    });
  }

  async function addFiles(event) {
    addFilesFromList(event.target.files || []);
    event.target.value = '';
  }

  async function handleDrop(event) {
    event.preventDefault();
    addFilesFromList(event.dataTransfer?.files || []);
  }

  function updateDraft(id, patch) {
    setQueue((current) => current.map((item) => item.id === id ? { ...item, ...patch, message: '' } : item));
  }

  function updateLine(draft, lineId, patch) {
    updateDraft(draft.id, { lines: draft.lines.map((line) => line.id === lineId ? { ...line, ...patch } : line) });
  }

  async function resolveSupplier(item, userId) {
    if (!PURCHASE_TYPES.has(item.documentType) || !item.partyName.trim()) return null;
    if (item.supplierId) return item.supplierId;
    const nameKey = normalizedName(item.partyName);
    const existing = suppliers.find((supplier) => normalizedName(supplier.supplier_name) === nameKey);
    if (existing) return existing.id;
    const { data, error: supplierError } = await supabase.from('finance_suppliers').insert({
      supplier_name: item.partyName.trim(),
      email: item.partyEmail.trim() || null,
      created_by: userId,
    }).select('id').single();
    if (supplierError) throw supplierError;
    return data.id;
  }

  function databaseLine(item, line) {
    return {
      document_id: item.recordId,
      line_number: line.lineNumber,
      source_location: line.sourceLocation || '',
      raw_text: line.rawText || '',
      description: line.description || line.rawText || '',
      quantity: numberOrNull(line.quantity),
      unit_price: numberOrNull(line.unitPrice),
      net_amount: numberOrNull(line.netAmount),
      vat_rate: numberOrNull(line.vatRate),
      vat_amount: numberOrNull(line.vatAmount),
      gross_amount: numberOrNull(line.grossAmount),
      is_financial_line: Boolean(line.isFinancialLine),
      account_id: line.isFinancialLine ? line.accountId || null : null,
      suggested_account_code: line.suggestedAccountCode || null,
      classification_confidence: Number(line.classificationConfidence || 0),
      source_data: line.sourceData || {},
    };
  }

  async function saveDocument(item, postAfterSave = false) {
    if (item.error || !item.hash) throw new Error(item.error || 'The file hash is unavailable.');
    if (item.recordId && item.status === 'posted') throw new Error('This document has already been posted.');
    const userResult = await supabase.auth.getUser();
    if (userResult.error || !userResult.data.user) throw new Error('Sign in as an administrator to import financial documents.');
    const userId = userResult.data.user.id;
    const validation = postAfterSave ? postValidation(item, accounts) : '';
    if (validation) throw new Error(validation);

    if (!item.recordId) {
      const { data: duplicate, error: duplicateError } = await supabase.from('finance_documents')
        .select('id,document_number,source_file_name').eq('content_sha256', item.hash).maybeSingle();
      if (duplicateError) throw duplicateError;
      if (duplicate) throw new Error(`Duplicate file already exists as ${duplicate.document_number || duplicate.source_file_name}.`);
    }

    let supplierId = await resolveSupplier(item, userId);
    let storagePath = item.storagePath || '';
    let recordId = item.recordId || '';
    const needsTypeReview = ['unclassified','invoice_unclassified','quote_unclassified','credit_note_unclassified'].includes(item.documentType);
    const status = postAfterSave || (!needsTypeReview && (item.lines.length || SETTLEMENT_TYPES.has(item.documentType))) ? 'reviewed' : 'needs_review';
    const documentPatch = {
      document_type: item.documentType,
      status,
      source_file_name: item.file.name,
      source_mime_type: mimeFor(item.file),
      source_size_bytes: item.file.size,
      content_sha256: item.hash,
      storage_path: storagePath,
      customer_id: SALES_TYPES.has(item.documentType) ? item.customerId || null : null,
      supplier_id: supplierId,
      party_name: item.partyName.trim() || null,
      party_email: item.partyEmail.trim() || null,
      document_number: item.documentNumber.trim() || null,
      issue_date: item.issueDate || null,
      due_date: item.dueDate || null,
      currency: item.currency || 'ZAR',
      subtotal: Number(item.subtotal || 0),
      vat_amount: Number(item.vatAmount || 0),
      rounding_amount: Number(item.roundingAmount || 0),
      total: Number(item.total || 0),
      amount_paid: Number(item.amountPaid || 0),
      balance_due: Number(item.total || 0) - Number(item.amountPaid || 0),
      parser_format: item.parsed.format,
      parser_warnings: item.parsed.warnings || [],
      extracted_metadata: {
        extracted_line_count: item.lines.length,
        type_suggestion: item.parsed.suggestedType,
        parser_version: '1',
      },
      imported_by: userId,
      reviewed_by: status === 'reviewed' ? userId : null,
      reviewed_at: status === 'reviewed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    if (recordId) {
      if (documents.find((document) => document.id === recordId)?.status === 'posted') throw new Error('Posted documents cannot be changed.');
      const { error: updateError } = await supabase.from('finance_documents').update(documentPatch).eq('id', recordId);
      if (updateError) throw updateError;
      const { error: deleteLinesError } = await supabase.from('finance_document_lines').delete().eq('document_id', recordId);
      if (deleteLinesError) throw deleteLinesError;
    } else {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw new Error('Administrator session expired. Sign in again.');
      const extension = extensionOf(item.file.name);
      storagePath = `${authData.user.id}/${item.hash}.${extension}`;
      documentPatch.storage_path = storagePath;
      const { error: uploadError } = await supabase.storage.from('finance-imports').upload(storagePath, item.file, {
        contentType: mimeFor(item.file),
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data: document, error: insertError } = await supabase.from('finance_documents').insert(documentPatch).select('id').single();
      if (insertError) throw insertError;
      recordId = document.id;
    }

    const lineRows = item.lines.map((line) => databaseLine({ ...item, recordId }, line));
    if (lineRows.length) {
      const { error: linesError } = await supabase.from('finance_document_lines').insert(lineRows);
      if (linesError) throw linesError;
    }

    const { error: eventError } = await supabase.from('finance_document_events').insert({
      document_id: recordId,
      event_type: item.recordId ? 'updated' : 'imported',
      actor_id: userId,
      event_data: { line_count: lineRows.length, document_type: item.documentType, content_sha256: item.hash },
    });
    if (eventError) setError(`Document saved, but its import event could not be recorded: ${eventError.message}`);

    if (postAfterSave) {
      const { error: reviewedEventError } = await supabase.from('finance_document_events').insert({
        document_id: recordId,
        event_type: 'reviewed',
        actor_id: userId,
        event_data: { reviewed_in_import_queue: true },
      });
      if (reviewedEventError) setError(`Document saved, but its review event could not be recorded: ${reviewedEventError.message}`);
      const { error: postError } = await supabase.rpc('post_finance_document', { p_document_id: recordId });
      if (postError) throw postError;
    }

    setQueue((current) => current.map((queued) => queued.id === item.id
      ? { ...queued, recordId, storagePath, status: postAfterSave ? 'posted' : status, message: postAfterSave ? 'Posted to the accounting ledger.' : 'Saved for review.' }
      : queued));
    await loadWorkspace();
    return recordId;
  }

  async function saveAll() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    let saved = 0;
    let failed = 0;
    try {
      for (const item of queue.filter((queued) => queued.status !== 'posted' && queued.status !== 'duplicate')) {
        setProgress(`Saving ${saved + failed + 1} of ${queue.length}: ${item.file.name}`);
        try {
          await saveDocument(item, false);
          saved += 1;
        } catch (saveError) {
          failed += 1;
          setQueue((current) => current.map((queued) => queued.id === item.id ? { ...queued, status: 'failed', message: saveError.message || 'Could not save this document.' } : queued));
        }
      }
      setNotice(`Saved ${saved} document(s) for review; ${failed} failed.`);
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function postDocument(item) {
    const validation = postValidation(item, accounts);
    if (validation) {
      setQueue((current) => current.map((queued) => queued.id === item.id ? { ...queued, status: 'needs_review', message: validation } : queued));
      return;
    }
    if (!window.confirm(`Post ${typeLabel(item.documentType)} ${item.documentNumber || item.file.name} to the accounting ledger? This updates account balances and reports.`)) return;
    setBusy(true);
    setError('');
    setNotice('');
    setProgress(`Posting ${item.file.name}`);
    try {
      await saveDocument(item, true);
      setNotice(`${item.file.name} was posted to the ledger.`);
    } catch (postError) {
      setQueue((current) => current.map((queued) => queued.id === item.id ? { ...queued, status: 'failed', message: postError.message || 'Could not post this document.' } : queued));
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function postReviewedDocument(document) {
    if (!window.confirm(`Post ${typeLabel(document.document_type)} ${document.document_number || document.source_file_name} to the accounting ledger?`)) return;
    setBusy(true);
    setError('');
    try {
      const { error: eventError } = await supabase.from('finance_document_events').insert({
        document_id: document.id,
        event_type: 'reviewed',
        actor_id: (await supabase.auth.getUser()).data.user?.id,
        event_data: { reviewed_from_queue: true },
      });
      if (eventError) setError(`Review action was not logged: ${eventError.message}`);
      const { error: updateError } = await supabase.from('finance_documents').update({
        status: 'reviewed',
        reviewed_by: (await supabase.auth.getUser()).data.user?.id,
        reviewed_at: new Date().toISOString(),
      }).eq('id', document.id);
      if (updateError) throw updateError;
      const { error: postError } = await supabase.rpc('post_finance_document', { p_document_id: document.id });
      if (postError) throw postError;
      setNotice(`${document.source_file_name} was posted to the accounting ledger.`);
      await loadWorkspace();
    } catch (postError) {
      setError(postError.message || 'Could not post this document.');
    } finally {
      setBusy(false);
    }
  }

  async function openSource(document) {
    const { data, error: linkError } = await supabase.storage.from('finance-imports').createSignedUrl(document.storage_path, 300);
    if (linkError) setError(linkError.message);
    else if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  function exportTrialBalance() {
    saveCsv(balances.map(({ code, name, account_type, report_group, debit_total, credit_total, balance }) => ({
      code, account: name, account_type, report_group, debit_total, credit_total, balance,
    })), `trial-balance-${new Date().toISOString().slice(0, 10)}.csv`);
  }

  async function exportLedger() {
    setBusy(true);
    setError('');
    try {
      const { data: journals, error: journalError } = await supabase.from('accounting_journals')
        .select('id,entry_date,reference,document_id')
        .order('entry_date', { ascending: true });
      if (journalError) throw journalError;
      if (!journals?.length) {
        setError('There are no posted journal entries to export yet.');
        return;
      }
      const ids = journals.map((journal) => journal.id);
      const documentIds = [...new Set(journals.map((journal) => journal.document_id))];
      const [lineResult, documentResult] = await Promise.all([
        supabase.from('accounting_journal_lines').select('*').in('journal_id', ids).order('line_number'),
        supabase.from('finance_documents').select('id,document_type,document_number,party_name,currency').in('id', documentIds),
      ]);
      if (lineResult.error || documentResult.error) throw lineResult.error || documentResult.error;
      const accountMap = new Map(accounts.map((account) => [account.id, account]));
      const journalMap = new Map(journals.map((journal) => [journal.id, journal]));
      const documentMap = new Map((documentResult.data || []).map((document) => [document.id, document]));
      const rows = (lineResult.data || []).map((line) => {
        const journal = journalMap.get(line.journal_id) || {};
        const document = documentMap.get(journal.document_id) || {};
        const account = accountMap.get(line.account_id) || {};
        return {
          date: journal.entry_date,
          journal_reference: journal.reference,
          document_type: document.document_type,
          document_number: document.document_number,
          party: document.party_name,
          account_code: account.code,
          account: account.name,
          description: line.description,
          debit: line.debit,
          credit: line.credit,
          currency: document.currency,
        };
      });
      saveCsv(rows, `general-ledger-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (exportError) {
      setError(exportError.message || 'Could not export the general ledger.');
    } finally {
      setBusy(false);
    }
  }

  return <div className="admin-finance-imports">
    <header className="admin-finance-import-header"><div><span className="eyebrow">FINANCE OPERATIONS</span><h1>Live document importer</h1></div><div className="admin-top-actions"><button className="admin-btn ghost" onClick={onBack} disabled={busy}>Back to dashboard</button><button className="admin-btn ghost" onClick={loadWorkspace} disabled={loading || busy}><RefreshCw size={15}/> Refresh</button></div></header>
    <section className="admin-card">
      <div className="card-head"><div><span className="eyebrow">SOURCE FILES</span><h2>Import and review</h2></div></div>
      <p className="admin-muted">PDF, XLSX, CSV, XML and UBL files are parsed into reviewable source rows. Nothing affects account balances until an eligible invoice, receipt or payment is explicitly posted.</p>
      <div className="admin-finance-import-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={handleDrop}>
        <label className="admin-finance-import-picker"><Upload size={16}/> Choose financial files or drag & drop<input type="file" multiple accept={IMPORT_ACCEPT} disabled={loading || busy} onChange={addFiles}/></label>
      </div>
      <small className="admin-muted">20 MB maximum per file. PDFs up to {MAX_PDF_PAGES.toLocaleString()} pages, scans, images, spreadsheets, CSV, XML, and UBL files are accepted; imports over 100 pages require payment before report release.</small>
      {progress && <div className="admin-notice" role="status">{progress}</div>}
      {error && <div className="admin-error" role="alert">{error}</div>}
      {notice && <div className="admin-notice" role="status">{notice}</div>}
      {!!queue.length && <div className="admin-finance-queue">
        <div className="admin-finance-queue-head"><strong>{queue.length} file(s) in this batch</strong><button className="admin-btn" disabled={busy || !queue.some((item) => item.hash && item.status !== 'duplicate')} onClick={saveAll}><FileText size={15}/> Save batch for review</button></div>
        {queue.map((item) => {
          const financialLines = item.lines?.filter((line) => line.isFinancialLine) || [];
          const postError = item.error ? item.error : item.hash ? postValidation(item, accounts) : '';
          const isDuplicate = item.status === 'duplicate';
          return <article className="admin-finance-draft" key={item.id}>
            <div className="admin-finance-draft-head">
              <div><strong>{item.file.name}</strong><small>{item.parsed ? `${item.parsed.format.toUpperCase()} · ${item.lines.length} source line(s) · ${item.lines.filter((line) => line.isFinancialLine).length} financial line(s)` : item.error}</small></div>
              <button type="button" className="icon-action" aria-label={`Remove ${item.file.name}`} disabled={busy || item.recordId} onClick={() => setQueue((current) => current.filter((queued) => queued.id !== item.id))}><X size={15}/></button>
            </div>
            {item.parsed && <>
              {!!item.parsed.warnings.length && <div className="admin-finance-warning">{item.parsed.warnings.join(' ')}</div>}
              <div className="admin-finance-fields">
                <label>Document type<select value={item.documentType} disabled={busy || item.recordId} onChange={(event) => {
                  const nextType = event.target.value;
                  updateDraft(item.id, {
                    documentType: nextType,
                    customerId: SALES_TYPES.has(nextType) ? item.customerId : '',
                    supplierId: PURCHASE_TYPES.has(nextType) ? item.supplierId : '',
                    lines: item.lines.map((line) => {
                      const suggestion = accountSuggestionId(line, nextType, accounts);
                      return { ...line, suggestedAccountCode: suggestion.code, classificationConfidence: suggestion.confidence,
                        accountId: line.isFinancialLine ? suggestion.accountId : '' };
                    }),
                  });
                }}>{DOCUMENT_TYPES.map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
                <label>Reference<input value={item.documentNumber} disabled={busy || item.recordId} onChange={(event) => updateDraft(item.id, { documentNumber: event.target.value })}/></label>
                <label>Issue date<input type="date" value={item.issueDate} disabled={busy || item.recordId} onChange={(event) => updateDraft(item.id, { issueDate: event.target.value })}/></label>
                <label>Due date<input type="date" value={item.dueDate} disabled={busy || item.recordId} onChange={(event) => updateDraft(item.id, { dueDate: event.target.value })}/></label>
                {SALES_TYPES.has(item.documentType) && <label>Customer<select value={item.customerId} disabled={busy || item.recordId} onChange={(event) => {
                  const customer = customers.find((entry) => entry.id === event.target.value);
                  updateDraft(item.id, { customerId: event.target.value, partyName: customer ? customerName(customer) : '', partyEmail: customer?.email || '' });
                }}><option value="">Choose customer…</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customerName(customer)}{customer.email ? ` · ${customer.email}` : ''}</option>)}</select></label>}
                {PURCHASE_TYPES.has(item.documentType) && <>
                  <label>Supplier name<input value={item.partyName} disabled={busy || item.recordId} list={`suppliers-${item.id}`} onChange={(event) => updateDraft(item.id, { partyName: event.target.value })}/><datalist id={`suppliers-${item.id}`}>{suppliers.map((supplier) => <option key={supplier.id} value={supplier.supplier_name}>{supplier.email || ''}</option>)}</datalist></label>
                  <label>Supplier email<input type="email" value={item.partyEmail} disabled={busy || item.recordId} onChange={(event) => updateDraft(item.id, { partyEmail: event.target.value })}/></label>
                </>}
                <label>Subtotal<input type="number" min="0" step="0.01" value={item.subtotal ?? ''} disabled={busy || item.recordId} onChange={(event) => updateDraft(item.id, { subtotal: numberOrNull(event.target.value) })}/></label>
                <label>VAT<input type="number" min="0" step="0.01" value={item.vatAmount ?? ''} disabled={busy || item.recordId} onChange={(event) => updateDraft(item.id, { vatAmount: numberOrNull(event.target.value) })}/></label>
                <label>Rounding<input type="number" step="0.01" value={item.roundingAmount ?? ''} disabled={busy || item.recordId} onChange={(event) => updateDraft(item.id, { roundingAmount: numberOrNull(event.target.value) })}/></label>
                <label>Total<input type="number" min="0" step="0.01" value={item.total ?? ''} disabled={busy || item.recordId} onChange={(event) => updateDraft(item.id, { total: numberOrNull(event.target.value) })}/></label>
                <label>Amount paid<input type="number" min="0" step="0.01" value={item.amountPaid ?? ''} disabled={busy || item.recordId} onChange={(event) => updateDraft(item.id, { amountPaid: numberOrNull(event.target.value) })}/></label>
              </div>
              <details className="admin-finance-lines" open>
                <summary>Extracted rows ({item.lines.length})</summary>
                {!item.lines.length ? <p className="admin-muted">No text rows were detected. The original file will be preserved, but it cannot be posted until line items are entered.</p> : item.lines.map((line) => <div className={`admin-finance-line ${line.isFinancialLine ? 'financial' : ''}`} key={line.id}>
                  <div className="admin-finance-line-source"><span>{line.sourceLocation || `Line ${line.lineNumber}`}</span><strong>{line.rawText || '(empty source row)'}</strong>{line.rawText !== line.description && <small>{line.description}</small>}</div>
                  <label className="admin-finance-line-toggle"><input type="checkbox" checked={line.isFinancialLine} disabled={busy || item.recordId} onChange={(event) => updateLine(item, line.id, { isFinancialLine: event.target.checked })}/> Financial</label>
                  {line.isFinancialLine && <>
                    <label>Description<input value={line.description} disabled={busy || item.recordId} onChange={(event) => updateLine(item, line.id, { description: event.target.value })}/></label>
                    <label>Qty<input type="number" step="0.0001" value={line.quantity ?? ''} disabled={busy || item.recordId} onChange={(event) => updateLine(item, line.id, { quantity: numberOrNull(event.target.value) })}/></label>
                    <label>Unit price<input type="number" step="0.0001" value={line.unitPrice ?? ''} disabled={busy || item.recordId} onChange={(event) => updateLine(item, line.id, { unitPrice: numberOrNull(event.target.value) })}/></label>
                    <label>Net amount<input type="number" step="0.01" value={line.netAmount ?? ''} disabled={busy || item.recordId} onChange={(event) => updateLine(item, line.id, { netAmount: numberOrNull(event.target.value) })}/></label>
                    <label>VAT amount<input type="number" step="0.01" value={line.vatAmount ?? ''} disabled={busy || item.recordId} onChange={(event) => updateLine(item, line.id, { vatAmount: numberOrNull(event.target.value) })}/></label>
                    <label>Account<select value={line.accountId || ''} disabled={busy || item.recordId} onChange={(event) => updateLine(item, line.id, { accountId: event.target.value })}><option value="">Choose account…</option>{accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</select><small>{line.suggestedAccountCode ? `Suggested ${line.suggestedAccountCode} · ${Math.round(line.classificationConfidence * 100)}%` : 'No account suggestion'}</small></label>
                  </>}
                </div>)}
              </details>
              <div className="admin-finance-draft-actions">
                <span className={isDuplicate ? 'admin-finance-warning' : item.status === 'posted' ? 'admin-finance-success' : item.message ? 'admin-finance-warning' : 'admin-muted'}>{item.message || (item.recordId ? `Saved as ${item.status}.` : `${financialLines.length} financial line(s) will be mapped.`)}</span>
                {item.recordId && POSTABLE_TYPES.has(item.documentType) && item.status !== 'posted' && <button className="admin-btn" disabled={busy || Boolean(postError)} title={postError} onClick={() => postDocument(item)}>Post to accounts</button>}
                {!item.recordId && <button className="admin-btn ghost" disabled={busy || isDuplicate || Boolean(item.error)} onClick={() => saveDocument(item, false).catch((saveError) => updateDraft(item.id, { status: 'failed', message: saveError.message }))}>Save reviewed record</button>}
                {!item.recordId && POSTABLE_TYPES.has(item.documentType) && <button className="admin-btn" disabled={busy || isDuplicate || Boolean(postError)} title={postError} onClick={() => postDocument(item)}>Post to accounts</button>}
                {item.recordId && <button type="button" className="admin-btn ghost" disabled={busy} onClick={() => setQueue((current) => current.filter((queued) => queued.id !== item.id))}>Remove from batch</button>}
              </div>
            </>}
          </article>;
        })}
      </div>}
    </section>

    <div className="admin-dashboard-grid admin-finance-report-grid">
      <section className="admin-card"><div className="card-head"><div><span className="eyebrow">LIVE GENERAL LEDGER</span><h2>Trial balance</h2></div><button className="admin-btn ghost" disabled={!balances.length} onClick={exportTrialBalance}><Download size={15}/> Export CSV</button></div>
        {!balances.length ? <p className="admin-muted">Posted transactions will appear here.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Code</th><th>Account</th><th>Group</th><th>Debit</th><th>Credit</th><th>Balance</th></tr></thead><tbody>{balances.map((account) => <tr key={account.account_id}><td>{account.code}</td><td>{account.name}</td><td>{account.report_group}</td><td>{formatMoney(account.debit_total)}</td><td>{formatMoney(account.credit_total)}</td><td>{formatMoney(account.balance)}</td></tr>)}</tbody></table></div>}
      </section>
      <section className="admin-card"><div className="card-head"><div><span className="eyebrow">REPORT EXTRACT</span><h2>Posted transactions</h2></div><button className="admin-btn ghost" disabled={busy} onClick={exportLedger}><Download size={15}/> Export ledger CSV</button></div><div className="admin-report-list"><div><span>Posted journals</span><b>{documents.filter((document) => document.status === 'posted').length}</b></div><div><span>Pending review</span><b>{documents.filter((document) => document.status === 'needs_review').length}</b></div><div><span>Unposted reviewed</span><b>{documents.filter((document) => document.status === 'reviewed').length}</b></div></div></section>
    </div>

    <section className="admin-card admin-finance-import-list"><div className="card-head"><div><span className="eyebrow">SOURCE DOCUMENTS</span><h2>Recent imports</h2></div><span className="admin-muted">Realtime updates enabled</span></div>
      {!documents.length ? <p className="admin-muted">No financial documents imported yet.</p> : <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>Document</th><th>Party</th><th>Type</th><th>Total</th><th>Status</th><th>Action</th></tr></thead><tbody>{documents.map((document) => <tr key={document.id}><td><strong>{document.document_number || document.source_file_name}</strong><small>{document.issue_date || 'No issue date'} · {document.source_file_name}</small></td><td>{document.party_name || 'Unassigned'}</td><td>{typeLabel(document.document_type)}</td><td>{formatMoney(document.total)}</td><td><span className={`status-pill ${document.status}`}>{document.status.replace('_',' ')}</span></td><td><div className="admin-row-actions"><button className="admin-btn ghost" onClick={() => openSource(document)}>Open file</button>{document.status === 'reviewed' && POSTABLE_TYPES.has(document.document_type) && <button className="admin-btn" disabled={busy} onClick={() => postReviewedDocument(document)}>Post to accounts</button>}</div></td></tr>)}</tbody></table></div>}
    </section>
  </div>;
}