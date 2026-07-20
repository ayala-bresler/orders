'use strict';

/** Normalize DB / API values to YYYY-MM-DD (local calendar date). */
function toDateOnlyString(val) {
  if (val == null || val === '') return null;
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return null;
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val);
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Hebrew display date DD/MM/YYYY (optional short year). */
function formatHebrewDate(val, { shortYear = false } = {}) {
  const iso = toDateOnlyString(val);
  if (!iso) return '';
  const [y, m, day] = iso.split('-');
  return shortYear ? `${day}/${m}/${y.slice(-2)}` : `${day}/${m}/${y}`;
}

module.exports = { toDateOnlyString, formatHebrewDate };
