import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRegistrationError } from '../src/lib/account-profile.js';

test('normalizes duplicate profile errors to a safe user message', () => {
  const safe = normalizeRegistrationError('duplicate key value violates unique constraint "profiles_pkey"');
  assert.equal(
    safe,
    'We found an existing account associated with this email address. Your registration could not be duplicated. Please sign in or contact IJ Langa Consulting if you believe this is incorrect.'
  );
});

test('preserves unrelated validation errors', () => {
  assert.equal(normalizeRegistrationError('Password must be at least 8 characters.'), 'Password must be at least 8 characters.');
});
