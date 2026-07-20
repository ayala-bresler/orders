import {
  applySessionFromIdentifyResult,
  clearSessionAuth,
  getSessionToken,
  saveSessionAuth,
} from './utils/sessionAuth.js';
import { closeAllLiveConnections } from './utils/liveConnections.js';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

let onUnauthorizedHandler = null;

/** App registers a logout callback for 401 responses. */
export function setUnauthorizedHandler(fn) {
  onUnauthorizedHandler = typeof fn === 'function' ? fn : null;
}

function authHeaders(extra = {}) {
  const token = getSessionToken();
  const headers = { ...extra };
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function buildDxfRequestBody(valuesOrPayload, fontScales) {
  if (typeof valuesOrPayload === 'string') {
    return { preparedSvg: valuesOrPayload };
  }
  if (valuesOrPayload?.preparedSvg) {
    return { preparedSvg: valuesOrPayload.preparedSvg };
  }
  return { values: valuesOrPayload || {}, fontScales: fontScales || {} };
}

async function toJson(res) {
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    clearSessionAuth();
    closeAllLiveConnections();
    onUnauthorizedHandler?.(data);
    const detail =
      data.error || data.message || 'פג תוקף הסשן. יש להתחבר מחדש.';
    const err = new Error(detail);
    err.status = 401;
    err.code = data.code || 'SESSION_EXPIRED';
    throw err;
  }
  if (!res.ok) {
    const detail =
      data.error ||
      data.message ||
      (typeof data === 'string' ? data : null) ||
      `Request failed (${res.status})`;
    throw new Error(detail);
  }
  return data;
}

async function apiFetch(url, options = {}) {
  const { headers: extraHeaders, skipAuth, ...rest } = options;
  const headers = skipAuth
    ? { ...extraHeaders }
    : authHeaders(extraHeaders || {});
  return fetch(url, { ...rest, headers });
}

/** Look up a client by phone; may return needsConfirmation for new numbers. */
export async function identifyCustomer(payload) {
  const data = await toJson(
    await apiFetch('/api/customers/identify', {
      method: 'POST',
      skipAuth: true,
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    })
  );
  return applySessionFromIdentifyResult(data);
}

/** Create a new customer after user confirmed in the popup. */
export async function confirmNewCustomer(payload) {
  const data = await toJson(
    await apiFetch('/api/customers/identify/confirm', {
      method: 'POST',
      skipAuth: true,
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    })
  );
  return applySessionFromIdentifyResult(data);
}

/** Extend session expiry (sliding window). */
export async function refreshSession() {
  const data = await toJson(
    await apiFetch('/api/session/refresh', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: '{}',
    })
  );
  saveSessionAuth(data);
  return data;
}

/** Best-effort server revoke + local clear. */
export async function logoutSession() {
  try {
    const token = getSessionToken();
    if (token) {
      await apiFetch('/api/session/logout', {
        method: 'POST',
        headers: JSON_HEADERS,
        body: '{}',
      });
    }
  } catch {
    /* ignore network errors on logout */
  } finally {
    clearSessionAuth();
    closeAllLiveConnections();
  }
}

/** List selectable products (defaults to category 4 / סת"ם). */
export async function listProducts() {
  return toJson(await apiFetch('/api/products'));
}

/** Model cards for the new-order picker (short SKU + image flags). */
export async function fetchSelectableModels() {
  return toJson(await apiFetch('/api/products/selectable-models'));
}

/** URL for a model image by short SKU (e.g. 4-03). Includes access_token for <img>. */
export function modelImageUrl(shortSku) {
  const safe = encodeURIComponent(String(shortSku || '').trim());
  const token = getSessionToken();
  const q = token ? `?access_token=${encodeURIComponent(token)}` : '';
  return `/api/products/model-images/${safe}${q}`;
}

/**
 * Fetch model image with session auth (for <img> use blob URLs via loadModelImage).
 * Plain <img src> cannot send Authorization — use this when needed.
 */
export async function fetchModelImageBlob(shortSku) {
  const res = await apiFetch(modelImageUrl(shortSku));
  if (res.status === 401) {
    await toJson(res);
  }
  if (!res.ok) throw new Error('לא ניתן לטעון תמונת דגם');
  return res.blob();
}

/** All models for order-details dropdowns. */
export async function fetchModels() {
  return toJson(await apiFetch('/api/products/models'));
}

/** Add a product line to an order. Returns the item + supports_verses flag. */
export async function addOrderItem(orderId, payload) {
  return toJson(
    await apiFetch(`/api/orders/${orderId}/items`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    })
  );
}

