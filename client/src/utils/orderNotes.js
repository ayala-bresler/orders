/** Matches the 6 notes AcroForm fields in the order PDF. */
export const MAX_ORDER_NOTE_LINES = 6;

/**
 * Usable width (pt) of each notes field in order-form.pdf at 12pt NotoSansHebrew.
 * Field rect width is ~262.7; leave a small margin so text is never clipped.
 */
export const MAX_ORDER_NOTE_LINE_WIDTH = 250;

/**
 * Approximate glyph advances for NotoSansHebrew at 12pt (same font used in PDF export).
 * Keeps typed notes within what will actually appear on the form.
 */
function charAdvance(ch) {
  const cp = ch.codePointAt(0);
  if (cp === 0x20) return 3.24;
  if (cp >= 0x30 && cp <= 0x39) return 6.84;
  if (cp >= 0x0590 && cp <= 0x05ff) return 6.16;
  if (cp >= 0x41 && cp <= 0x5a) return 7.16;
  if (cp >= 0x61 && cp <= 0x7a) return 5.8;
  if (cp < 0x80) return 3.5;
  return 6.5;
}

export function clampOrderNoteLine(line, maxWidth = MAX_ORDER_NOTE_LINE_WIDTH) {
  const raw = String(line ?? '');
  let width = 0;
  let out = '';
  for (const ch of Array.from(raw)) {
    const adv = charAdvance(ch);
    if (width + adv > maxWidth) break;
    width += adv;
    out += ch;
  }
  return out;
}

/** Keep at most `maxLines` note lines, each within PDF field width. */
export function clampOrderNotes(value, maxLines = MAX_ORDER_NOTE_LINES) {
  const lines = String(value ?? '')
    .split('\n')
    .slice(0, maxLines)
    .map((line) => clampOrderNoteLine(line));
  return lines.join('\n');
}

export function orderNoteLineCount(value) {
  const raw = String(value ?? '');
  if (!raw) return 1;
  return raw.split('\n').length;
}
