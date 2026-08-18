/** Default plate diameter when none is selected (size 12). */
export const DEFAULT_PLATE_DIAMETER = 12;

/** Size 16 supports crown only — no עץ חיים main model. */
export const SIZE_16_ETZ_CHAIM_CLEARED_NOTE =
  'במידה 16 קיים רק כתר, עץ חיים יש עד 15';

/** Numeric plate diameter shown to the user (e.g. 9, 7.5). */
export function plateDiameterNumber(size) {
  if (!size) return null;

  const fromDb = Number(size.diameter_mm);
  if (Number.isFinite(fromDb) && fromDb > 0) return fromDb;

  const fromCode = Number(String(size.size_code || '').trim());
  if (Number.isFinite(fromCode) && fromCode > 0) return fromCode;

  const fromName = String(size.size_name || '').match(/([\d.]+)/);
  return fromName ? Number(fromName[1]) : null;
}

/** True when plate size is 16 (crown-only; no main עץ חיים). */
export function isCrownOnlyPlateSize(sizeOrItem) {
  if (!sizeOrItem) return false;
  const code = String(sizeOrItem.size_code || '').trim();
  if (code === '16') return true;
  const n = plateDiameterNumber(sizeOrItem);
  if (n != null && Math.abs(n - 16) < 0.001) return true;
  const plate = Number(sizeOrItem.plate_diameter);
  return Number.isFinite(plate) && Math.abs(plate - 16) < 0.001;
}

export function findSizeByPlateDiameter(sizes, plateDiameter) {
  const target = Number(plateDiameter);
  if (!Number.isFinite(target) || target <= 0) return null;
  return (
    sizes.find((s) => {
      const n = plateDiameterNumber(s);
      return n != null && Math.abs(n - target) < 0.001;
    }) || null
  );
}

/** plate_diameter wins over stale size_code; default size 12. */
export function resolveProductSizeRow(sizes, { plate_diameter, size_code } = {}) {
  if (!sizes?.length) return null;

  if (plate_diameter != null && plate_diameter !== '') {
    const byPlate = findSizeByPlateDiameter(sizes, plate_diameter);
    if (byPlate) return byPlate;
  }

  if (size_code) {
    const code = String(size_code).trim();
    const byCode = sizes.find((s) => s.size_code === code);
    if (byCode) return byCode;
  }

  return (
    findSizeByPlateDiameter(sizes, DEFAULT_PLATE_DIAMETER)
    || sizes.find((s) => s.size_code === '12')
    || null
  );
}

export function syncItemSizeFields(item, sizes) {
  if (!item || !sizes?.length) return item;
  const row = resolveProductSizeRow(sizes, {
    plate_diameter: item.plate_diameter,
    size_code: item.size_code,
  });
  if (!row) return item;
  const n = plateDiameterNumber(row);
  return {
    ...item,
    size_code: row.size_code,
    plate_diameter: n != null ? n : item.plate_diameter,
  };
}

export function formatPlateDiameterLabel(size) {
  const n = plateDiameterNumber(size);
  return n != null ? String(n) : size?.size_name || '';
}

export function formatPlateDiameterDisplay(value) {
  if (value == null || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value);
  return String(n);
}
