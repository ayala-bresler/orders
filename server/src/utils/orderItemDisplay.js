'use strict';

function formatAccessoryLine(item, nameByCode = {}) {
  if (!item) return '';
  const mainCode = String(item.model_code || item.model || '').trim();
  const specs = [
    { codeKey: 'crown_model', label: 'כתר' },
    { codeKey: 'breastplate_model', label: 'טס' },
    { codeKey: 'pointer_model', label: 'יד' },
  ];

  const parts = [];
  for (const { codeKey, label } of specs) {
    const code = String(item[codeKey] || '').trim();
    if (!code || (mainCode && code === mainCode)) continue;
    const name = String(nameByCode[code] || code).trim();
    if (name) parts.push(`${label}- ${name}`);
  }
  return parts.join(', ');
}

function mainModelName(item, nameByCode = {}) {
  const code = String(item?.model || item?.model_code || '').trim();
  if (code && nameByCode[code]) return nameByCode[code];
  return item?.model_name || item?.product_name || code || '—';
}

module.exports = {
  formatAccessoryLine,
  mainModelName,
};
