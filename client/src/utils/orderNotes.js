export const MAX_ORDER_NOTE_LINES = 6;

/** Keep at most `maxLines` note lines (matches PDF export fields). */
export function clampOrderNotes(value, maxLines = MAX_ORDER_NOTE_LINES) {
  const lines = String(value ?? '').split('\n');
  if (lines.length <= maxLines) return String(value ?? '');
  return lines.slice(0, maxLines).join('\n');
}

export function orderNoteLineCount(value) {
  const raw = String(value ?? '');
  if (!raw) return 1;
  return raw.split('\n').length;
}
