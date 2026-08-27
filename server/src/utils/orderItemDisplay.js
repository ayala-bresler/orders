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

/**
 * First selected accessory (כתר / טס / יד) when there is no main עץ חיים model.
 */
function primaryAccessory(item, nameByCode = {}) {
  if (!item) return null;
  const specs = [
    { hasKey: 'has_crown', codeKey: 'crown_model', label: 'כתר' },
    { hasKey: 'has_breastplate', codeKey: 'breastplate_model', label: 'טס' },
    { hasKey: 'has_pointer', codeKey: 'pointer_model', label: 'יד' },
  ];
  for (const { hasKey, codeKey, label } of specs) {
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
  const specs = [
    { codeKey: 'crown_model', label: 'כתר' },
    { codeKey: 'breastplate_model', label: 'טס' },
    { codeKey: 'pointer_model', label: 'יד' },
  ];

  const parts = [];
  for (const { codeKey, label } of specs) {
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
 * Accessories line for email body — only currently checked accessories
 * (same rule as the order-form PDF: has_crown / has_breastplate / has_pointer).
 * Stale *_model values from a previous selection are ignored when unchecked.
 * Same-model accessories: label only. Different model: "כתר- מיוחד".
 */
function formatEmailAccessoryLine(item, nameByCode = {}) {
  if (!item) return '';
  const mainCode = String(item.model_code || item.model || '').trim();
  const parts = [];

  if (mainCode) parts.push('עץ חיים');

  const specs = [
    { hasKey: 'has_crown', codeKey: 'crown_model', label: 'כתר' },
    { hasKey: 'has_breastplate', codeKey: 'breastplate_model', label: 'טס' },
    { hasKey: 'has_pointer', codeKey: 'pointer_model', label: 'יד' },
  ];

  for (const { hasKey, codeKey, label } of specs) {
    // Strict: only the live checkbox — do not infer from leftover model codes.
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
