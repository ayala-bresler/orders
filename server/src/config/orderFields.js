'use strict';

/**
 * Editable columns on orders (header-level).
 * Matches the live `product_management.orders` table — no delivery_method /
 * shipping_address / payment_method columns in production.
 */
const ORDER_DETAIL_FIELDS = [
  { key: 'estimated_delivery_date', label: 'תאריך אספקה משוער (אופציונלי)', type: 'date' },
  { key: 'order_notes', label: 'הערות להזמנה', type: 'textarea' },
];

/** Editable manufacturing / accessory columns on order_items. */
const ITEM_DETAIL_FIELDS = [
  { key: 'quantity', label: 'כמות', type: 'number', required: true, min: 1, max: 99 },
  { key: 'price_at_purchase', label: 'מחיר (₪)', type: 'number', min: 0, step: 0.01 },
  { key: 'model', label: 'דגם', type: 'text' },
  { key: 'size_code', label: 'קוד מידה', type: 'text' },
  { key: 'parchment_diameter', label: 'קוטר קלף', type: 'number', min: 0, step: 0.1 },
  { key: 'plate_diameter', label: 'קוטר צלחת', type: 'number', min: 0, step: 0.1 },
  { key: 'parchment_height', label: 'גובה קלף', type: 'number', min: 0, step: 0.1 },
  { key: 'parochet_height', label: 'גובה פרוכת', type: 'number', min: 0, step: 0.1 },
  { key: 'has_stones', label: 'אבנים', type: 'boolean' },
  { key: 'stones_color', label: 'צבע אבנים', type: 'text' },
  { key: 'has_crown', label: 'כתר', type: 'boolean' },
  { key: 'crown_model', label: 'דגם כתר', type: 'text' },
  { key: 'has_breastplate', label: 'טס', type: 'boolean' },
  { key: 'breastplate_model', label: 'דגם טס', type: 'text' },
  { key: 'has_pointer', label: 'יד', type: 'boolean' },
  { key: 'pointer_model', label: 'דגם יד', type: 'text' },
  { key: 'customer_notes', label: 'הערות לפריט', type: 'textarea' },
];

const ORDER_KEYS = ORDER_DETAIL_FIELDS.map((f) => f.key);
const ITEM_KEYS = ITEM_DETAIL_FIELDS.map((f) => f.key);

const MAX_ORDER_NOTE_LINES = 6;

function clampOrderNotes(value, maxLines = MAX_ORDER_NOTE_LINES) {
  const lines = String(value ?? '').split('\n');
  if (lines.length <= maxLines) return String(value ?? '');
  return lines.slice(0, maxLines).join('\n');
}

function hasItemManufacturingData(item) {
  const signalKeys = [
    'customer_notes', 'model', 'size_code',
    'parchment_diameter', 'plate_diameter', 'parchment_height',
    'parochet_height',
    'has_stones', 'has_crown', 'has_breastplate', 'has_pointer',
    'stones_color', 'crown_model', 'breastplate_model', 'pointer_model',
  ];
  return signalKeys.some((key) => {
    const val = item[key];
    if (val == null) return false;
    if (typeof val === 'string') return val.trim() !== '';
    return true;
  });
}

function hasOrderHeaderData(order) {
  if (!order) return false;
  return (
    (order.order_notes && String(order.order_notes).trim() !== '')
    || (order.estimated_delivery_date && String(order.estimated_delivery_date).trim() !== '')
  );
}

/** True when quantity is valid and the user already saved meaningful details (skip step). */
function isDetailsComplete(order, item) {
  if (!item) return false;
  const qty = Number(item.quantity);
  if (!Number.isFinite(qty) || qty < 1) return false;
  for (const field of ORDER_DETAIL_FIELDS) {
    if (!field.required) continue;
    const val = order?.[field.key];
    if (val == null || String(val).trim() === '') return false;
  }
  return hasOrderHeaderData(order) || hasItemManufacturingData(item);
}

module.exports = {
  ORDER_DETAIL_FIELDS,
  ITEM_DETAIL_FIELDS,
  ORDER_KEYS,
  ITEM_KEYS,
  MAX_ORDER_NOTE_LINES,
  clampOrderNotes,
  isDetailsComplete,
};
