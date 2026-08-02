/**
 * Models that appear only under the crown (כתר) accessory —
 * never in the product model picker, main דגם field, טס, or יד.
 * Codes are normalized to 2-digit form (9 → 09).
 */
const CROWN_ONLY_MODEL_CODES = new Set(['09', '10']);

export function normalizeModelCode(code) {
  const s = String(code || '').trim();
  if (!s) return '';
  if (/^\d+$/.test(s)) return s.padStart(2, '0');
  return s;
}

export function isCrownOnlyModel(code) {
  return CROWN_ONLY_MODEL_CODES.has(normalizeModelCode(code));
}

/** Main product / טס / יד — exclude crown-only models. */
export function productSelectableModels(models) {
  return (models || []).filter((m) => !isCrownOnlyModel(m.model_code));
}

/** כתר — all models including crown-only (רימונים, מיוחד, …). */
export function crownSelectableModels(models) {
  return models || [];
}
