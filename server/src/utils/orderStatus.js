'use strict';

/**
 * Workflow statuses shared by orders.status and order_items.status.
 * Display rules follow what is actually stored (including legacy values
 * from before the status migration). The summary/resend normalizer is
 * separate and must not treat a line's `open` as `approved`.
 */

const WORKFLOW_STATUSES = ['pending_approval', 'approved', 'finished', 'sent'];
const WORKFLOW = new Set(WORKFLOW_STATUSES);

const STATUS_LABELS = {
  pending_approval: 'ממתין לאישור',
  approved: 'מאושר',
  finished: 'סיים',
  sent: 'נשלח',
};

function norm(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

/**
 * Icon status for one product line.
 * Canonical values stay themselves. Legacy `completed` (old סיום הזמנה)
 * shows as approved. Legacy `open` follows the parent order.
 */
function displayItemStatus(itemStatus, orderStatus) {
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

/**
 * Icon status for an order that has no product lines.
 * `open` shows as approved. Any other legacy value shows as pending.
 */
function displayOrderStatus(orderStatus) {
  const order = norm(orderStatus);
  if (WORKFLOW.has(order)) return order;
  if (order === 'open') return 'approved';
  return 'pending_approval';
}

/**
 * Status used for the order summary and the repeat-send check.
 * `completed` is the old סיום הזמנה result and counts as approved.
 * `open` stays open — promoting it would mark sibling lines approved
 * when only one line is finished.
 */
function normalizeItemStatusForSummary(itemStatus) {
  const item = norm(itemStatus);
  if (WORKFLOW.has(item)) return item;
  if (item === 'completed') return 'approved';
  if (item === 'open' || item === '') return 'open';
  return 'pending_approval';
}

/** True when סיום הזמנה already ran for this line (or it moved further). */
function isResendItemStatus(itemStatus) {
  const status = normalizeItemStatusForSummary(itemStatus);
  return status === 'approved' || status === 'finished' || status === 'sent';
}

function canAdvanceDisplayStatus(displayStatus) {
  return displayStatus === 'approved' || displayStatus === 'finished' || displayStatus === 'sent';
}

function assertWorkflowAdvance(displayStatus, targetStatus) {
  const target = norm(targetStatus);
  if (target !== 'approved' && target !== 'finished' && target !== 'sent') {
    const e = new Error('ניתן לעדכן רק לסטטוס מאושר, סיים או נשלח.');
    e.status = 400;
    throw e;
  }
  const current = norm(displayStatus);
  if (current === 'pending_approval') {
    const e = new Error('לא ניתן לאשר הזמנה מהרשימה. האישור נעשה בסיום הזמנה.');
    e.status = 400;
    throw e;
  }
  if (!canAdvanceDisplayStatus(current)) {
    const e = new Error('לא ניתן לעדכן את הסטטוס הזה מהרשימה.');
    e.status = 400;
    throw e;
  }
  return target;
}

function workflowStatusSentence({ phone, customerName, status }) {
  const verb = norm(status) === 'sent' ? 'נשלחה' : 'מוכנה';
  const num = String(phone || '').trim();
  const name = String(customerName || '').trim();
  return `ההזמנה מספר ${num} של ${name} ${verb} בהצלחה`;
}

function parseItemStatusRows(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

module.exports = {
  WORKFLOW_STATUSES,
  STATUS_LABELS,
  displayItemStatus,
  displayOrderStatus,
  normalizeItemStatusForSummary,
  isResendItemStatus,
  canAdvanceDisplayStatus,
  assertWorkflowAdvance,
  workflowStatusSentence,
  parseItemStatusRows,
};
