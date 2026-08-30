'use strict';

function hasMainModel(item) {
  return Boolean(String(item?.model_code || item?.model || '').trim());
}

/** Exact catalog model name — same lookup as the order-form PDF (no truncation). */
function nameForCode(code, nameByCode = {}, fallback = '') {
  const c = String(code || '').trim();
  if (!c) return String(fallback || '').trim();
  if (nameByCode[c]) return String(nameByCode[c]).trim();
  return String(fallback || c).trim();
}

const ACCESSORY_SPECS = [
  { hasKey: 'has_crown', codeKey: 'crown_model', label: 'כתר' },
  { hasKey: 'has_crown_rimmonim', codeKey: 'crown_rimmonim_model', label: 'כתר-רימונים' },
  { hasKey: 'has_rimmonim', codeKey: 'rimmonim_model', label: 'רימונים' },
  { hasKey: 'has_coat', codeKey: 'coat_model', label: 'מעיל' },
  { hasKey: 'has_breastplate', codeKey: 'breastplate_model', label: 'טס' },
  { hasKey: 'has_pointer', codeKey: 'pointer_model', label: 'יד' },
];

/**
 * First selected accessory when there is no main עץ חיים model.
 */
function primaryAccessory(item, nameByCode = {}) {
  if (!item) return null;
  for (const { hasKey, codeKey, label } of ACCESSORY_SPECS) {
    const code = String(item[codeKey] || '').trim();
    // Strict live checkbox — ignore leftover model codes when unchecked.
    if (item[hasKey] !== true || !code) continue;
    const name = nameForCode(code, nameByCode);
    if (!name) continue;
    return { label, name, code };
  }
  return null;
}

function formatAccessoryLine(item, nameByCode = {}) {
  if (!item) return '';
  const mainCode = String(item.model_code || item.model || '').trim();
  const primary = !mainCode ? primaryAccessory(item, nameByCode) : null;

  const parts = [];
  for (const { hasKey, codeKey, label } of ACCESSORY_SPECS) {
    if (item[hasKey] !== true) continue;
    const code = String(item[codeKey] || '').trim();
    if (!code || (mainCode && code === mainCode)) continue;
    if (primary && primary.code && code === primary.code) continue;
    const name = nameForCode(code, nameByCode);
    if (name) parts.push(`${label}- ${name}`);
  }
  return parts.join(', ');
}

/**
 * Model name for email / PDF «דגם» field — main עץ חיים only.
 * No accessory fallback; empty when no main model (crown-only / blank order).
 */
function mainModelName(item, nameByCode = {}) {
  if (!hasMainModel(item)) return '';
  const code = String(item.model || item.model_code || '').trim();
  return nameForCode(code, nameByCode, item.model_name) || '';
}

/**
 * Accessories line for email body — only currently checked accessories.
 * Same-model accessories: label only. Different model: "כתר- מיוחד".
 */
function formatEmailAccessoryLine(item, nameByCode = {}) {
  if (!item) return '';
  const mainCode = String(item.model_code || item.model || '').trim();
  const parts = [];

  if (mainCode) parts.push('עץ חיים');

  for (const { hasKey, codeKey, label } of ACCESSORY_SPECS) {
    if (item[hasKey] !== true) continue;

    const code = String(item[codeKey] || '').trim();
    const effectiveCode = code || mainCode;

    if (mainCode && effectiveCode && effectiveCode === mainCode) {
      parts.push(label);
      continue;
    }

    if (!effectiveCode) {
      parts.push(label);
      continue;
    }

    const name = nameForCode(effectiveCode, nameByCode);
    parts.push(name ? `${label}- ${name}` : label);
  }

  return parts.join(', ');
}

module.exports = {
  hasMainModel,
  primaryAccessory,
  formatAccessoryLine,
  formatEmailAccessoryLine,
  mainModelName,
};
