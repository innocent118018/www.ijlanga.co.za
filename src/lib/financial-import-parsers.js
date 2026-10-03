import Papa from 'papaparse';
import { calculateAccountingImportCharge } from '../../supabase/functions/_shared/accounting-import-billing.js';

const emptyLine = (lineNumber, sourceLocation, rawText, sourceData = {}) => ({
  lineNumber,
  sourceLocation,
  rawText,
  description: rawText,
  quantity: null,
  unitPrice: null,
  netAmount: null,
  vatRate: null,
  vatAmount: null,
  grossAmount: null,
  isFinancialLine: false,
  accountCodeSuggestion: '',
  sourceData,
});

const normalize = (value) => String(value ?? '').normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const summaryPattern = /\b(subtotal|sub total|vat|tax amount|total|rounding|balance due|amount paid|receipt|credit note|payment instructions|banking details|invoice date|issue date|due date|invoice number|quote number|order number|reference|swift|account no)\b/i;

export const SUPPORTED_IMPORT_EXTENSIONS = ['pdf', 'csv', 'xlsx', 'xlsm', 'xltx', 'xml', 'ubl', 'json', 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp', 'gif', 'webp'];
export const MAX_IMPORT_PAGES = 1000;

export function assertImportPageLimit(pageCount) {
  if (Number(pageCount) > MAX_IMPORT_PAGES) {
    throw new Error(`PDF exceeds the ${MAX_IMPORT_PAGES.toLocaleString()} page import limit.`);
  }
}

export function calculateImportFee(pageCount, options = {}) {
  const { isAdmin = false } = options;
  if (isAdmin) return 0;
  const pages = Math.max(0, Number(pageCount) || 0);
  if (!pages) return 0;
  return calculateAccountingImportCharge(pages).amount;
}

export function requiresPaymentGate(pageCount, options = {}) {
  const { isAdmin = false } = options;
  if (isAdmin) return false;
  return Math.max(0, Number(pageCount) || 0) > 100;
}

export function parseFinancialAmount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const text = String(value ?? '').trim();
  if (!text) return null;
  const negative = /^\s*\(.*\)\s*$/.test(text) || /^\s*-/.test(text);
  const numeric = text.replace(/[R\s(),]/gi, '').replace(/[^\d.]/g, '');
  if (!numeric || !/\d/.test(numeric)) return null;
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? (negative ? -parsed : parsed) : null;
}

function isSummaryText(value) {
  const text = String(value || '');
  const compact = normalize(text).replace(/\s/g, '');
  return summaryPattern.test(text) || /(?:^|\/)(?:issue|invoice|due|subtotal|tax|vat|grandtotal|balance|swift|accountno)(?:date|number|amount|total|due)?$/i.test(compact);
}

export function suggestFinancialAccount(description, documentType) {
  const text = normalize(description);
  if (documentType.startsWith('sales_')) {
    if (/consult|account|tax|compliance|service|filing|submission|advisory/.test(text)) return { code: '4050', confidence: 0.82 };
    return { code: '4000', confidence: 0.62 };
  }
  if (/vehicle purchase|purchase of motor vehicle|motor vehicle acquisition/.test(text)) return { code: '1500', confidence: 0.88 };
  if (/petrol|fuel|diesel|vehicle|motor|toll|parking/.test(text)) return { code: '6100', confidence: 0.86 };
  if (/travel|accommodation|taxi|flight/.test(text)) return { code: '6200', confidence: 0.82 };
  if (/stationery|office|printing|postage/.test(text)) return { code: '6300', confidence: 0.8 };
  if (/professional|legal|accounting|consulting/.test(text)) return { code: '6400', confidence: 0.8 };
  if (/bank charge|bank fee/.test(text)) return { code: '6500', confidence: 0.86 };
  if (/software|subscription|hosting|licence/.test(text)) return { code: '6600', confidence: 0.82 };
  if (/telephone|internet|data bundle/.test(text)) return { code: '6700', confidence: 0.82 };
  if (/repair|maintenance|service fee/.test(text)) return { code: '6800', confidence: 0.72 };
  return { code: '', confidence: 0 };
}

function findHeaderIndex(headers, aliases) {
  const normalizedHeaders = headers.map(normalize);
  return normalizedHeaders.findIndex((header) => aliases.some((alias) => header === alias || header.includes(alias)));
}

