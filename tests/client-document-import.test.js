import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashFromClientDocumentPath,
  inferClientDocumentType,
  matchCustomerFromFilename,
} from '../src/lib/client-document-import.js';

const customers = [
  { id: 'techlogix', company_name: 'TECHLOGIX', contact_name: 'Banzi Zulu', email: 'banzizulu@example.com' },
  { id: 'madidi', company_name: 'Madidi Property Management', contact_name: 'Margaret Sikhweni', email: '88msequence@gmail.com' },
];

test('matches a customer by company name in the filename', () => {
  assert.equal(matchCustomerFromFilename('Invoice 2020752789 — TECHLOGIX.pdf', customers)?.customer.id, 'techlogix');
});

test('matches a customer by email in the filename', () => {
  assert.equal(matchCustomerFromFilename('88msequence@gmail.com.pdf', customers)?.customer.id, 'madidi');
});

test('leaves unmatched and ambiguous filenames for manual assignment', () => {
  assert.equal(matchCustomerFromFilename('Invoice 1234567890.pdf', customers), null);
  assert.equal(matchCustomerFromFilename('Margaret Sikhweni.pdf', [
    customers[1],
    { ...customers[1], id: 'another-margaret' },
  ]), null);
});

test('infers document types without confusing tax invoices with invoices', () => {
  assert.equal(inferClientDocumentType('Tax Invoice 2020752904.pdf'), 'tax_invoice');
  assert.equal(inferClientDocumentType('Sales Order 317.pdf'), 'sales_order');
  assert.equal(inferClientDocumentType('Quote 100029042056.pdf'), 'quote');
  assert.equal(inferClientDocumentType('Invoice 2020752789.pdf'), 'invoice');
});

test('extracts a stored hash only from the deterministic PDF path format', () => {
  const hash = 'a'.repeat(64);
  assert.equal(hashFromClientDocumentPath(`customer-id/${hash}.pdf`), hash);
  assert.equal(hashFromClientDocumentPath('customer-id/legacy-random-file.pdf'), '');
});