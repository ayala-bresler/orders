/**
 * Display rules for order / line status.
 * Keep in step with server/src/utils/orderStatus.js.
 * The summary helper does not map a line's `open` to `approved`.
 */

const WORKFLOW = new Set(['pending_approval', 'approved', 'finished', 'sent']);

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