function lineFromStructuredRow(values, headers, lineNumber, sourceLocation, sourceData, isHeader = false) {
  const rawText = values.map((value) => String(value ?? '').trim()).filter(Boolean).join(' | ');
  const line = emptyLine(lineNumber, sourceLocation, rawText, sourceData);
  if (!rawText || isHeader) return line;

  if (!headers.length) {
    const numericValues = values.map(parseFinancialAmount).filter((value) => value !== null);
    const description = values.map((value) => String(value ?? '').trim()).find((value) => value && parseFinancialAmount(value) === null) || rawText;
    if (!numericValues.length || isSummaryText(description)) return { ...line, description };
    const grossAmount = numericValues.at(-1);
    return {
      ...line,
      description,
      unitPrice: numericValues.length > 1 ? numericValues.at(-2) : null,
      netAmount: grossAmount,
      grossAmount,
      isFinancialLine: true,
    };
  }

  const descriptionIndex = findHeaderIndex(headers, ['description', 'account', 'item', 'product', 'details', 'service', 'particulars']);
  const quantityIndex = findHeaderIndex(headers, ['quantity', 'qty', 'units']);
  const unitPriceIndex = findHeaderIndex(headers, ['unit price', 'rate', 'price per unit']);
  const netIndex = findHeaderIndex(headers, ['amount excl', 'net amount', 'subtotal', 'amount', 'price']);
  const vatIndex = findHeaderIndex(headers, ['vat amount', 'tax amount', 'vat']);
  const totalIndex = findHeaderIndex(headers, ['gross amount', 'line total', 'total incl', 'total']);
  const description = descriptionIndex >= 0 ? String(values[descriptionIndex] ?? '').trim() : rawText;
  const quantity = quantityIndex >= 0 ? parseFinancialAmount(values[quantityIndex]) : null;
  const unitPrice = unitPriceIndex >= 0 ? parseFinancialAmount(values[unitPriceIndex]) : null;
  const netAmount = netIndex >= 0 ? parseFinancialAmount(values[netIndex]) : null;
  const vatAmount = vatIndex >= 0 && vatIndex !== totalIndex ? parseFinancialAmount(values[vatIndex]) : null;
  const grossAmount = totalIndex >= 0 ? parseFinancialAmount(values[totalIndex]) : netAmount;
  const hasAmount = [unitPrice, netAmount, vatAmount, grossAmount].some((amount) => amount !== null);

  return {
    ...line,
    description: description || rawText,
    quantity,
    unitPrice,
    netAmount,
    vatAmount,
    grossAmount,
    isFinancialLine: hasAmount && !isSummaryText(description),
  };
}

export function parseCsvText(text) {
  const result = Papa.parse(text, { skipEmptyLines: false, dynamicTyping: false });
  const rows = result.data.filter((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim()));
  if (!rows.length) return { lines: [], pageCount: 1, warnings: ['No non-empty CSV rows were found.'] };

  const headers = rows[0].map((value) => String(value ?? '').trim());
  const hasHeaders = headers.some((value) => /description|account|item|product|quantity|qty|unit price|amount|total/i.test(value));
  const lines = rows.map((row, index) => lineFromStructuredRow(
    row.map((value) => String(value ?? '')),
    hasHeaders ? headers : [],
    index + 1,
    `Row ${index + 1}`,
    { cells: row },
    hasHeaders && index === 0,
  ));

  return { lines, pageCount: 1, warnings: result.errors.map((error) => `CSV row ${error.row + 1}: ${error.message}`) };
}

function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    if (value.text) return String(value.text);
    if (Array.isArray(value.richText)) return value.richText.map((entry) => entry.text || '').join('');
    if (value.result !== undefined) return cellText(value.result);
    return JSON.stringify(value);
  }
  return String(value);
}

export async function parseWorkbook(file) {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await file.arrayBuffer());
  const lines = [];

  for (const worksheet of workbook.worksheets) {
    if (!worksheet.rowCount) continue;
    const headerValues = worksheet.getRow(1).values.slice(1).map(cellText);
    const hasHeaders = headerValues.some((value) => /description|account|item|product|quantity|qty|unit price|amount|total/i.test(value));
    for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
      const values = worksheet.getRow(rowNumber).values.slice(1).map(cellText);
      if (!values.some((value) => value.trim())) continue;
      lines.push(lineFromStructuredRow(
        values,
        hasHeaders ? headerValues : [],
        lines.length + 1,
        `${worksheet.name} row ${rowNumber}`,
        { sheet: worksheet.name, row: rowNumber, cells: values },
        hasHeaders && rowNumber === 1,
      ));
    }
  }

  return {
    lines,
    pageCount: workbook.worksheets.length || 1,
    pageLabels: workbook.worksheets.map((worksheet) => worksheet.name),
    warnings: lines.length ? [] : ['No non-empty worksheet rows were found.'],
  };
}

