export function isAdminMailbox(email) {
  const normalized = String(email || '').trim().toLowerCase();
  return normalized === 'info@ijlanga.co.za' || normalized === 'ij.langa11@gmail.com';
}

export function buildProfilePayload({
  id,
  email,
  first_name,
  last_name,
  surname,
  phone,
  id_number,
  company_registration_number,
  role,
  employer_id = null,
  organization_name = null,
  is_active = false,
  approval_status = 'pending',
  email_verified_at = null,
  full_name,
}) {
  return {
    id,
    email: String(email || '').trim().toLowerCase(),
    full_name: String(full_name || [first_name, last_name, surname].filter(Boolean).join(' ') || '').trim(),
    first_name: String(first_name || '').trim() || null,
    last_name: String(last_name || '').trim() || null,
    surname: String(surname || '').trim() || null,
    phone: String(phone || '').trim() || null,
    id_number: String(id_number || '').trim() || null,
    company_registration_number: String(company_registration_number || '').trim() || null,
    role,
    employer_id,
    organization_name: organization_name ? String(organization_name).trim() : null,
    is_active,
    approval_status,
    email_verified_at,
    updated_at: new Date().toISOString(),
  };
}

export function normalizeRegistrationError(message) {
  const raw = String(message || '').trim();
  if (!raw) return 'Unable to process account registration.';
  if (/duplicate key value violates unique constraint.*profiles_pkey|profiles_pkey/i.test(raw)) {
    return 'We found an existing account associated with this email address. Your registration could not be duplicated. Please sign in or contact IJ Langa Consulting if you believe this is incorrect.';
  }
  if (/duplicate key value violates unique constraint/i.test(raw)) {
    return 'We found an existing account associated with this email address. Your registration could not be duplicated. Please sign in or contact IJ Langa Consulting if you believe this is incorrect.';
  }
  return raw;
}
