'use strict';

/**
 * Bidirectional helpers for PDF / SVG / server-side rendering.
 * Keep detectTextDir in sync with client/src/utils/textDirection.js
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
 * Used for SVG textPath / glyph bake — NOT for pdf-lib AcroForm fields.
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
 * pdf-lib AcroForm appearances typically keep Hebrew readable in logical order
 * (with right alignment) but flip embedded English / digit runs.
 * Reverse only those runs so numbers and Latin read LTR; leave Hebrew as typed.
 */
function compensateEmbeddedLtrRuns(text) {
  return String(text ?? '').replace(
    /[A-Za-z0-9]+(?:[./\-:_][A-Za-z0-9]+)*/g,
    (run) => Array.from(run).reverse().join('')
  );
}

/**
 * Prepare logical user text for pdf-lib AcroForm appearance streams.
 * - forceDir 'ltr': measurements / pure English — no change
 * - forceDir 'rtl' or Hebrew base: keep Hebrew logical; fix embedded LTR runs
 */
function preparePdfAppearanceText(text, { forceDir } = {}) {
  const raw = String(text ?? '');
  if (!raw) return '';
  const dir = forceDir || detectTextDir(raw);
  if (dir === 'ltr') return raw;
  return compensateEmbeddedLtrRuns(raw);
}

module.exports = {
  detectTextDir,
  visualOrderString,
  visualOrderChars,
  compensateEmbeddedLtrRuns,
  preparePdfAppearanceText,
};