function xmlLeafLines(node, path, lines) {
  if (Array.isArray(node)) {
    node.forEach((child, index) => xmlLeafLines(child, `${path}[${index + 1}]`, lines));
    return;
  }
  if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      if (key.startsWith('@_')) {
        lines.push({ path: `${path}/${key.slice(2)}`, value: String(value) });
      } else {
        xmlLeafLines(value, path ? `${path}/${key}` : key, lines);
      }
    }
    return;
  }
  if (node !== null && node !== undefined && String(node).trim()) lines.push({ path, value: String(node) });
}

export async function parseXmlText(text) {
  const { XMLParser } = await import('fast-xml-parser');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    parseTagValue: false,
    parseAttributeValue: false,
  });
  const parsed = parser.parse(text);
  const leaves = [];
  xmlLeafLines(parsed, '', leaves);
  const lines = leaves.map((entry, index) => {
    const rawText = `${entry.path}: ${entry.value}`;
    const line = emptyLine(index + 1, entry.path, rawText, { path: entry.path, value: entry.value });
    const amount = parseFinancialAmount(entry.value);
    const isAmountField = /amount|price|total|debit|credit|value/i.test(entry.path);
    const isDetailPath = /invoice.?line|line.?item|transaction|entry|detail|item|record|row/i.test(entry.path);
    return amount === null || isSummaryText(entry.path) || !isAmountField || !isDetailPath
      ? line
      : { ...line, description: entry.path, netAmount: amount, grossAmount: amount, isFinancialLine: true };
  });
  return { lines, pageCount: 1, warnings: lines.length ? [] : ['No XML text or attribute values were found.'] };
}

export function parseJsonText(text) {
  const parsed = JSON.parse(text);
  const leaves = [];
  const visit = (value, path) => {
    if (Array.isArray(value)) {
      value.forEach((entry, index) => visit(entry, `${path}[${index + 1}]`));
    } else if (value && typeof value === 'object') {
      Object.entries(value).forEach(([key, entry]) => visit(entry, path ? `${path}/${key}` : key));
    } else if (value !== null && value !== undefined && String(value).trim()) {
      leaves.push({ path, value: String(value) });
    }
  };
  visit(parsed, '');

  const lines = leaves.map((entry, index) => {
    const rawText = `${entry.path}: ${entry.value}`;
    const line = emptyLine(index + 1, entry.path, rawText, { path: entry.path, value: entry.value });
    const amount = parseFinancialAmount(entry.value);
    const isAmountField = /amount|price|total|debit|credit|value/i.test(entry.path);
    const isDetailPath = /invoice.?line|line.?item|transaction|entry|detail|item|record|row/i.test(entry.path);
    return amount === null || isSummaryText(entry.path) || !isAmountField || !isDetailPath
      ? line
      : { ...line, description: entry.path, netAmount: amount, grossAmount: amount, isFinancialLine: true };
  });
  return { lines, pageCount: 1, warnings: lines.length ? [] : ['No JSON values were found.'] };
}

export function extractPdfLineAmounts(rawText) {
  const matches = [...rawText.matchAll(/(?:R\s*)?\(?-?\d[\d,]*(?:\.\d{1,2})\)?/g)];
  const money = matches.filter((match) => /\.\d{1,2}\)?$/.test(match[0]));
  if (!money.length) return null;
  const first = money[0];
  const before = rawText.slice(0, first.index).trim();
  const quantityMatch = before.match(/(?:^|\s)(\d+(?:\.\d+)?)\s*$/);
  const quantity = quantityMatch ? parseFinancialAmount(quantityMatch[1]) : null;
  const description = quantityMatch ? before.slice(0, quantityMatch.index).trim() : before;
  const values = money.map((match) => parseFinancialAmount(match[0]));
  const grossAmount = values.at(-1);
  const unitPrice = values[0] ?? null;
  const netAmount = values.length >= 3
    ? values[1]
    : quantity !== null && unitPrice !== null
      ? Math.round(quantity * unitPrice * 100) / 100
      : grossAmount;
  const vatAmount = values.length >= 4 ? values.at(-2) : null;
  return { description: description || rawText, quantity, unitPrice, netAmount, vatAmount, grossAmount };
}

