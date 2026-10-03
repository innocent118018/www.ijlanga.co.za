export const MAX_CLIENT_DOCUMENT_SIZE = 10 * 1024 * 1024;

const normalize = (value) => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

export function matchCustomerFromFilename(filename, customers) {
  const normalizedFilename = normalize(filename);
  const compactFilename = normalizedFilename.replace(/\s/g, '');
  const matches = [];

  for (const customer of customers) {
    let score = 0;
    let matchedBy = '';
    const email = String(customer.email || '').toLowerCase();
    const compactEmail = normalize(email).replace(/\s/g, '');

    if (compactEmail.length >= 6 && compactFilename.includes(compactEmail)) {
      score = 10000 + compactEmail.length;
      matchedBy = 'email';
    }

    for (const [field, label] of [[customer.company_name, 'company name'], [customer.contact_name, 'contact name']]) {
      const value = normalize(field);
      if (value.length >= 4 && ` ${normalizedFilename} `.includes(` ${value} `) && value.length > score) {
        score = value.length;
        matchedBy = label;
      }
    }

    if (score) matches.push({ customer, score, matchedBy });
  }

  matches.sort((left, right) => right.score - left.score);
  if (!matches.length || (matches[1] && matches[0].score === matches[1].score)) return null;
  return { customer: matches[0].customer, matchedBy: matches[0].matchedBy };
}

export function inferClientDocumentType(filename) {
  const name = String(filename || '').toLowerCase();
  if (name.includes('tax invoice')) return 'tax_invoice';
  if (name.includes('sales order')) return 'sales_order';
  if (name.includes('invoice')) return 'invoice';
  if (name.includes('quote')) return 'quote';
  return 'document';
}

export async function sha256Blob(blob) {
  if (!globalThis.crypto?.subtle) throw new Error('Secure PDF duplicate checking is not available in this browser.');
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function hashFromClientDocumentPath(storagePath) {
  return String(storagePath || '').match(/\/([a-f0-9]{64})\.pdf$/i)?.[1]?.toLowerCase() || '';
}

export async function hashStoredClientDocuments(supabase, documents) {
  const hashes = [];
  const unreadable = [];

  for (const document of documents) {
    const knownHash = hashFromClientDocumentPath(document.storage_path);
    if (knownHash) {
      hashes.push({ customerId: document.customer_id, hash: knownHash });
      continue;
    }

    if (!document.storage_path) {
      unreadable.push(document.customer_id);
      continue;
    }

    const { data, error } = await supabase.storage.from('client-documents').download(document.storage_path);
    if (error || !data) {
      unreadable.push(document.customer_id);
      continue;
    }

    try {
      hashes.push({ customerId: document.customer_id, hash: await sha256Blob(data) });
    } catch {
      unreadable.push(document.customer_id);
    }
  }

  return { hashes, unreadableCustomerIds: [...new Set(unreadable)] };
}