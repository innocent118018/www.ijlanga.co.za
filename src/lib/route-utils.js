export const legacyHtmlRedirects = {
  '/admin.html': '/admin',
  '/dashboard.html': '/dashboard',
  '/portal.html': '/dashboard',
  '/login.html': '/login',
  '/quote.html': '/quote',
  '/auth-confirm.html': '/verify',
  '/accept-invite.html': '/invite',
  '/role-dashboard.html': '/dashboard',
  '/admin-users.html': '/admin/users',
  '/admin-shelf.html': '/admin/shelf',
  '/integration.html': '/admin/integrations',
  '/shelf-companies.html': '/shelf-companies',
};

export function normalizePath(pathname = window.location.pathname || '/') {
  const sanitized = String(pathname || '/').split('?')[0].split('#')[0];
  const cleaned = sanitized === '' ? '/' : sanitized;
  return cleaned.endsWith('/') && cleaned !== '/' ? cleaned.replace(/\/+$/, '') : cleaned;
}

export function resolveLegacyRoute(pathname = window.location.pathname) {
  const normalized = normalizePath(pathname);
  return legacyHtmlRedirects[normalized] || normalized;
}

export function routeForRole(role) {
  const map = {
    admin: '/admin',
    client: '/dashboard',
    employer: '/dashboard',
    employee: '/dashboard',
    reseller: '/dashboard',
  };
  return map[String(role || '').toLowerCase()] || '/dashboard';
}

export function shouldRedirectToPath(pathname) {
  const normalized = normalizePath(pathname);
  const resolved = resolveLegacyRoute(normalized);
  return resolved !== normalized;
}
