'use strict';

/**
 * Verse font sizes are SVG user units (px in templates).
 * Each field’s default is the size authored in the SVG file.
 * Users may pick any size from MIN…MAX (including 16) for every template.
 */
const MAX_FONT_SIZE_PX = 16;
const BASE_FONT_SIZE_PX = MAX_FONT_SIZE_PX; // legacy alias / fallback when file size unknown
const MIN_FONT_SIZE_PX = Math.round(MAX_FONT_SIZE_PX * 0.55 * 10) / 10;
const LETTER_SPACING_STEP_EM = 0.01;
const LETTER_SPACING_MIN_EM = -0.05;
const LETTER_SPACING_MAX_EM = 0.2;

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

function emptyStyle(baseFontSizePx = BASE_FONT_SIZE_PX) {
  return { fontSizePx: clampFontSize(baseFontSizePx, baseFontSizePx), letterSpacingEm: 0 };
}

/**
 * Normalize one stored style entry.
 * @param {*} raw
 * @param {number} [baseFontSizePx] size from the SVG file for this field
 */
function normalizeStyleEntry(raw, baseFontSizePx = BASE_FONT_SIZE_PX) {
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

/** Compact map for DB/API — omit sizes that match the field’s file base. */
function compactStylesMap(input, baseByKey = {}) {
  const out = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  for (const [key, raw] of Object.entries(input)) {
    const base = baseByKey[key] ?? BASE_FONT_SIZE_PX;
    const style = normalizeStyleEntry(raw, base);
    const entry = {};
    if (Math.abs(style.fontSizePx - base) > 0.01) entry.fontSizePx = round1(style.fontSizePx);
    if (Math.abs(style.letterSpacingEm) > 0.0001) {
      entry.letterSpacingEm = round3(style.letterSpacingEm);
    }
    if (Object.keys(entry).length) out[key] = entry;
  }
  return out;
}

function validateStylesMap(input, fieldByKey) {
  const styles = {};
  const errors = [];
  if (input == null) return { styles, errors };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { styles, errors: ['fontScales must be an object.'] };
  }
  for (const [key, raw] of Object.entries(input)) {
    if (!fieldByKey[key]) {
      errors.push(`Unknown font scale key "${key}".`);
      continue;
    }
    const base = fieldByKey[key].fontSizePx ?? BASE_FONT_SIZE_PX;
    const entry = {};
    if (typeof raw === 'number') {
      const n = Number(raw);
      if (!Number.isFinite(n) || n < 0.55 || n > 1) {
        errors.push(`Font scale for "${key}" must be between 0.55 and 1.`);
        continue;
      }
      if (n < 0.999) {
        const px = clampFontSize(base * n, base);
        if (Math.abs(px - base) > 0.01) entry.fontSizePx = px;
      }
    } else if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
      if (raw.fontSizePx != null) {
        const n = Number(raw.fontSizePx);
        if (!Number.isFinite(n) || n < MIN_FONT_SIZE_PX || n > MAX_FONT_SIZE_PX) {
          errors.push(
            `Font size for "${key}" must be between ${MIN_FONT_SIZE_PX} and ${MAX_FONT_SIZE_PX} px.`
          );
          continue;
        }
        const px = clampFontSize(n, base);
        if (Math.abs(px - base) > 0.01) entry.fontSizePx = px;
      } else if (raw.fontSizePt != null) {
        const asPx = round1(Number(raw.fontSizePt) / 0.75);
        if (!Number.isFinite(asPx) || asPx < MIN_FONT_SIZE_PX || asPx > MAX_FONT_SIZE_PX) {
          errors.push(
            `Font size for "${key}" must be between ${MIN_FONT_SIZE_PX} and ${MAX_FONT_SIZE_PX} px.`
          );
          continue;
        }
        const px = clampFontSize(asPx, base);
        if (Math.abs(px - base) > 0.01) entry.fontSizePx = px;
      } else if (raw.fontScale != null) {
        const n = Number(raw.fontScale);
        if (!Number.isFinite(n) || n < 0.55 || n > 1) {
          errors.push(`Font scale for "${key}" must be between 0.55 and 1.`);
          continue;
        }
        if (n < 0.999) {
          const px = clampFontSize(base * n, base);
          if (Math.abs(px - base) > 0.01) entry.fontSizePx = px;
        }
      }
      if (raw.letterSpacingEm != null) {
        const n = Number(raw.letterSpacingEm);
        if (!Number.isFinite(n) || n < LETTER_SPACING_MIN_EM || n > LETTER_SPACING_MAX_EM) {
          errors.push(
            `Letter spacing for "${key}" must be between ${LETTER_SPACING_MIN_EM} and ${LETTER_SPACING_MAX_EM} em.`
          );
          continue;
        }
        if (Math.abs(n) > 0.0001) entry.letterSpacingEm = round3(n);
      }
    } else {
      errors.push(`Style for "${key}" must be a number or object.`);
      continue;
    }
    if (Object.keys(entry).length) styles[key] = entry;
  }
  return { styles, errors };
}

function styleForKey(stylesMap, key, baseFontSizePx = BASE_FONT_SIZE_PX) {
  return normalizeStyleEntry(stylesMap && stylesMap[key], baseFontSizePx);
}

function stylesEqual(a, b, baseFontSizePx = BASE_FONT_SIZE_PX) {
  const sa = normalizeStyleEntry(a, baseFontSizePx);
  const sb = normalizeStyleEntry(b, baseFontSizePx);
  return sa.fontSizePx === sb.fontSizePx && sa.letterSpacingEm === sb.letterSpacingEm;
}

module.exports = {
  MAX_FONT_SIZE_PX,
  BASE_FONT_SIZE_PX,
  MIN_FONT_SIZE_PX,
  LETTER_SPACING_STEP_EM,
  LETTER_SPACING_MIN_EM,
  LETTER_SPACING_MAX_EM,
  normalizeStyleEntry,
  compactStylesMap,
  validateStylesMap,
  styleForKey,
  stylesEqual,
};
