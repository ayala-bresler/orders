/**
 * Model scope rules (codes normalized to 2-digit form, e.g. 9 → 09).
 *
 * - Crown-only (09): כתר only.
 * - Special text (10 / מיוחד): all areas; text-only card; notes required.
 */

const CROWN_ONLY_MODEL_CODES = new Set(['09']);
const SPECIAL_TEXT_MODEL_CODES = new Set(['10']);

export const SPECIAL_MODEL_DISPLAY_NAME = 'מיוחד';

export function normalizeModelCode(code) {
  const s = String(code || '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) return s.padStart(2, '0');
  return s;
}

export function isCrownOnlyModel(code) {
  return CROWN_ONLY_MODEL_CODES.has(normalizeModelCode(code));
}

export function isSpecialTextModel(code) {
  return SPECIAL_TEXT_MODEL_CODES.has(normalizeModelCode(code));
}

/** Main product / טס / יד — exclude crown-only; special (10) is included. */
export function productSelectableModels(models) {
  return (models || []).filter((m) => !isCrownOnlyModel(m.model_code));
}

/** כתר — all models including crown-only (09) and special (10). */
export function crownSelectableModels(models) {
  return models || [];
}

/** True when any selected model slot uses מיוחד (10). */
export function itemUsesSpecialTextModel(item) {
  if (!item || typeof item !== 'object') return false;
  if (isSpecialTextModel(item.model)) return true;
  if (item.has_crown && isSpecialTextModel(item.crown_model)) return true;
  if (item.has_breastplate && isSpecialTextModel(item.breastplate_model)) return true;
  if (item.has_pointer && isSpecialTextModel(item.pointer_model)) return true;
  return false;
}

export function orderNotesRequiredForItem(item) {
  return itemUsesSpecialTextModel(item);
}
