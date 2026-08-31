import { normalizeModelCode } from './modelScopes.js';

/** True when the line has a main עץ חיים model code. */
export function hasMainModel(item) {
  return Boolean(String(item?.model_code || item?.model || '').trim());
}

/** Accessory slots in display order (כתר → … → יד). */
export const ACCESSORY_SPECS = [
  { hasKey: 'has_crown', codeKey: 'crown_model', nameKey: 'crown_model_name', label: 'כתר' },
  {
    hasKey: 'has_crown_rimmonim',
    codeKey: 'crown_rimmonim_model',
    nameKey: 'crown_rimmonim_model_name',
    label: 'כתר-רימונים',
  },
  { hasKey: 'has_rimmonim', codeKey: 'rimmonim_model', nameKey: 'rimmonim_model_name', label: 'רימונים' },
  { hasKey: 'has_coat', codeKey: 'coat_model', nameKey: 'coat_model_name', label: 'מעיל' },
  {
    hasKey: 'has_breastplate',
    codeKey: 'breastplate_model',
    nameKey: 'breastplate_model_name',
    label: 'טס',
  },
  { hasKey: 'has_pointer', codeKey: 'pointer_model', nameKey: 'pointer_model_name', label: 'יד' },
];

/**
 * Selected products on a line (עץ חיים first when present, then accessories).
 * @returns {Array<{ label: string, code: string, name: string }>}
 */
export function collectItemProducts(item) {
  if (!item) return [];
  const out = [];

  if (hasMainModel(item)) {
    const code = String(item.model_code || item.model || '').trim();
    const name = String(item.model_name || code).trim();
    out.push({ label: 'עץ חיים', code, name: name || code });
  }

  for (const { hasKey, codeKey, nameKey, label } of ACCESSORY_SPECS) {
    const code = String(item[codeKey] || '').trim();
    const checked = item[hasKey] === true || Boolean(code);
    if (!checked || !code) continue;
    const name = String(item[nameKey] || code).trim();
    out.push({ label, code, name: name || code });
  }

  return out;
}

/**
 * First selected accessory (כתר / כתר-רימונים / …) — used when there is no main model.
 */
export function primaryAccessory(item) {
  const products = collectItemProducts(item).filter((p) => p.label !== 'עץ חיים');
  return products[0] || null;
}

/** Plate diameter for display (e.g. "12"). */
export function formatItemPlateDiameter(item) {
  if (item?.plate_diameter == null || item.plate_diameter === '') return '';
  const n = Number(item.plate_diameter);
  if (!Number.isFinite(n) || n <= 0) return String(item.plate_diameter).trim();
  return String(n);
}

/**
 * Most frequent accessory/main model code on the line (ties → first in display order).
 */
export function mostFrequentModelCode(item) {
  const products = collectItemProducts(item);
  if (!products.length) return '';

  const counts = new Map();
  for (const p of products) {
    const key = normalizeModelCode(p.code) || p.code;
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  if (!counts.size) return '';

  let bestKey = '';
  let bestCount = -1;
  for (const p of products) {
    const key = normalizeModelCode(p.code) || p.code;
    const n = counts.get(key) || 0;
    if (n > bestCount) {
      bestCount = n;
      bestKey = key;
    }
  }
  // Prefer the raw code from the first product that matches the winning normalized key.
  const match = products.find(
    (p) => (normalizeModelCode(p.code) || p.code) === bestKey
  );
  return match?.code || bestKey;
}

/**
 * Model code used for the card photo.
 * With עץ חיים → main model. Without → most frequent model among products.
 */
export function orderItemImageModelCode(item) {
  if (hasMainModel(item)) {
    return String(item.model_code || item.model || '').trim();
  }
  return mostFrequentModelCode(item);
}

/**
 * One-line product summary vs the card image model.
 * Same as image → label only; different → "label-modelName".
 * Example: "כתר, טס-פעמונים, יד"
 */
export function formatProductSummaryLine(item, imageModelCode) {
  const products = collectItemProducts(item);
  if (!products.length) return '';

  const imageKey = normalizeModelCode(imageModelCode) || String(imageModelCode || '').trim();

  return products
    .map(({ label, code, name }) => {
      const codeKey = normalizeModelCode(code) || code;
      const sameAsImage =
        Boolean(imageKey) &&
        (codeKey === imageKey || String(name).trim() === String(imageModelCode || '').trim());
      if (sameAsImage) return label;
      const modelLabel = String(name || code).trim();
      return modelLabel ? `${label}-${modelLabel}` : label;
    })
    .join(', ');
}

/**
 * Primary display name for an order line (buttons / dialogs).
 * With עץ חיים: model name. Without: "כתר · {name}" — never bare "עץ חיים".
 * Always appends plate diameter when set.
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

/**
 * Accessory models that differ from the main model, e.g. "כתר- רשת, יד- שעונים".
 * When there is no main model, skips the accessory already used as the primary label.
 * @deprecated Prefer formatProductSummaryLine for card UI.
 */
export function formatAccessoryLine(item) {
  if (!item) return '';
  const mainCode = String(item.model_code || item.model || '').trim();
  const primary = !mainCode ? primaryAccessory(item) : null;
  const parts = [];
  for (const { codeKey, nameKey, label } of ACCESSORY_SPECS) {
    const code = String(item[codeKey] || '').trim();
    if (!code || (mainCode && code === mainCode)) continue;
    if (primary && primary.code && code === primary.code) continue;
    const name = String(item[nameKey] || code).trim();
    if (name) parts.push(`${label}- ${name}`);
  }
  return parts.join(', ');
}
