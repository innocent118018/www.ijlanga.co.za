import React, { useEffect, useState } from 'react';
import { Download, FileText, RefreshCw, Upload } from 'lucide-react';
import { supabase } from './lib/supabase';
import './accounting-import-center.css';

const ACCEPTED_EXTENSIONS = new Set(['pdf','xlsx','xlsm','xltx','csv','xml','ubl','json','png','jpg','jpeg','tif','tiff','bmp','gif','webp']);
const money = (amount) => `R ${Number(amount || 0).toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const extensionOf = (name) => name.split('.').at(-1)?.toLowerCase() || '';
const mimeFor = (file) => file.type || ({ pdf: 'application/pdf', csv: 'text/csv', xml: 'application/xml', ubl: 'application/xml', json: 'application/json', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xlsm: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', xltx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }[extensionOf(file.name)] || 'application/octet-stream');

async function sha256(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function submitPayfast(fields, url) {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = url;
  form.style.display = 'none';
  Object.entries(fields || {}).forEach(([name, value]) => {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value ?? '');
    form.appendChild(input);
  });
  document.body.appendChild(form);
  form.submit();
}

function importStatusLabel(record) {
  if (record.payment_status === 'pending') return 'Awaiting payment';
  if (record.payment_status === 'failed' || record.payment_status === 'refunded') return 'Payment needs attention';
  if (record.status === 'queued' || record.status === 'processing') return 'Processing';
  if (record.status === 'review_required') return 'Under review';
  if (record.status === 'approved') return 'Approved';
  if (record.status === 'completed') return 'Complete';
  return record.status?.replaceAll('_', ' ') || 'Awaiting review';
}

export default function AccountingImportCenter({ customer, userId, isAdmin = false }) {
  const [imports, setImports] = useState([]);
  const [reports, setReports] = useState([]);
  const [provider, setProvider] = useState('payfast');
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [checkout, setCheckout] = useState(null);

  async function load() {
    if (!customer?.id) return;
    const [importsResult, reportsResult] = await Promise.all([
      supabase.from('accounting_imports').select('id,original_name,storage_path,mime_type,page_count,status,payment_status,payment_provider,amount_due,discount_percent,report_release_status,created_at').eq('customer_id', customer.id).order('created_at', { ascending: false }).limit(100),
      supabase.from('accounting_report_requests').select('id,import_id,report_type,format,status,output_path,created_at').eq('customer_id', customer.id).order('created_at', { ascending: false }).limit(100),
    ]);
    const queryError = importsResult.error || reportsResult.error;
    if (queryError) setError(queryError.message);
    else {
      setImports(importsResult.data || []);
      setReports(reportsResult.data || []);
    }
  }

  useEffect(() => { load(); }, [customer?.id]);

  function addFiles(fileList) {
    setError('');
    setNotice('');
    const additions = Array.from(fileList || []);
    const unsupported = additions.find((file) => !ACCEPTED_EXTENSIONS.has(extensionOf(file.name)));
    const tooLarge = additions.find((file) => file.size <= 0 || file.size > 50 * 1024 * 1024);
    if (unsupported) {
      setError(`${unsupported.name} is not a supported format.`);
      return;
    }
    if (tooLarge) {
      setError(`${tooLarge.name} must be 50 MB or smaller.`);
      return;
    }
    setFiles((current) => [...current, ...additions]);
  }

  async function saveAndStartCheckout(file) {
    const hash = await sha256(file);
    const extension = extensionOf(file.name) || 'bin';
    const storagePath = `${customer.id}/${hash}.${extension}`;
    const { error: uploadError } = await supabase.storage.from('accounting-imports').upload(storagePath, file, {
      contentType: mimeFor(file),
      upsert: false,
    });
    if (uploadError && !/already exists/i.test(uploadError.message)) throw uploadError;

    const { data: importRecord, error: insertError } = await supabase.from('accounting_imports').insert({
      customer_id: customer.id,
      created_by: userId,
      original_name: file.name,
      storage_path: storagePath,
      mime_type: mimeFor(file),
      file_size_bytes: file.size,
      source_sha256: hash,
    }).select('id').single();
    if (insertError) {
      if (/duplicate key|unique constraint/i.test(insertError.message)) throw new Error('This original file has already been submitted.');
      throw insertError;
    }

    const { data, error: paymentError } = await supabase.functions.invoke('create-accounting-import-payment', {
      body: { import_id: importRecord.id, provider },
    });
    if (paymentError) throw paymentError;
    if (data?.error) throw new Error(data.error.message || 'Could not start payment.');
    return data;
  }

  async function beginImports() {
    if (busy || !files.length) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setProgress(`Uploading ${index + 1} of ${files.length}: ${file.name}`);
        const result = await saveAndStartCheckout(file);
        setFiles((current) => current.filter((queued) => queued !== file));
        await load();
        if (result.exempt) {
          setNotice(`${file.name} is exempt from payment and queued for processing.`);
          continue;
        }
        setCheckout(result);
        if (result.provider === 'payfast') submitPayfast(result.fields, result.payment_url);
        else window.location.assign(result.payment_url);
        return;
      }
      setNotice('Original files stored privately. Administrator imports are exempt; customer imports begin processing after verified payment.');
    } catch (uploadError) {
      setError(uploadError.message || 'Could not prepare this import. The original file is retained when upload succeeded.');
      await load();
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function retryPayment(importRecord) {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const { data, error: paymentError } = await supabase.functions.invoke('create-accounting-import-payment', {
        body: { import_id: importRecord.id, provider: importRecord.payment_status === 'pending' ? importRecord.payment_provider : provider },
      });
      if (paymentError) throw paymentError;
      if (data?.error) throw new Error(data.error.message || 'Could not restart payment.');
      if (data.exempt) {
        setNotice('Administrator exemption recorded. The import is queued for processing.');
        await load();
        return;
      }
      setCheckout(data);
      if (data.provider === 'payfast') submitPayfast(data.fields, data.payment_url);
      else window.location.assign(data.payment_url);
    } catch (paymentError) {
      setError(paymentError.message || 'Could not retry this payment.');
    } finally {
      setBusy(false);
    }
  }

  async function requestReport(importRecord) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    const { error: requestError } = await supabase.from('accounting_report_requests').insert({
      customer_id: customer.id,
      requested_by: userId,
      import_id: importRecord.id,
      report_type: 'general_ledger',
      format: 'csv',
    });
    if (requestError) setError(requestError.message);
    else {
      setNotice('Your report request is stored in your profile and is under administrator verification. Return here to check its status; the verified copy will be emailed.');
      await load();
    }
    setBusy(false);
  }

  async function extractImport(importRecord) {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const { parseFinancialImportFile, suggestFinancialAccount } = await import('./lib/financial-import-parsers.js');
      setProgress(`Opening private source: ${importRecord.original_name}`);
      const { data: source, error: downloadError } = await supabase.storage.from('accounting-imports').download(importRecord.storage_path);
      if (downloadError || !source) throw downloadError || new Error('The original file is unavailable.');
      const file = new File([source], importRecord.original_name, { type: importRecord.mime_type || source.type });
      const parsed = await parseFinancialImportFile(file, {
        onProgress: ({ pageNumber, pageCount, stage }) => setProgress(`${stage === 'ocr-page' ? 'Reading scanned page' : 'Reading page'} ${pageNumber} of ${pageCount}`),
      });
      if (parsed.pageCount !== Number(importRecord.page_count)) {
        throw new Error(`The source contains ${parsed.pageCount} billable units, but the paid import is ${importRecord.page_count}. Contact support before processing.`);
      }

      const extension = extensionOf(importRecord.original_name);
      const pageLabels = parsed.pageLabels || [];
      const pageLines = Array.from({ length: parsed.pageCount }, () => []);
      for (const line of parsed.lines) {
        const pageNumber = ['xlsx','xlsm','xltx'].includes(extension)
          ? Math.max(1, pageLabels.indexOf(line.sourceData?.sheet) + 1)
          : Math.max(1, Number(line.sourceData?.page) || 1);
        if (pageNumber <= parsed.pageCount) pageLines[pageNumber - 1].push(line);
      }

      const documentType = parsed.suggestedType || 'unclassified';
      const salesDocument = documentType.startsWith('sales_');
      const creditNote = documentType.endsWith('credit_note');
      const accountsResult = await supabase.from('accounting_chart_accounts').select('id,code,account_type').eq('customer_id', customer.id).eq('is_active', true);
      if (accountsResult.error) throw accountsResult.error;
      const accountsByCode = new Map((accountsResult.data || []).map((account) => [account.code, account]));

      const pages = pageLines.map((lines, index) => ({
        page_number: index + 1,
        status: lines.length ? (parsed.warnings.some((warning) => /OCR/i.test(warning)) ? 'needs_review' : 'extracted') : 'failed',
        extracted_text: lines.map((line) => line.rawText).filter(Boolean).join('\n'),
        source_location: pageLabels[index] || `Page ${index + 1}`,
        confidence: null,
        extraction_data: { lines, warnings: parsed.warnings },
        extracted_values: { line_count: lines.length, financial_line_count: lines.filter((line) => line.isFinancialLine).length },
      }));

      const transactions = [];
      for (const [pageIndex, lines] of pageLines.entries()) {
        for (const line of lines.filter((entry) => entry.isFinancialLine)) {
          const suggestion = suggestFinancialAccount(line.description || line.rawText, documentType);
          const account = accountsByCode.get(suggestion.code);
          const amount = Number(line.netAmount ?? line.grossAmount ?? 0);
          const quoteOrOrder = /_(quote|order)$/.test(documentType);
          const debit = quoteOrOrder ? 0 : salesDocument ? (creditNote ? amount : 0) : (creditNote ? 0 : amount);
          const credit = quoteOrOrder ? 0 : salesDocument ? (creditNote ? 0 : amount) : (creditNote ? amount : 0);
          const rowNumber = transactions.length + 1;
          const duplicateSource = [customer.id, parsed.issueDate, line.description, debit, credit, parsed.documentNumber].join('|').toLowerCase();
          const duplicateBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(duplicateSource));
          const duplicateKey = Array.from(new Uint8Array(duplicateBytes)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
          transactions.push({
            page_number: pageIndex + 1,
            row_number: rowNumber,
            transaction_date: parsed.issueDate || null,
            description: line.description || line.rawText,
            reference: parsed.documentNumber || null,
            debit,
            credit,
            vat_amount: Number(line.vatAmount || 0),
            vat_code: line.vatRate === null ? null : `${line.vatRate}%`,
            account_id: account?.id || null,
            classification: documentType,
            confidence: Number(line.classificationConfidence || suggestion.confidence || 0),
            duplicate_key: duplicateKey,
            source_data: line,
          });
        }
      }

      const financialLines = parsed.lines.filter((line) => line.isFinancialLine);
      const subtotal = Number(parsed.subtotal ?? financialLines.reduce((sum, line) => sum + Number(line.netAmount ?? line.grossAmount ?? 0), 0));
      const vatAmount = Number(parsed.vatAmount ?? financialLines.reduce((sum, line) => sum + Number(line.vatAmount || 0), 0));
      const total = Number(parsed.total ?? subtotal + vatAmount);
      const controls = new Map([
        ['1000', 'Bank'], ['1100', 'Accounts Receivable'], ['1150', 'VAT Input'],
        ['2000', 'Accounts Payable'], ['2100', 'VAT Output'],
      ]);
      const addControlRow = (code, debit, credit) => {
        if (debit <= 0 && credit <= 0) return;
        const rowNumber = transactions.length + 1;
        transactions.push({
          page_number: 1,
          row_number: rowNumber,
          transaction_date: parsed.issueDate || null,
          description: controls.get(code),
          reference: parsed.documentNumber || null,
          debit,
          credit,
          vat_amount: 0,
          vat_code: null,
          account_id: accountsByCode.get(code)?.id || null,
          classification: documentType,
          confidence: 1,
          duplicate_key: `${importRecord.id}:${code}`,
          source_data: { synthetic_control: true, account_code: code },
        });
      };

      if (documentType === 'sales_invoice') {
        addControlRow('1100', total, 0);
        addControlRow('2100', 0, vatAmount);
      } else if (documentType === 'sales_credit_note') {
        addControlRow('1100', 0, total);
        addControlRow('2100', vatAmount, 0);
      } else if (documentType === 'purchase_invoice') {
        addControlRow('2000', 0, total);
        addControlRow('1150', vatAmount, 0);
      } else if (documentType === 'purchase_credit_note') {
        addControlRow('2000', total, 0);
        addControlRow('1150', 0, vatAmount);
      } else if (documentType === 'expense_receipt') {
        addControlRow('1000', 0, total);
        addControlRow('1150', vatAmount, 0);
      } else if (documentType === 'customer_receipt') {
        addControlRow('1000', total, 0);
        addControlRow('1100', 0, total);
      } else if (documentType === 'supplier_payment') {
        addControlRow('2000', total, 0);
        addControlRow('1000', 0, total);
      }

      for (let offset = 0; offset < pages.length; offset += 10) {
        const pageBatch = pages.slice(offset, offset + 10);
        const pageNumbers = new Set(pageBatch.map((page) => page.page_number));
        const transactionBatch = transactions.filter((transaction) => pageNumbers.has(transaction.page_number));
        const finalize = offset + pageBatch.length === pages.length;
        setProgress(`Saving pages ${offset + 1} to ${offset + pageBatch.length} of ${pages.length}`);
        const { data, error: saveError } = await supabase.functions.invoke('save-accounting-import-extraction', {
          body: {
            import_id: importRecord.id,
            pages: pageBatch,
            transactions: transactionBatch,
            finalize,
            document_metadata: finalize ? {
              document_type: documentType,
              document_number: parsed.documentNumber,
              party_name: '',
              issue_date: parsed.issueDate,
              due_date: parsed.dueDate,
              subtotal: parsed.subtotal,
              vat_amount: parsed.vatAmount,
              total: parsed.total,
            } : {},
          },
        });
        if (saveError) throw saveError;
        if (data?.error) throw new Error(data.error.message || 'Could not save extraction batch.');
      }

      setNotice(`${parsed.lines.length} source line(s) saved from ${parsed.pageCount} billable unit(s). All accounting rows are pending administrator review.`);
      await load();
    } catch (extractError) {
      setError(extractError.message || 'Extraction failed. The original file remains stored privately.');
      await load();
    } finally {
      setBusy(false);
      setProgress('');
    }
  }

  async function openReport(report) {
    if (!report.output_path) return;
    const { data, error: linkError } = await supabase.storage.from('accounting-reports').createSignedUrl(report.output_path, 300);
    if (linkError) setError(linkError.message);
    else if (data?.signedUrl) window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  const reportByImport = new Map(reports.map((report) => [report.import_id, report]));

  return <section className="portal-card portal-wide accounting-import-center">
    <div className="portal-card-head accounting-import-heading">
      <div><span className="portal-eyebrow">ACCOUNTING DOCUMENTS</span><h2>Live import centre</h2></div>
      <button type="button" className="accounting-refresh" onClick={load} disabled={busy} title="Refresh import status"><RefreshCw size={16}/></button>
    </div>
    <p className="portal-muted">Upload PDFs, images, spreadsheets, CSV, XML, UBL, or JSON. Originals remain private. {isAdmin ? 'Administrator imports are free and queued for review.' : 'Charges are calculated from the stored file: R10 per PDF page, image, CSV/XML/JSON file, or Excel worksheet.'}</p>
    <div className="accounting-dropzone" onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); addFiles(event.dataTransfer.files); }}>
      <Upload size={20}/>
      <strong>Drop files here or choose files</strong>
      <small>Up to 50 MB each; PDFs are capped at 1,000 pages.</small>
      <input type="file" multiple accept=".pdf,.xlsx,.xlsm,.xltx,.csv,.xml,.ubl,.json,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.gif,.webp" disabled={busy} onChange={(event) => { addFiles(event.target.files); event.target.value = ''; }}/>
    </div>
    <div className="accounting-import-controls">
      {!isAdmin && <label>Payment provider<select value={provider} disabled={busy} onChange={(event) => setProvider(event.target.value)}><option value="payfast">PayFast</option><option value="ikhokha">iKhokha</option></select></label>}
      <button type="button" className="portal-import-primary" onClick={beginImports} disabled={busy || !files.length}>{busy ? 'Preparing…' : `Upload ${files.length || ''} file${files.length === 1 ? '' : 's'} and continue`}</button>
    </div>
    {!!files.length && <div className="accounting-file-queue">{files.map((file, index) => <div key={`${file.name}-${file.lastModified}-${index}`}><FileText size={15}/><span>{file.name}</span><small>{(file.size / (1024 * 1024)).toFixed(1)} MB</small><button type="button" onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))} disabled={busy} aria-label={`Remove ${file.name}`}>Remove</button></div>)}</div>}
    {progress && <p className="portal-message" role="status">{progress}</p>}
    {error && <p className="portal-error" role="alert">{error}</p>}
    {notice && <p className="portal-message" role="status">{notice}</p>}
    {checkout && !busy && <p className="portal-muted">Secure checkout was prepared for {money(checkout.amount_due)} ({checkout.page_count} billable unit(s), {checkout.discount_percent}% discount).</p>}

    <div className="accounting-import-list">
      <h3>Imports and report status</h3>
      {!imports.length ? <p className="portal-muted">No accounting imports yet.</p> : imports.map((record) => {
        const report = reportByImport.get(record.id);
        const canRequest = !isAdmin && ['verified', 'exempt'].includes(record.payment_status)
          && ['approved', 'completed'].includes(record.status)
          && (!report || ['rejected', 'failed'].includes(report.status));
        const canExtract = ['verified', 'exempt'].includes(record.payment_status)
          && ['queued', 'processing', 'failed'].includes(record.status);
        const canRetryPayment = ['failed', 'pending'].includes(record.payment_status);
        return <article className="accounting-import-row" key={record.id}>
          <div><strong>{record.original_name}</strong><small>{record.page_count || 'Counting units'} unit(s) · {money(record.amount_due)} · {new Date(record.created_at).toLocaleDateString('en-ZA')}</small></div>
          <span className={`accounting-state ${record.payment_status === 'verified' || record.payment_status === 'exempt' ? 'success' : ''}`}>{importStatusLabel(record)}</span>
          {canRetryPayment
            ? <button type="button" onClick={() => retryPayment(record)} disabled={busy}>{record.payment_status === 'pending' ? 'Resume payment' : 'Retry payment'}</button>
            : canExtract
            ? <button type="button" onClick={() => extractImport(record)} disabled={busy}>Read &amp; queue review</button>
            : canRequest
            ? <button type="button" onClick={() => requestReport(record)} disabled={busy}>Request report</button>
            : report?.status === 'released' && report.output_path
              ? <button type="button" onClick={() => openReport(report)}><Download size={14}/> Download report</button>
              : <small>{report ? `Report ${report.status.replaceAll('_', ' ')}` : record.report_release_status?.replaceAll('_', ' ')}</small>}
        </article>;
      })}
    </div>
  </section>;
}