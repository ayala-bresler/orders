'use strict';

/**
 * Bidirectional helpers for PDF / SVG / server-side rendering.
 * Keep in sync with client/src/utils/textDirection.js (client uses a lighter approx).
 */

const bidiFactory = require('bidi-js');

const bidi = bidiFactory();

const RTL_STRONG =
  /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0780-\u07BF\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFC]/;
const LTR_STRONG =
  /[A-Za-z\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u02B8\u0300-\u036F\u1E00-\u1EFF]/;

function detectTextDir(text, { empty = 'rtl' } = {}) {
  const s = String(text ?? '');
  if (!s.trim()) return empty;
  for (const ch of s) {
    if (RTL_STRONG.test(ch)) return 'rtl';
    if (LTR_STRONG.test(ch)) return 'ltr';
  }
  if (/\d/.test(s)) return 'ltr';
  return empty;
}

/**
 * Visual left-to-right glyph order (Unicode Bidirectional Algorithm).
 * pdf-lib paints characters LTR with no BiDi — pass this string to setText /
 * updateAppearances (and to SVG path glyph walks).
 */
function visualOrderString(text, { direction } = {}) {
  const raw = String(text ?? '');
  if (!raw) return '';
  const dir = direction || detectTextDir(raw);
  const levels = bidi.getEmbeddingLevels(raw, dir === 'ltr' ? 'ltr' : 'rtl');
  return bidi.getReorderedString(raw, levels);
}

function visualOrderChars(text, opts) {
  return [...visualOrderString(text, opts)];
}

/**
 * Prepare logical user text for pdf-lib AcroForm appearance streams.
 * forceDir: 'ltr' for pure numbers / measurements (no reorder).
 */
function preparePdfAppearanceText(text, { forceDir } = {}) {
  const raw = String(text ?? '');
  if (!raw) return '';
  if (forceDir === 'ltr') return raw;
  return visualOrderString(raw, { direction: forceDir || detectTextDir(raw) });
}

module.exports = {
  detectTextDir,
  visualOrderString,
  visualOrderChars,
  preparePdfAppearanceText,
};