/** Delete the current draft order and start a fresh one for the same customer. */
export async function deleteOrder(orderId) {
  return toJson(
    await apiFetch(`/api/orders/${orderId}`, {
      method: 'DELETE',
    })
  );
}

/** Remove one product line from a draft/open order. */
export async function deleteOrderItem(orderId, itemId) {
  return toJson(
    await apiFetch(`/api/orders/${orderId}/items/${itemId}`, {
      method: 'DELETE',
    })
  );
}

/** Load the immutable master template + editable field descriptors. */
export async function fetchTemplate({ orderId, orderItemId, sizeCode, productTypeCode } = {}) {
  const params = new URLSearchParams();
  if (orderId) params.set('orderId', String(orderId));
  if (orderItemId) params.set('orderItemId', String(orderItemId));
  if (sizeCode) params.set('sizeCode', sizeCode);
  if (productTypeCode) params.set('productTypeCode', productTypeCode);
  const qs = params.toString();
  return toJson(await apiFetch(`/api/template${qs ? `?${qs}` : ''}`));
}

/** Selectable parchment sizes for product type 01 (laser). */
export async function fetchProductSizes(productTypeCode = '01') {
  const params = new URLSearchParams({ product_type_code: productTypeCode });
  return toJson(await apiFetch(`/api/products/sizes?${params}`));
}

/** Server-rendered preview. Pass `{ bake: true }` for path outlines (DXF-accurate centering). */
export async function fetchTemplatePreview(values, fontScales = {}, templateQuery = {}) {
  return toJson(
    await apiFetch('/api/template/preview', {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ values, fontScales, ...templateQuery }),
    })
  );
}

/** Load order header + item manufacturing fields. */
export async function fetchOrderItemDetails(orderId, itemId) {
  return toJson(await apiFetch(`/api/orders/${orderId}/items/${itemId}/details`));
}

/** Save order header + item fields (synced). */
export async function saveOrderItemDetails(orderId, itemId, payload) {
  return toJson(
    await apiFetch(`/api/orders/${orderId}/items/${itemId}/details`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify(payload),
    })
  );
}

/** Load previously saved verses for a specific order item. */
export async function fetchOrderItemVerses(orderId, itemId) {
  return toJson(await apiFetch(`/api/orders/${orderId}/items/${itemId}/verses`));
}

/** Send DXF export to configured email. Pass `{ preparedSvg }` for WYSIWYG layout. */
export async function emailOrderItemDxf(orderId, itemId, valuesOrPayload, fontScales = {}) {
  const body = buildDxfRequestBody(valuesOrPayload, fontScales);
  return toJson(
    await apiFetch(`/api/orders/${orderId}/items/${itemId}/dxf/email`, {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify(body),
    })
  );
}

/** Download 4 quarter DXF files as ZIP. Pass `{ preparedSvg }` for WYSIWYG layout. */
export async function exportOrderItemDxf(orderId, itemId, valuesOrPayload, fontScales = {}) {
  const body = buildDxfRequestBody(valuesOrPayload, fontScales);
  const res = await apiFetch(`/api/orders/${orderId}/items/${itemId}/dxf`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  });
  if (res.status === 401) {
    await toJson(res);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `ייצוא DXF נכשל (${res.status})`);
  }
  const warnings = res.headers.get('X-Export-Warnings') || '';
  const blob = await res.blob();
  return { blob, warnings };
}

/** Persist verses + font scales (writes 8 columns + SVG snapshot). */
export async function saveOrderItemVerses(orderId, itemId, values, fontScales = {}) {
  return toJson(
    await apiFetch(`/api/orders/${orderId}/items/${itemId}/verses`, {
      method: 'PUT',
      headers: JSON_HEADERS,
      body: JSON.stringify({ values, fontScales }),
    })
  );
}

/** Generate filled order PDF from template + saved data. */
export async function exportOrderItemPdf(orderId, itemId) {
  const res = await apiFetch(`/api/orders/${orderId}/items/${itemId}/pdf`, {
    method: 'POST',
  });
  if (res.status === 401) {
    await toJson(res);
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `ייצוא PDF נכשל (${res.status})`);
  }
  const blob = await res.blob();
  return { blob };
}

/** Mark order complete and generate PDF. */
export async function completeOrderItem(orderId, itemId) {
  return toJson(
    await apiFetch(`/api/orders/${orderId}/items/${itemId}/complete`, {
      method: 'POST',
      headers: JSON_HEADERS,
    })
  );
}
