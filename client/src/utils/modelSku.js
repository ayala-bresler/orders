const CATEGORY_PREFIX = '4';

function padCode(code) {
  const s = String(code || '').trim();
  if (!s) return '';
  return s.length >= 2 ? s : s.padStart(2, '0');
}

export function modelSkuPrefix(modelCode) {
  const code = padCode(modelCode);
  return code ? `${CATEGORY_PREFIX}-${code}` : '';
}

export function formatModelLabel(modelCode, modelName) {
  const prefix = modelSkuPrefix(modelCode);
  const name = String(modelName || '').trim();
  if (prefix && name) return `${prefix} · ${name}`;
  return prefix || name || '';
}

/** Short order SKU: category + model segment only (e.g. 4-03). */
export function shortSkuFromFull(sku) {
  const parts = String(sku || '')
    .trim()
    .split('-')
    .filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return String(sku || '').trim();
}

/** Map stored model_code or legacy model_name to model_code. */
export function resolveModelCode(stored, models) {
  const s = String(stored || '').trim();
  if (!s || !models?.length) return s;
  if (models.some((m) => m.model_code === s)) return s;
  const byName = models.find((m) => m.model_name === s);
  return byName?.model_code || s;
}
