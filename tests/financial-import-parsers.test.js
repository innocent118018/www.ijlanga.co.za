import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAccountingImportCharge } from '../supabase/functions/_shared/accounting-import-billing.js';
import {
  calculateImportFee,
  assertImportPageLimit,
  extractPdfLineAmounts,
  guessFinancialDocumentType,
  MAX_IMPORT_PAGES,
  parseCsvText,
  parseJsonText,
  parseFinancialAmount,
  parseWorkbook,
  parseXmlText,
  requiresPaymentGate,
  suggestFinancialAccount,
} from '../src/lib/financial-import-parsers.js';

test('PDF page limit accepts 1000 pages and rejects larger documents', () => {
  assert.equal(MAX_IMPORT_PAGES, 1000);
  assert.doesNotThrow(() => assertImportPageLimit(1000));
  assert.throws(() => assertImportPageLimit(1001), /page import limit/);
});

test('CSV parser preserves header and every populated data row', () => {
  const parsed = parseCsvText('Description,Qty,Unit price,Total\nMotor vehicle fuel,1,250.00,250.00\nOffice supplies,2,50.00,100.00');
  assert.equal(parsed.pageCount, 1);
  assert.equal(parsed.lines.length, 3);
  assert.equal(parsed.lines[0].isFinancialLine, false);
  assert.equal(parsed.lines[1].description, 'Motor vehicle fuel');
  assert.equal(parsed.lines[1].grossAmount, 250);
  assert.equal(parsed.lines[2].quantity, 2);
});

test('XML parser preserves nested values and attributes as source lines', async () => {
  const parsed = await parseXmlText('<Invoice id="A-1"><InvoiceLine><Description>Fuel</Description><LineExtensionAmount>125.50</LineExtensionAmount></InvoiceLine></Invoice>');
  assert.equal(parsed.lines.some((line) => line.rawText.includes('Description: Fuel')), true);
  assert.equal(parsed.lines.some((line) => line.rawText.includes('LineExtensionAmount: 125.50') && line.isFinancialLine), true);
  assert.equal(parsed.lines.some((line) => line.rawText.includes('id: A-1')), true);
});

test('Excel billing units equal the number of worksheets', async () => {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.addWorksheet('Expenses').addRow(['Description', 'Amount']);
  workbook.addWorksheet('Sales').addRow(['Description', 'Amount']);
  const parsed = await parseWorkbook(new Blob([await workbook.xlsx.writeBuffer()]));
  assert.equal(parsed.pageCount, 2);
});

test('JSON parser preserves nested values and source paths', () => {
  const parsed = parseJsonText('{"transactions":[{"description":"Fuel","amount":125.50}]}');
  assert.equal(parsed.pageCount, 1);
  assert.equal(parsed.lines.some((line) => line.rawText === 'transactions[1]/description: Fuel'), true);
  assert.equal(parsed.lines.some((line) => /^transactions\[1\]\/amount: 125\.5(?:0)?$/.test(line.rawText) && line.isFinancialLine), true);
});

test('South African amount strings parse with grouping, currency, and negatives', () => {
  assert.equal(parseFinancialAmount('R 14,501.13'), 14501.13);
  assert.equal(parseFinancialAmount('(1,300.00)'), -1300);
  assert.equal(parseFinancialAmount('not an amount'), null);
});

test('PDF line extraction separates unit, net, VAT, and gross columns', () => {
  const parsed = extractPdfLineAmounts('Tax clearance certificate 1 590.00 590.00 Vat 88.50 678.50');
  assert.equal(parsed.quantity, 1);
  assert.equal(parsed.unitPrice, 590);
  assert.equal(parsed.netAmount, 590);
  assert.equal(parsed.vatAmount, 88.5);
  assert.equal(parsed.grossAmount, 678.5);
  const quantityLine = extractPdfLineAmounts('Fuel 2 150.00 300.00');
  assert.equal(quantityLine.netAmount, 300);
});

test('document type suggestion distinguishes sales documents and ambiguous invoices', () => {
  assert.equal(guessFinancialDocumentType('Invoice 123.pdf', 'IJ Langa Consulting (Pty) Ltd and Customer Example Ltd'), 'sales_invoice');
  assert.equal(guessFinancialDocumentType('Supplier Invoice.pdf', 'Invoice to IJ Langa Consulting (Pty) Ltd'), 'invoice_unclassified');
  assert.equal(guessFinancialDocumentType('Invoice from Supplier.pdf', 'Supplier invoice'), 'invoice_unclassified');
  assert.equal(guessFinancialDocumentType('Quote 456.pdf', 'IJ Langa Consulting (Pty) Ltd and Customer Example Ltd'), 'sales_quote');
  assert.equal(guessFinancialDocumentType('Quote 456.pdf', 'Vendor quotation'), 'quote_unclassified');
});

test('account suggestions distinguish motor vehicle assets from running expenses', () => {
  assert.equal(suggestFinancialAccount('Petrol and tolls', 'purchase_invoice').code, '6100');
  assert.equal(suggestFinancialAccount('Purchase of motor vehicle', 'purchase_invoice').code, '1500');
  assert.equal(suggestFinancialAccount('Tax compliance service', 'sales_invoice').code, '4050');
  assert.equal(suggestFinancialAccount('Unclear line', 'purchase_invoice').code, '');
});

test('pricing rules charge per page with discount caps and admin exemptions', () => {
  assert.equal(calculateImportFee(10), 100);
  assert.equal(calculateImportFee(21), Number((210 * 0.98).toFixed(2)));
  assert.equal(calculateImportFee(31), Number((310 * 0.97).toFixed(2)));
  assert.equal(calculateImportFee(300), Number((3000 * 0.85).toFixed(2)));
  assert.equal(calculateImportFee(300, { isAdmin: true }), 0);
  assert.equal(requiresPaymentGate(101), true);
  assert.equal(requiresPaymentGate(50), false);
});

test('shared server/client charge calculation follows exact discount thresholds', () => {
  assert.deepEqual(calculateAccountingImportCharge(20), { pageCount: 20, discountPercent: 0, amount: 200 });
  assert.deepEqual(calculateAccountingImportCharge(21), { pageCount: 21, discountPercent: 2, amount: 205.8 });
  assert.deepEqual(calculateAccountingImportCharge(31), { pageCount: 31, discountPercent: 3, amount: 300.7 });
  assert.deepEqual(calculateAccountingImportCharge(100), { pageCount: 100, discountPercent: 3, amount: 970 });
  assert.deepEqual(calculateAccountingImportCharge(101), { pageCount: 101, discountPercent: 15, amount: 858.5 });
  assert.deepEqual(calculateAccountingImportCharge(1000), { pageCount: 1000, discountPercent: 15, amount: 8500 });
  assert.throws(() => calculateAccountingImportCharge(1001), /between 1 and 1000/);
});