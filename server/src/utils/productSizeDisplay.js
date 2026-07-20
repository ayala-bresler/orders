'use strict';

/** Default plate diameter when none is selected (size 12). */
const DEFAULT_PLATE_DIAMETER = 12;

/** Numeric plate diameter shown to the user (e.g. 9, 7.5). */
function plateDiameterNumber(size) {
  if (!size) return null;

  const fromDb = Number(size.diameter_mm);
  if (Number.isFinite(fromDb) && fromDb > 0) return fromDb;

  const fromCode = Number(String(size.size_code || '').trim());
  if (Number.isFinite(fromCode) && fromCode > 0) return fromCode;

  const fromName = String(size.size_name || '').match(/([\d.]+)/);
  return fromName ? Number(fromName[1]) : null;
}

function findSizeByPlateDiameter(sizes, plateDiameter) {
  const target = Number(plateDiameter);
  if (!Number.isFinite(target) || target <= 0) return null;
  return (
    sizes.find((s) => {
      const n = plateDiameterNumber(s);
      return n != null && Math.abs(n - target) < 0.001;
    }) || null
  );
}

/**
 * Resolve product_sizes row — plate_diameter wins over stale size_code.
 * Falls back to default size 12 when nothing matches.
 */
function resolveProductSizeRow(sizes, { plate_diameter, size_code } = {}) {
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

module.exports = {
  DEFAULT_PLATE_DIAMETER,
  plateDiameterNumber,
  findSizeByPlateDiameter,
  resolveProductSizeRow,
};