function pdfLineFromGroup(group, lineNumber, pageNumber) {
  const sorted = group.sort((left, right) => left.x - right.x);
  let text = '';
  let rightEdge = null;
  for (const item of sorted) {
    const gap = rightEdge === null ? 0 : item.x - rightEdge;
    if (text && gap > 5 && !text.endsWith(' ')) text += ' ';
    text += item.text;
    rightEdge = item.x + item.width;
  }
  const rawText = text.replace(/\s+/g, ' ').trim();
  const line = emptyLine(lineNumber, `Page ${pageNumber}`, rawText, { page: pageNumber, y: sorted[0]?.y ?? null });
  const amounts = extractPdfLineAmounts(rawText);
  if (!amounts || isSummaryText(rawText)) return line;
  return { ...line, ...amounts, isFinancialLine: amounts.grossAmount !== null };
}

export async function parseImageFile(file, options = {}) {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, {
    logger: (message) => options.onProgress?.({ ...message, stage: 'ocr', pageNumber: 1, pageCount: 1 }),
  });

  try {
    const recognition = await worker.recognize(file);
    const lines = (recognition.data.lines || []).map((recognized, index) => {
      const rawText = String(recognized.text || '').replace(/\s+/g, ' ').trim();
      if (!rawText) return null;
      const line = emptyLine(index + 1, 'Image OCR', rawText, { page: 1, ocrConfidence: Number(recognized.confidence || 0), ocrBoundingBox: recognized.bbox || null });
      const amounts = extractPdfLineAmounts(rawText);
      return amounts && !isSummaryText(rawText)
        ? { ...line, ...amounts, sourceData: line.sourceData, isFinancialLine: amounts.grossAmount !== null }
        : line;
    }).filter(Boolean);

    return {
      lines,
      pageCount: 1,
      warnings: !lines.length ? ['No text could be read from the image. Upload a sharper or higher-contrast scan before posting.'] : [],
    };
  } finally {
    await worker.terminate();
  }
}

export async function parsePdf(file, options = {}) {
  const pdfjsLib = await import('pdfjs-dist/build/pdf.mjs');
  const pdfWorkerUrl = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl.default;
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  const pageCount = pdf.numPages;
  try {
    assertImportPageLimit(pageCount);
  } catch (error) {
    await pdf.destroy();
    throw error;
  }
  const lines = [];
  const warnings = [];
  let ocrWorker = null;

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const groups = [];

      for (const item of content.items) {
        const itemText = String(item.str || '');
        if (!itemText.trim()) continue;
        const x = Number(item.transform?.[4] || 0);
        const y = Number(item.transform?.[5] || 0);
        const group = groups.find((candidate) => Math.abs(candidate.y - y) < 2.5);
        if (group) group.items.push({ x, y, width: Number(item.width || 0), text: itemText });
        else groups.push({ y, items: [{ x, y, width: Number(item.width || 0), text: itemText }] });
      }

      groups.sort((left, right) => right.y - left.y);
      if (groups.length) {
        groups.forEach((group) => lines.push(pdfLineFromGroup(group.items, lines.length + 1, pageNumber)));
        options.onProgress?.({ stage: 'text', pageNumber, pageCount: pdf.numPages });
        continue;
      }

      if (!ocrWorker) {
        const { createWorker } = await import('tesseract.js');
        ocrWorker = await createWorker('eng', 1, { logger: (message) => options.onProgress?.({ ...message, stage: 'ocr', pageNumber, pageCount: pdf.numPages }) });
      }

      const viewport = page.getViewport({ scale: 2 });
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error(`Could not prepare page ${pageNumber} for OCR.`);
      await page.render({ canvasContext: context, viewport }).promise;
      options.onProgress?.({ stage: 'ocr-page', pageNumber, pageCount: pdf.numPages });
      const recognition = await ocrWorker.recognize(canvas);
      const recognizedLines = recognition.data.lines || [];
      for (const recognized of recognizedLines) {
        const rawText = String(recognized.text || '').replace(/\s+/g, ' ').trim();
        if (!rawText) continue;
        const line = emptyLine(lines.length + 1, `Page ${pageNumber} (OCR)`, rawText, {
          page: pageNumber,
          ocrConfidence: Number(recognized.confidence || 0),
          ocrBoundingBox: recognized.bbox || null,
        });
        const amounts = extractPdfLineAmounts(rawText);
        lines.push(amounts && !isSummaryText(rawText)
          ? { ...line, ...amounts, sourceData: line.sourceData, isFinancialLine: amounts.grossAmount !== null }
          : line);
      }
      canvas.width = 0;
      canvas.height = 0;
    }
  } finally {
    await ocrWorker?.terminate();
    await pdf.destroy();
  }

  if (!lines.length) warnings.push('No selectable or OCR-readable PDF text was found. Enter missing rows manually before posting.');
  if (lines.some((line) => line.sourceLocation.includes('(OCR)'))) warnings.push('Scanned PDF pages were read with browser-local OCR. Verify OCR text, amounts, and account coding before saving or posting.');
  return { lines, pageCount, warnings };
}

