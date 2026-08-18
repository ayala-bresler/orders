/**
 * Bidirectional text helpers — Hebrew UI with correct LTR for English / numbers.
 *
 * Uses first-strong detection (Unicode Bidirectional Algorithm style) so mixed
 * content keeps word order and does not reverse English runs or digit sequences.
 */

const RTL_STRONG =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0780-\u07BF\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/;
const LTR_STRONG =
  /[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02B8\u0300-\u036F\u1E00-\u1EFF]/;
const HEBREW =
  /[\u0590-\u05FF\uFB1D-\uFB4F]/;

/** First strong character direction; empty defaults to Hebrew UI (`rtl`). */
export function detectTextDir(text, { empty = 'rtl' } = {}) {
  const s = String(text ?? '');
  if (!s.trim()) return empty;
  for (const ch of s) {
    if (RTL_STRONG.test(ch)) return 'rtl';
    if (LTR_STRONG.test(ch)) return 'ltr';
  }
  // Digits / punctuation only → LTR (order numbers, measurements, emails, etc.)
  if (/\d/.test(s)) return 'ltr';
  return empty;
}

/** True when the string is primarily left-to-right (English / numbers). */
export function isLtrText(text) {
  return detectTextDir(text) === 'ltr';
}

/**
 * Wrap free text in First Strong Isolate so host RTL contexts (lists, PDF
 * appearance streams, mixed labels) do not reorder English / digit runs.
 */
export function isolateBidiText(text) {
  const raw = String(text ?? '');
  if (!raw) return raw;
  return `\u2068${raw}\u2069`;
}

/**
 * Approximate visual left-to-right order for RTL paragraphs (matches server bake).
 */
export function visualOrderChars(text) {
  const s = String(text ?? '');
  if (!s) return [];
  if (detectTextDir(s) !== 'rtl') return [...s];

  const runs = [];
  for (const ch of s) {
    const type = HEBREW.test(ch) ? 'R' : /[A-Za-z0-9]/.test(ch) ? 'L' : 'N';
    const last = runs[runs.length - 1];
    if (last && last.type === type) last.chars.push(ch);
    else runs.push({ type, chars: [ch] });
  }

  const resolved = runs.map((r) => ({
    type: r.type,
    chars: r.type === 'R' ? [...r.chars].reverse() : r.chars,
  }));
  resolved.reverse();
  return resolved.flatMap((r) => r.chars);
}

/** Props for free-text inputs / textareas. */
export function bidiInputProps(value, { empty = 'rtl' } = {}) {
  return {
    dir: detectTextDir(value, { empty }),
    className: 'bidi-input',
  };
}

/** Props for read-only display of user-entered free text. */
export function bidiTextProps(value, { empty = 'rtl' } = {}) {
  return {
    dir: detectTextDir(value, { empty }),
    className: 'bidi-text',
  };
}
