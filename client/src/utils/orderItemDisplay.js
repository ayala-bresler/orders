/** True when the line has a main עץ חיים model code. */
export function hasMainModel(item) {
  return Boolean(String(item?.model_code || item?.model || '').trim());
}

/**
 * First selected accessory (כתר / כתר-רימונים / רימונים / טס / יד) — used when there is no main model.
 */
export function primaryAccessory(item) {
  if (!item) return null;
  const specs = [
    { hasKey: 'has_crown', codeKey: 'crown_model', nameKey: 'crown_model_name', label: 'כתר' },
    { hasKey: 'has_crown_rimmonim', codeKey: 'crown_rimmonim_model', nameKey: 'crown_rimmonim_model_name', label: 'כתר-רימונים' },
    { hasKey: 'has_rimmonim', codeKey: 'rimmonim_model', nameKey: 'rimmonim_model_name', label: 'רימונים' },
    { hasKey: 'has_coat', codeKey: 'coat_model', nameKey: 'coat_model_name', label: 'מעיל' },
    { hasKey: 'has_breastplate', codeKey: 'breastplate_model', nameKey: 'breastplate_model_name', label: 'טס' },
    { hasKey: 'has_pointer', codeKey: 'pointer_model', nameKey: 'pointer_model_name', label: 'יד' },
  ];
  for (const { hasKey, codeKey, nameKey, label } of specs) {
    const code = String(item[codeKey] || '').trim();
    const checked = item[hasKey] === true || Boolean(code);
    if (!checked) continue;
    const name = String(item[nameKey] || code).trim();
    if (!name && !code) continue;
    return { label, name: name || code, code };
  }
  return null;
}

/** Plate diameter for display (e.g. "12"). */
export function formatItemPlateDiameter(item) {
  if (item?.plate_diameter == null || item.plate_diameter === '') return '';
  const n = Number(item.plate_diameter);
  if (!Number.isFinite(n) || n <= 0) return String(item.plate_diameter).trim();
  return String(n);
}

/**
 * Primary display name for an order line.
 * With עץ חיים: model name. Without: "כתר · {name}" (or other accessory) — never bare "עץ חיים".
 * Always appends plate diameter when set (also for כתר-only orders).
 */
export function mainModelName(item) {
  let base;
  if (hasMainModel(item)) {
    base = item?.model_name || item?.product_name || item?.product_code || '—';
  } else {
    const acc = primaryAccessory(item);
    if (acc) base = `${acc.label} · ${acc.name}`;
    else {
      const fallback = String(item?.model_name || '').trim();
      base = fallback || '—';
    }
  }
  const plate = formatItemPlateDiameter(item);
  if (plate && base !== '—') return `${base} · ${plate}`;
  if (plate) return plate;
  return base;
}

/** Model code used for product photos (crown/rimmonim/tas/yad when no main). */
export function orderItemImageModelCode(item) {
  if (hasMainModel(item)) {
    return String(item.model_code || item.model || '').trim();
  }
  return primaryAccessory(item)?.code || '';
}

/**
 * Accessory models that differ from the main model, e.g. "כתר- רשת, יד- שעונים".
 * When there is no main model, skips the accessory already used as the primary label.
 */
export function formatAccessoryLine(item) {
  if (!item) return '';
  const mainCode = String(item.model_code || item.model || '').trim();
  const primary = !mainCode ? primaryAccessory(item) : null;
  const specs = [
    { codeKey: 'crown_model', nameKey: 'crown_model_name', label: 'כתר' },
    { codeKey: 'crown_rimmonim_model', nameKey: 'crown_rimmonim_model_name', label: 'כתר-רימונים' },
    { codeKey: 'rimmonim_model', nameKey: 'rimmonim_model_name', label: 'רימונים' },
    { codeKey: 'coat_model', nameKey: 'coat_model_name', label: 'מעיל' },
    { codeKey: 'breastplate_model', nameKey: 'breastplate_model_name', label: 'טס' },
    { codeKey: 'pointer_model', nameKey: 'pointer_model_name', label: 'יד' },
  ];

  const parts = [];
  for (const { codeKey, nameKey, label } of specs) {
    const code = String(item[codeKey] || '').trim();
    if (!code || (mainCode && code === mainCode)) continue;
    if (primary && primary.code && code === primary.code) continue;
    const name = String(item[nameKey] || code).trim();
    if (name) parts.push(`${label}- ${name}`);
  }
  return parts.join(', ');
}
