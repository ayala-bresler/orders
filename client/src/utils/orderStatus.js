/**
 * Display rules for order / line status.
 * Keep in step with server/src/utils/orderStatus.js.
 * The summary helper does not map a line's `open` to `approved`.
 */

export const STATUS_ORDER = ['pending_approval', 'approved', 'finished', 'sent'];

const WORKFLOW = new Set(STATUS_ORDER);

export const STATUS_LABELS = {
  pending_approval: 'ממתין לאישור',
  approved: 'מאושר',
  finished: 'סיים',
  sent: 'נשלח',
};

function norm(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

export function displayItemStatus(itemStatus, orderStatus) {
  const item = norm(itemStatus);
  const order = norm(orderStatus);
  if (WORKFLOW.has(item)) return item;
  if (item === 'completed') return 'approved';
  if (item === 'open' || item === '') {
    if (order === 'open' || order === 'approved' || order === 'completed') return 'approved';
    if (order === 'finished') return 'finished';
    if (order === 'sent') return 'sent';
    return 'pending_approval';
  }
  return 'pending_approval';
}

export function displayOrderStatus(orderStatus) {
  const order = norm(orderStatus);
  if (WORKFLOW.has(order)) return order;
  if (order === 'open') return 'approved';
  return 'pending_approval';
}

export function normalizeItemStatusForSummary(itemStatus) {
  const item = norm(itemStatus);
  if (WORKFLOW.has(item)) return item;
  if (item === 'completed') return 'approved';
  if (item === 'open' || item === '') return 'open';
  return 'pending_approval';
}

/** Already passed סיום הזמנה. `open` is not included. */
export function isResendItemStatus(itemStatus) {
  const status = normalizeItemStatusForSummary(itemStatus);
  return status === 'approved' || status === 'finished' || status === 'sent';
}

export function canAdvanceDisplayStatus(displayStatus) {
  return displayStatus === 'approved' || displayStatus === 'finished';
}

export function statusLabel(displayStatus) {
  return STATUS_LABELS[displayStatus] || STATUS_LABELS.pending_approval;
}

/** Display statuses on one list row: one per product line, or the order when it has none. */
export function rowDisplayStatuses(orderId, orderStatus, items) {
  const rows = Array.isArray(items) ? items : [];
  if (rows.length) {
    return rows.map((item) => displayItemStatus(item.status, orderStatus));
  }
  if (orderId) return [displayOrderStatus(orderStatus)];
  return ['pending_approval'];
}

/** A row stays visible when at least one of its statuses is still selected. */
export function rowMatchesStatusFilter(orderId, orderStatus, items, shown) {
  if (!shown) return true;
  return rowDisplayStatuses(orderId, orderStatus, items).some((status) => shown.has(status));
}
