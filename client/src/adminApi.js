/**
 * System admin API (ADMIN_SECRET cookie session).
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function adminFetch(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'include',
    ...options,
    headers: { ...JSON_HEADERS, ...(options.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || data.message || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.code;
    throw err;
  }
  return data;
}

export async function fetchAdminMe() {
  const res = await fetch('/api/admin/me', { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    return {
      authenticated: false,
      configured: Boolean(data.configured),
      loginName: data.loginName || 'מנהל',
    };
  }
  if (!res.ok) {
    throw new Error(data.error || 'שגיאה בטעינת סשן מנהל');
  }
  return data;
}

export async function loginAdmin(payload) {
  return adminFetch('/api/admin/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function logoutAdmin() {
  return adminFetch('/api/admin/logout', {
    method: 'POST',
    body: '{}',
  });
}

export async function fetchAdminStores() {
  return adminFetch('/api/admin/stores');
}

export async function createAdminStore({ storeName, temporaryPassword, percentage }) {
  return adminFetch('/api/admin/stores', {
    method: 'POST',
    body: JSON.stringify({
      storeName,
      temporaryPassword,
      percentage,
    }),
  });
}

export async function fetchAdminCustomers(storeId) {
  const q =
    storeId != null && storeId !== '' && storeId !== 'all'
      ? `?storeId=${encodeURIComponent(String(storeId))}`
      : '';
  return adminFetch(`/api/admin/customers${q}`);
}

export async function selectAdminCustomer(customerId) {
  return adminFetch('/api/admin/select-customer', {
    method: 'POST',
    body: JSON.stringify({ customerId }),
  });
}
