'use strict';

/**
 * Model scope rules (codes normalized to 2-digit form, e.g. 9 → 09).
 *
 * - Crown-only (09): appears only under כתר — not in the product picker /
 *   main דגם / טס / יד.
 * - Special text model (10 / מיוחד): appears everywhere (picker + all accessory
 *   slots). No product photo — UI shows centered text only. Notes are required
 *   when this code is chosen in any slot.
 */

const CROWN_ONLY_MODEL_CODES = new Set(['09']);
const SPECIAL_TEXT_MODEL_CODES = new Set(['10']);

function normalizeModelCode(code) {
  const s = String(code || '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) return s.padStart(2, '0');
  return s;
}

function isCrownOnlyModel(code) {
  return CROWN_ONLY_MODEL_CODES.has(normalizeModelCode(code));
}

function isSpecialTextModel(code) {
  return SPECIAL_TEXT_MODEL_CODES.has(normalizeModelCode(code));
}

/** True when any selected model slot uses the special (מיוחד) code. */
function itemUsesSpecialTextModel(item) {
  if (!item || typeof item !== 'object') return false;
  if (isSpecialTextModel(item.model)) return true;
  if (item.has_crown && isSpecialTextModel(item.crown_model)) return true;
  if (item.has_breastplate && isSpecialTextModel(item.breastplate_model)) return true;
  if (item.has_pointer && isSpecialTextModel(item.pointer_model)) return true;
  return false;
}

function orderNotesRequiredForItem(item) {
  return itemUsesSpecialTextModel(item);
}

module.exports = {
  CROWN_ONLY_MODEL_CODES,
  SPECIAL_TEXT_MODEL_CODES,
  normalizeModelCode,
  isCrownOnlyModel,
  isSpecialTextModel,
  itemUsesSpecialTextModel,
  orderNotesRequiredForItem,
};