function dateFromText(text, labels) {
  const labelPattern = labels.join('|');
  const match = String(text).match(new RegExp(`(?:^|[\\r\\n])\\s*(?:${labelPattern})[\\t ]*[:#]?[\\t ]*(\\d{4}-\\d{2}-\\d{2}|\\d{2}[-/]\\d{2}[-/]\\d{4})`, 'i'));
  if (!match) return '';
  const value = match[1];
  if (/^\d{4}-/.test(value)) return value;
  const [day, month, year] = value.split(/[-/]/);
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function amountAfterLabel(text, labels) {
  const labelPattern = labels.join('|');
  const match = String(text).match(new RegExp(`(?:^|[\\r\\n])\\s*(?:${labelPattern})[\\t ]*[:]?\\s*(?:R[\\t ]*)?(-?[\\d,]+\\.\\d{2})`, 'i'));
  return match ? parseFinancialAmount(match[1]) : null;
}

export function guessFinancialDocumentType(filename, text) {
  const content = `${filename}\n${text}`.toLowerCase();
  const issuedByIjLanga = /ij\s*langa\s*consulting\s*\(pty\)\s*ltd\s+and\s+customer|invoice\s+issued\s+by\s+ij\s*langa|seller\s*:\s*ij\s*langa/i.test(content);
  if (/sales\s+order/.test(content)) return 'sales_order';
  if (/purchase\s+order/.test(content)) return 'purchase_order';
  if (/credit\s+note/.test(content)) return issuedByIjLanga ? 'sales_credit_note' : 'credit_note_unclassified';
  if (/\bquote\b|quotation/.test(content)) return issuedByIjLanga ? 'sales_quote' : 'quote_unclassified';
  if (/supplier\s+payment/.test(content)) return 'supplier_payment';
  if (/customer\s+receipt|receipt\s+voucher/.test(content)) return 'customer_receipt';
  if (/\binvoice\b/.test(content)) return issuedByIjLanga ? 'sales_invoice' : 'invoice_unclassified';
  return 'unclassified';
}

export async function parseFinancialImportFile(file, options = {}) {
  const extension = file.name.split('.').at(-1)?.toLowerCase() || '';
  let parsed;
  if (extension === 'pdf') parsed = await parsePdf(file, options);
  else if (extension === 'csv') parsed = parseCsvText(await file.text());
  else if (['xlsx', 'xlsm', 'xltx'].includes(extension)) parsed = await parseWorkbook(file);
  else if (['xml', 'ubl'].includes(extension)) parsed = await parseXmlText(await file.text());
  else if (extension === 'json') parsed = parseJsonText(await file.text());
  else if (['png', 'jpg', 'jpeg', 'tif', 'tiff', 'bmp', 'gif', 'webp'].includes(extension)) parsed = await parseImageFile(file, options);
  else throw new Error(`Unsupported file type: .${extension || 'unknown'}`);

  const extractedText = parsed.lines.map((line) => line.rawText).join('\n');
  const documentNumberMatch = extractedText.match(/(?:invoice|quote|order|reference)\s*(?:number|no\.?|#)?\s*[:#]?\s*([a-z0-9][a-z0-9/-]{4,})/i);
  const subtotal = amountAfterLabel(extractedText, ['sub-?total', 'subtotal']);
  const vatAmount = amountAfterLabel(extractedText, ['vat(?:\\s+15%)?', 'tax amount']);
  const total = amountAfterLabel(extractedText, ['grand total', 'total']);

  return {
    format: extension,
    pageCount: parsed.pageCount || 1,
    pageLabels: parsed.pageLabels || [],
    lines: parsed.lines,
    warnings: parsed.warnings,
    extractedText,
    suggestedType: guessFinancialDocumentType(file.name, extractedText),
    documentNumber: documentNumberMatch?.[1] || '',
    issueDate: dateFromText(extractedText, ['invoice date', 'issue date', 'date issued']),
    dueDate: dateFromText(extractedText, ['due date', 'payment due']),
    subtotal,
    vatAmount,
    roundingAmount: amountAfterLabel(extractedText, ['rounding']) ?? 0,
    total,
  };
}