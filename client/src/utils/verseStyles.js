/** Client mirror of server/src/config/verseStyles.js (verse editor controls). */

export const MAX_FONT_SIZE_PX = 16;
export const BASE_FONT_SIZE_PX = MAX_FONT_SIZE_PX;
export const MIN_FONT_SIZE_PX = Math.round(MAX_FONT_SIZE_PX * 0.55 * 10) / 10;
export const LETTER_SPACING_STEP_EM = 0.01;
export const LETTER_SPACING_MIN_EM = -0.05;
export const LETTER_SPACING_MAX_EM = 0.2;

/** Shared picker sizes — available for every template (including 16). */
export const FONT_SIZE_POPUP_OPTIONS = (() => {
  const out = [];
  for (let px = MAX_FONT_SIZE_PX; px >= 9; px -= 1) out.push(px);
  out.push(MIN_FONT_SIZE_PX);
  return out;
})();

function round1(n) {
  return Math.round(Number(n) * 10) / 10;
}

function round3(n) {
  return Math.round(Number(n) * 1000) / 1000;
}

function clampFontSize(n, baseFontSizePx = BASE_FONT_SIZE_PX) {
  const fallback = Number.isFinite(Number(baseFontSizePx))
    ? round1(baseFontSizePx)
    : BASE_FONT_SIZE_PX;
  if (!Number.isFinite(Number(n))) return fallback;
  return Math.max(MIN_FONT_SIZE_PX, Math.min(MAX_FONT_SIZE_PX, round1(n)));
}

export function emptyStyle(baseFontSizePx = BASE_FONT_SIZE_PX) {
  return { fontSizePx: clampFontSize(baseFontSizePx, baseFontSizePx), letterSpacingEm: 0 };
}

export function normalizeStyleEntry(raw, baseFontSizePx = BASE_FONT_SIZE_PX) {
  const base = clampFontSize(baseFontSizePx, baseFontSizePx);
  if (raw == null) return emptyStyle(base);

  let fontSizePx = base;
  let letterSpacingEm = 0;

  if (typeof raw === 'number') {
    const n = Number(raw);
    if (Number.isFinite(n) && n < 0.999) {
      fontSizePx = clampFontSize(base * Math.max(0.55, Math.min(1, n)), base);
    }
    return { fontSizePx, letterSpacingEm };
  }

  if (typeof raw === 'object' && !Array.isArray(raw)) {
    if (raw.fontSizePx != null) {
      fontSizePx = clampFontSize(raw.fontSizePx, base);
    } else if (raw.fontSizePt != null) {
      fontSizePx = clampFontSize(Number(raw.fontSizePt) / 0.75, base);
    } else if (raw.fontScale != null) {
      const n = Number(raw.fontScale);
      if (Number.isFinite(n) && n < 0.999) {
        fontSizePx = clampFontSize(base * Math.max(0.55, Math.min(1, n)), base);
      }
    }
    if (raw.letterSpacingEm != null) {
      const n = Number(raw.letterSpacingEm);
      if (Number.isFinite(n)) {
        letterSpacingEm = Math.max(LETTER_SPACING_MIN_EM, Math.min(LETTER_SPACING_MAX_EM, round3(n)));
      }
    }
    return { fontSizePx, letterSpacingEm };
  }

  return emptyStyle(base);
}

export function styleForKey(stylesMap, key, baseFontSizePx = BASE_FONT_SIZE_PX) {
  return normalizeStyleEntry(stylesMap && stylesMap[key], baseFontSizePx);
}

/** Persist override only when different from the SVG file base. */
export function compactStylePatch(style, baseFontSizePx = BASE_FONT_SIZE_PX) {
  const base = clampFontSize(baseFontSizePx, baseFontSizePx);
  const s = normalizeStyleEntry(style, base);
  const out = {};
  if (Math.abs(s.fontSizePx - base) > 0.01) out.fontSizePx = round1(s.fontSizePx);
  if (Math.abs(s.letterSpacingEm) > 0.0001) out.letterSpacingEm = round3(s.letterSpacingEm);
  return out;
}

/** Popup list: standard sizes + the file’s base if missing from the list. */
export function fontSizePopupOptions(baseFontSizePx) {
  const set = new Set(FONT_SIZE_POPUP_OPTIONS);
  if (baseFontSizePx != null && Number.isFinite(Number(baseFontSizePx))) {
    set.add(round1(baseFontSizePx));
  }
  return [...set].sort((a, b) => b - a);
}

export function adjustLetterSpacing(current, delta) {
  const next = round3(Number(current) + delta);
  return Math.max(LETTER_SPACING_MIN_EM, Math.min(LETTER_SPACING_MAX_EM, next));
}

export function stylesEqual(a, b, baseFontSizePx = BASE_FONT_SIZE_PX) {
  const sa = normalizeStyleEntry(a, baseFontSizePx);
  const sb = normalizeStyleEntry(b, baseFontSizePx);
  return sa.fontSizePx === sb.fontSizePx && sa.letterSpacingEm === sb.letterSpacingEm;
}
