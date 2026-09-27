export function normalizePath(pathname = window.location.pathname || '/') {
  const sanitized = String(pathname || '/').split('?')[0].split('#')[0];
  const cleaned = sanitized === '' ? '/' : sanitized;
  return cleaned.endsWith('/') && cleaned !== '/' ? cleaned.replace(/\/+$/, '') : cleaned;
}

export function routeForRole(role) {
  const map = {
    admin: '/admin',
    client: '/app',
    employer: '/dashboard',
    employee: '/dashboard',
    reseller: '/dashboard',
  };
  return map[String(role || '').toLowerCase()] || '/dashboard';
}
