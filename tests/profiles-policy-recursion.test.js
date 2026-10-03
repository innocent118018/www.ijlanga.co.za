import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

test('profiles read policy avoids recursive self-subqueries', () => {
  const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260927_profiles_policy_recursion_fix.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  assert.match(
    sql,
    /create policy\s+"Employers can read team profiles"\s+on public\.profiles\s+for select\s+to authenticated\s+using \(\s*id\s*=\s*auth\.uid\(\)\s*or\s*employer_id\s*=\s*auth\.uid\(\)\s*(or\s*is_admin\(\))?\s*\)/is
  );
  assert.doesNotMatch(sql, /create policy\s+"Employers can read team profiles".*exists\s*\(\s*select\s+1\s+from\s+public\.profiles/i);
  assert.doesNotMatch(sql, /create policy\s+"Employers can read team profiles".*from\s+public\.profiles\s+p\s+where\s+p\.id\s*=\s*.*employer_id/i);
});

test('profile authorization guard blocks privileged field changes and override records stay restricted', () => {
  const migrationDir = path.join(process.cwd(), 'supabase/migrations');
  const files = fs.readdirSync(migrationDir).filter((file) => file.endsWith('.sql'));
  const sql = files
    .map((file) => fs.readFileSync(path.join(migrationDir, file), 'utf8'))
    .join('\n\n');

  assert.match(sql, /create\s+or\s+replace\s+function\s+public\.protect_profile_authorization_fields\s*\(/is);
  assert.match(sql, /new\.role\s+is\s+distinct\s+from\s+old\.role/i);
  assert.match(sql, /new\.approval_status\s+is\s+distinct\s+from\s+old\.approval_status/i);
  assert.match(sql, /new\.email_verified_at\s+is\s+distinct\s+from\s+old\.email_verified_at/i);
  assert.match(sql, /create\s+policy\s+"Admins can manage admin_account_overrides"\s+on\s+public\.admin_account_overrides/i);
  assert.match(sql, /create\s+policy\s+"No normal users can access admin_account_overrides"\s+on\s+public\.admin_account_overrides/i);
  assert.doesNotMatch(sql, /admin_account_overrides.*with\s+check\s*\(\s*true\s*\)/i);
});
