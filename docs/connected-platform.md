# IJ Langa Consulting — connected platform implementation

## Canonical business flow

`Website → Account → Verification → Approval → Dashboard → Products/Services → Quote → Order → Payment → Invoice → Receipt → Client Portal → Accounting/Reporting`

The repository already contains the public website, Supabase-backed registration, role dashboards, client portal, quotes, orders, invoices, receipts, payment adapters and integration hub. This implementation makes the authentication boundaries explicit and adds dedicated recovery/verification entry points.

## Exact page-by-page route list

### Public website

- `/` — Home
- `/about` — About Us
- `/services` — Services index
- `/services/accounting` — Accounting & Bookkeeping
- `/services/tax` — SARS & Tax
- `/services/cipc` — CIPC & Company Services
- `/services/payroll` — Payroll
- `/services/compliance` — Compliance
- `/services/business-plans` — Business Plans & Funding
- `/services/tenders` — Tender Services
- `/shop` — Shop
- `/product` — Product details
- `/cart` — Cart
- `/quote` — Quote request
- `/contact` — Contact Us
- `/shelf-companies.html` — Shelf Companies
- `/reviews` — Reviews
- `/faqs` — FAQs

### Authentication

- `/login.html` — Login
- `/register` — Registration
- `/account-verification.html` — Email verification and resend
- `/pending-approval.html` — Verified but awaiting business approval
- `/forgot-password.html` — Stage 1: send reset email
- `/reset-password.html` — Stage 2: authenticated recovery session and `updateUser({ password })`
- `/accept-invite.html` — Accept invitation
- `/magic-link` — Magic-link authentication
- `/change-email` — Change email
- `/reauthenticate` — Reauthentication
- `/account-security` — Security settings

### Admin

- `/admin.html` — Dashboard
- `/admin-users.html` — Users
- `/admin/account-verification` — Verification queue
- `/admin/customers` — Customers
- `/admin/employers` — Employers
- `/admin/employees` — Employees
- `/admin/resellers` — Resellers
- `/admin/products` — Products
- `/admin/categories` — Categories
- `/admin/quotes` — Quotes
- `/admin/orders` — Orders
- `/admin/payments` — Payments
- `/admin/invoices` — Invoices
- `/admin/receipts` — Receipts
- `/admin/accounting` — Accounting
- `/admin/payroll` — Payroll
- `/admin/documents` — Documents
- `/admin/notifications` — Notifications
- `/admin/shelf-companies` — Shelf companies
- `/admin/reports` — Reports
- `/admin/integrations` — Integration hub
- `/admin/email` — Email
- `/admin/audit` — Audit log
- `/admin/settings` — Settings

### Client portal

- `/portal.html` — Client dashboard
- `/portal/profile` — My profile
- `/portal/verification` — Verification
- `/portal/services` — Services
- `/portal/quotes` — Quotes
- `/portal/orders` — Orders
- `/portal/invoices` — Invoices
- `/portal/payments` — Payments
- `/portal/receipts` — Receipts
- `/portal/statements` — Statements
- `/portal/documents` — Documents
- `/portal/history` — Service history
- `/portal/support` — Support
- `/portal/security` — Security

### Employer, employee and reseller

- `/employer` — Employer dashboard
- `/employer/company` — Company profile
- `/employer/employees` — Employees
- `/employer/payroll` — Payroll
- `/employer/payslips` — Payslips
- `/employer/leave` — Leave
- `/employer/documents` — Documents
- `/employer/quotes` — Quotes
- `/employer/orders` — Orders
- `/employer/invoices` — Invoices
- `/employer/payments` — Payments
- `/employer/reports` — Reports
- `/employer/security` — Security
- `/employee` — Employee dashboard
- `/employee/profile` — My profile
- `/employee/payslips` — Payslips
- `/employee/tax` — Tax documents
- `/employee/leave` — Leave
- `/employee/documents` — Documents
- `/employee/security` — Security
- `/reseller` — Reseller dashboard
- `/reseller/customers` — Customers
- `/reseller/services` — Services
- `/reseller/quotes` — Quotes
- `/reseller/orders` — Orders
- `/reseller/commissions` — Commissions
- `/reseller/statements` — Statements
- `/reseller/documents` — Documents
- `/reseller/profile` — Profile
- `/reseller/security` — Security

## State and routing contract

1. Supabase Auth owns the authenticated user and `email_confirmed_at`.
2. `profiles.id` is always the same UUID as `auth.users.id`; profile rows are application data only.
3. `profiles.email_verified_at` mirrors successful email verification.
4. `profiles.approval_status` represents business approval and is independent of email verification.
5. `profiles.is_active` gates dashboard access.
6. Client-side routing must never create a profile as a side effect of login.

State machine: `REGISTERED → EMAIL_PENDING → EMAIL_VERIFIED → ADMIN_PENDING → APPROVED → ACTIVE`; alternate terminal/blocked states are `EXPIRED`, `REJECTED`, `SUSPENDED`, and `DISABLED`.

## Edge-function pseudocode

### Registration

```text
validate fields and document MIME/size
find auth user by normalized email
if no auth user: create Auth user and retain returned id
if auth user exists: update only the submitted Auth metadata/password as permitted
find profile where id = auth user id
if profile exists: UPDATE profile
else: INSERT profile with id = auth user id
create account_access_requests row referencing the same user id
upload documents under <auth-user-id>/<request-id>/
issue Supabase confirmation link
notify administrators
on failure: remove newly uploaded files and delete only a newly-created user
```

### Verification

```text
receive token_hash or authorization code
verify with Supabase Auth (verifyOtp or exchangeCodeForSession)
obtain authenticated user from the resulting session
server-side sync profile.email_verified_at and state EMAIL_VERIFIED
if approval_status = approved: mark active and route by role
else route to pending approval
record audit event; never treat email verification as business approval
```

### Password reset

```text
forgot-password: call supabase.auth.resetPasswordForEmail(email, { redirectTo: '/reset-password.html' })
reset-password: wait for PASSWORD_RECOVERY/session
validate password and confirmation
call supabase.auth.updateUser({ password })
record audit event server-side
sign out recovery session and route to login
```

### Admin approval

```text
require authenticated admin in an Edge Function
hash and consume a single-use admin action token
lock the account_access_requests row to prevent replay
validate documents and decision
admin.auth.updateUserById(user_id, { email_confirm: true }) only server-side
update profile approval_status, approved_by, approved_at, is_active
notify applicant and append audit_logs row
```

## Operational checklist

- [x] Dedicated verification page entry point
- [x] Dedicated two-stage password reset pages
- [x] Supabase Auth remains authentication authority
- [x] Profile UUID is derived from Auth UUID
- [x] Pending approval is distinct from email verification
- [x] Service-role actions remain Edge Function-only
- [x] Database state, audit, and RLS migration added
- [ ] Add each friendly route as a deployed rewrite to its existing HTML entry point
- [ ] Configure Supabase Auth Site URL and redirect allow-list for production and preview domains
- [ ] Deploy migrations and Edge Functions
- [ ] Configure Resend, payment, and webhook secrets only in Supabase/server environments
- [ ] Test registration, duplicate registration, expired links, prefetch-consumed links, reset, approval, rejection, suspension, and every role route
