/** Main עץ חיים model label for an order line. */
export function mainModelName(item) {
  return item?.model_name || item?.product_name || item?.product_code || '—';
}

/**
 * Accessory models that differ from the main model, e.g. "כתר- רשת, יד- שעונים".
 */
export function formatAccessoryLine(item) {
  if (!item) return '';
  const mainCode = String(item.model_code || item.model || '').trim();
  const specs = [
    { codeKey: 'crown_model', nameKey: 'crown_model_name', label: 'כתר' },
    { codeKey: 'breastplate_model', nameKey: 'breastplate_model_name', label: 'טס' },
    { codeKey: 'pointer_model', nameKey: 'pointer_model_name', label: 'יד' },
  ];

  const parts = [];
  for (const { codeKey, nameKey, label } of specs) {
    const code = String(item[codeKey] || '').trim();
    if (!code || (mainCode && code === mainCode)) continue;
    const name = String(item[nameKey] || code).trim();
    if (name) parts.push(`${label}- ${name}`);
  }
  return parts.join(', ');
}
