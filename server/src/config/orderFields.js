'use strict';

const { orderNotesRequiredForItem } = require('./modelScopes');

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
  { key: 'has_crown_rimmonim', label: 'כתר-רימונים', type: 'boolean' },
  { key: 'crown_rimmonim_model', label: 'דגם כתר-רימונים', type: 'text' },
  { key: 'has_rimmonim', label: 'רימונים', type: 'boolean' },
  { key: 'rimmonim_model', label: 'דגם רימונים', type: 'text' },
  { key: 'has_coat', label: 'מעיל', type: 'boolean' },
  { key: 'coat_model', label: 'דגם מעיל', type: 'text' },
  { key: 'has_breastplate', label: 'טס', type: 'boolean' },
  { key: 'breastplate_model', label: 'דגם טס', type: 'text' },
  { key: 'has_pointer', label: 'יד', type: 'boolean' },
  { key: 'pointer_model', label: 'דגם יד', type: 'text' },
  { key: 'customer_notes', label: 'הערות לפריט', type: 'textarea' },
];

const ORDER_KEYS = ORDER_DETAIL_FIELDS.map((f) => f.key);
const ITEM_KEYS = ITEM_DETAIL_FIELDS.map((f) => f.key);

const MAX_ORDER_NOTE_LINES = 6;

/** Usable width (pt) of each notes field in order-form.pdf at 12pt NotoSansHebrew. */
const MAX_ORDER_NOTE_LINE_WIDTH = 250;

/** Approximate glyph advances for NotoSansHebrew @ 12pt (matches PDF export). */
function charAdvance(ch) {
  const cp = ch.codePointAt(0);
  if (cp === 0x20) return 3.24;
  if (cp >= 0x30 && cp <= 0x39) return 6.84;
  if (cp >= 0x0590 && cp <= 0x05ff) return 6.16;
  if (cp >= 0x41 && cp <= 0x5a) return 7.16;
  if (cp >= 0x61 && cp <= 0x7a) return 5.8;
  if (cp < 0x80) return 3.5;
  return 6.5;
}

function clampOrderNoteLine(line, maxWidth = MAX_ORDER_NOTE_LINE_WIDTH) {
  const raw = String(line ?? '');
  let width = 0;
  let out = '';
  for (const ch of Array.from(raw)) {
    const adv = charAdvance(ch);
    if (width + adv > maxWidth) break;
    width += adv;
    out += ch;
  }
  return out;
}

function clampOrderNotes(value, maxLines = MAX_ORDER_NOTE_LINES) {
  const lines = String(value ?? '')
    .split('\n')
    .slice(0, maxLines)
    .map((line) => clampOrderNoteLine(line));
  return lines.join('\n');
}

function hasItemManufacturingData(item) {
  const signalKeys = [
    'customer_notes', 'model', 'size_code',
    'parchment_diameter', 'plate_diameter', 'parchment_height',
    'parochet_height',
    'has_stones', 'has_crown', 'has_crown_rimmonim', 'has_rimmonim', 'has_coat',
    'has_breastplate', 'has_pointer',
    'stones_color', 'crown_model', 'crown_rimmonim_model', 'rimmonim_model', 'coat_model',
    'breastplate_model', 'pointer_model',
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
  // Special model (מיוחד / 10) requires non-empty order notes.
  if (orderNotesRequiredForItem(item)) {
    if (!order?.order_notes || String(order.order_notes).trim() === '') {
      return false;
    }
  }
  return hasOrderHeaderData(order) || hasItemManufacturingData(item);
}

function assertSpecialModelNotes(order, item) {
  if (!orderNotesRequiredForItem(item)) return null;
  if (order?.order_notes && String(order.order_notes).trim() !== '') return null;
  return 'נבחר דגם מיוחד — יש למלא הערות עם פרטי הבחירה.';
}

/** True when the main עץ חיים model code is set. */
function hasMainModel(item) {
  return Boolean(item?.model && String(item.model).trim());
}

/** Crown / טס / יד checkbox selected. */
function hasAccessorySelection(item) {
  return Boolean(
    item?.has_crown
    || item?.has_crown_rimmonim
    || item?.has_rimmonim
    || item?.has_coat
    || item?.has_breastplate
    || item?.has_pointer
  );
}

/**
 * Previously required main עץ חיים or at least one accessory.
 * Orders may now complete with no product/model selection.
 * @returns {null}
 */
function assertMainOrAccessory() {
  return null;
}

module.exports = {
  ORDER_DETAIL_FIELDS,
  ITEM_DETAIL_FIELDS,
  ORDER_KEYS,
  ITEM_KEYS,
  MAX_ORDER_NOTE_LINES,
  MAX_ORDER_NOTE_LINE_WIDTH,
  clampOrderNoteLine,
  clampOrderNotes,
  isDetailsComplete,
  assertSpecialModelNotes,
  hasMainModel,
  hasAccessorySelection,
  assertMainOrAccessory,
};
