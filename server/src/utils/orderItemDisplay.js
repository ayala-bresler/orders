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
    const checked = item[hasKey] === true || Boolean(code);
    if (!checked || !code) continue;
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
 * Accessories line for email body only.
 * Same-model accessories: label only (עץ חיים, טס, …).
 * Different model: "יד- שעונים", "כתר- מיוחד".
 */
function formatEmailAccessoryLine(item, nameByCode = {}) {
  if (!item) return '';
  const mainCode = String(item.model_code || item.model || '').trim();
  const parts = [];

  if (mainCode) parts.push('עץ חיים');

  const refCode = mainCode || primaryAccessory(item, nameByCode)?.code || '';
  const specs = [
    { hasKey: 'has_crown', codeKey: 'crown_model', label: 'כתר' },
    { hasKey: 'has_breastplate', codeKey: 'breastplate_model', label: 'טס' },
    { hasKey: 'has_pointer', codeKey: 'pointer_model', label: 'יד' },
  ];

  for (const { hasKey, codeKey, label } of specs) {
    const code = String(item[codeKey] || '').trim();
    const checked = item[hasKey] === true || Boolean(code);
    if (!checked) continue;

    const effectiveCode = code || mainCode;
    if (!effectiveCode) {
      parts.push(label);
      continue;
    }

    if (refCode && effectiveCode === refCode) {
      parts.push(label);
      continue;
    }

    const name = nameForCode(effectiveCode, nameByCode);
    parts.push(name ? `${label}- ${name}` : label);
  }

  return parts.join(', ');
}

/**
 * Model name for email body — identical to the order-form PDF field:
 * lookup by model_code in `models.model_name`, with no string chopping.
 * Crown / accessory-only orders use that accessory's selected model code.
 */
function mainModelName(item, nameByCode = {}) {
  if (hasMainModel(item)) {
    const code = String(item.model || item.model_code || '').trim();
    return nameForCode(code, nameByCode, item.model_name) || '—';
  }

  const acc = primaryAccessory(item, nameByCode);
  if (acc?.name) return acc.name;

  const fallback = String(item?.model_name || '').trim();
  return fallback || '—';
}

module.exports = {
  hasMainModel,
  primaryAccessory,
  formatAccessoryLine,
  formatEmailAccessoryLine,
  mainModelName,
};
