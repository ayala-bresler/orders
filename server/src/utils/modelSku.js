'use strict';

const CATEGORY_PREFIX = '4';

function padCode(code) {
  const s = String(code || '').trim();
  if (!s) return '';
  return s.length >= 2 ? s : s.padStart(2, '0');
}

/** First two SKU segments shown in the UI, e.g. 4-01 */
function modelSkuPrefix(modelCode) {
  const code = padCode(modelCode);
  return code ? `${CATEGORY_PREFIX}-${code}` : '';
}

function formatModelLabel(modelCode, modelName) {
  const prefix = modelSkuPrefix(modelCode);
  const name = String(modelName || '').trim();
  if (prefix && name) return `${prefix} · ${name}`;
  return prefix || name || '';
}

/** Short order SKU: category + model only (e.g. 4-03 from 4-03-01-075). */
function shortSkuFromFull(sku) {
  const parts = String(sku || '')
    .trim()
    .split('-')
    .filter(Boolean);
  if (parts.length >= 2) return `${parts[0]}-${parts[1]}`;
  return String(sku || '').trim();
}

function resolveModelCode(stored, rows = []) {
  const s = String(stored || '').trim();
  if (!s) return '';
  if (rows.some((r) => r.model_code === s)) return s;
  const byName = rows.find((r) => r.model_name === s);
  return byName?.model_code || s;
}

module.exports = {
  CATEGORY_PREFIX,
  modelSkuPrefix,
  formatModelLabel,
  shortSkuFromFull,
  resolveModelCode,
};
