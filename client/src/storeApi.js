/**
 * Store auth / SMTP / my-customers API (HTTP-only cookie; credentials: include).
 */

const JSON_HEADERS = { 'Content-Type': 'application/json' };

async function storeFetch(url, options = {}) {
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

export async function fetchStoreMe() {
  const res = await fetch('/api/stores/me', { credentials: 'include' });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    return { authenticated: false, store: null };
  }
  if (!res.ok) {
    throw new Error(data.error || 'שגיאה בטעינת סשן החנות');
  }
  return data;
}

/** Unified entry: store name + password (login or admin-code → password setup). */
export async function enterStore(payload) {
  return storeFetch('/api/stores/entry', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function activateStore(payload) {
  return storeFetch('/api/stores/activate', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function loginStore(payload) {
  return storeFetch('/api/stores/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function logoutStore() {
  return storeFetch('/api/stores/logout', {
    method: 'POST',
    body: '{}',
  });
}

export async function saveStoreEmail(payload) {
  return storeFetch('/api/stores/email', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function fetchMyCustomers() {
  return storeFetch('/api/stores/customers');
}

export async function selectMyCustomer(customerId) {
  return storeFetch('/api/stores/select-customer', {
    method: 'POST',
    body: JSON.stringify({ customerId }),
  });
}
