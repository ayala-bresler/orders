/** Normalize API values to YYYY-MM-DD for date inputs. */
export function toDateOnlyString(val) {
  if (val == null || val === '') return '';
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return '';
    const y = val.getFullYear();
    const m = String(val.getMonth() + 1).padStart(2, '0');
    const d = String(val.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const s = String(val);
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Hebrew display date DD/MM/YYYY. */
export function formatHebrewDate(val) {
  const iso = toDateOnlyString(val);
  if (!iso) return '';
  const [y, m, day] = iso.split('-');
  return `${day}/${m}/${y}`;
}
