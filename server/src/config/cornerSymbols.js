'use strict';

/**
 * Corner separator symbols between upper/lower verses.
 * Stored in verse_font_scales under CORNER_SYMBOLS_KEY.
 */

const { VERSE_CORNER_ORDER } = require('./verseLayout');

const CORNER_SYMBOLS_KEY = '__cornerSymbols';

/** @typedef {'sparkle4'|'star5'|'diamond'} SymbolType */
/** @typedef {'both'|'right'|'left'} SymbolSides */

const SYMBOL_TYPES = ['sparkle4', 'star5', 'diamond'];
const SYMBOL_TYPE_LABELS = {
  sparkle4: 'כוכב 4 פינות מעוגל קעור',
  star5: 'כוכב סטנדרטי',
  diamond: 'מעוין',
};

const SYMBOL_SIDES = ['both', 'right', 'left'];
const SYMBOL_SIDES_LABELS = {
  both: 'R+L',
  right: 'R',
  left: 'L',
};

/**
 * Soft ceiling only (runaway guard). UI accepts any count up to this;
 * placement uses even spacing in the free gap for any N ≥ 1.
 */
const SYMBOL_COUNT_MAX = 99;

const SYMBOL_BASE_RADIUS = 4.2;

function emptyCornerSymbols() {
  const out = {};
  for (const corner of VERSE_CORNER_ORDER) {
    out[corner] = { type: 'sparkle4', count: 0, sides: 'both' };
  }
  return out;
}

function clampCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(SYMBOL_COUNT_MAX, Math.round(v)));
}

function normalizeType(t) {
  if (t === 'star6') return 'star5'; // legacy alias → standard 5-point
  if (SYMBOL_TYPES.includes(t)) return t;
  return 'sparkle4';
}

function normalizeSides(raw) {
  if (raw == null || raw === '' || raw === 'both' || raw === 'RL' || raw === 'rl' || raw === 'all') {
    return 'both';
  }
  if (raw === 'right' || raw === 'R' || raw === 'r') return 'right';
  if (raw === 'left' || raw === 'L' || raw === 'l') return 'left';
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const wantR = raw.right === true || raw.R === true || raw.r === true;
    const wantL = raw.left === true || raw.L === true || raw.l === true;
    if (wantR && !wantL) return 'right';
    if (wantL && !wantR) return 'left';
    return 'both';
  }
  return 'both';
}

function normalizeEntry(raw) {
  if (raw == null) return { type: 'sparkle4', count: 0, sides: 'both' };
  if (typeof raw === 'number') {
    return { type: 'sparkle4', count: clampCount(raw), sides: 'both' };
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    return {
      type: normalizeType(raw.type ?? raw.symbol ?? 'sparkle4'),
      count: clampCount(raw.count ?? raw.n ?? 0),
      sides: normalizeSides(raw.sides ?? raw.side ?? 'both'),
    };
  }
  return { type: 'sparkle4', count: 0, sides: 'both' };
}

function normalizeCornerSymbols(raw) {
  const out = emptyCornerSymbols();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const corner of VERSE_CORNER_ORDER) {
    if (Object.prototype.hasOwnProperty.call(raw, corner)) {
      out[corner] = normalizeEntry(raw[corner]);
    }
  }
  return out;
}

function hasAnyCornerSymbols(symbols) {
  const map = normalizeCornerSymbols(symbols);
  return VERSE_CORNER_ORDER.some((c) => map[c].count > 0);
}

function splitFontScalesPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { styles: {}, cornerSymbols: emptyCornerSymbols() };
  }
  const styles = { ...input };
  const raw = styles[CORNER_SYMBOLS_KEY];
  delete styles[CORNER_SYMBOLS_KEY];
  // Ignore legacy star key if present
  delete styles.__cornerStars;
  return { styles, cornerSymbols: normalizeCornerSymbols(raw) };
}

function joinFontScalesPayload(styles, cornerSymbols) {
  const out =
    styles && typeof styles === 'object' && !Array.isArray(styles) ? { ...styles } : {};
  delete out.__cornerStars;
  const cleaned = normalizeCornerSymbols(cornerSymbols);
  if (hasAnyCornerSymbols(cleaned)) {
    const compact = {};
    for (const corner of VERSE_CORNER_ORDER) {
      const e = cleaned[corner];
      if (e.count > 0) {
        const entry = { type: e.type, count: e.count };
        if (e.sides && e.sides !== 'both') entry.sides = e.sides;
        compact[corner] = entry;
      }
    }
    out[CORNER_SYMBOLS_KEY] = compact;
  } else {
    delete out[CORNER_SYMBOLS_KEY];
  }
  return out;
}

function fmt(n) {
  return String(Math.round(Number(n) * 1000) / 1000);
}

/** Classic N-point star, tip up (−Y). */
function starPathD(outerR, points = 5, innerRatio = 0.42) {
  const R = Math.max(0.5, Number(outerR) || SYMBOL_BASE_RADIUS);
  const r = Math.max(0.25, R * innerRatio);
  const parts = [];
  for (let i = 0; i < points * 2; i += 1) {
    const rad = i % 2 === 0 ? R : r;
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    parts.push(`${i === 0 ? 'M' : 'L'}${fmt(rad * Math.cos(angle))} ${fmt(rad * Math.sin(angle))}`);
  }
  parts.push('Z');
  return parts.join(' ');
}

/** Axis-aligned diamond (rhombus) — slightly smaller than star/sparkle. */
function diamondPathD(outerR) {
  const R = Math.max(0.4, (Number(outerR) || SYMBOL_BASE_RADIUS) * 0.58);
  return `M0 ${fmt(-R)}L${fmt(R)} 0L0 ${fmt(R)}L${fmt(-R)} 0Z`;
}

/**
 * 4-point sparkle: sharp tips N/E/S/W, concave arcs between tips (pull inward).
 * Clean cubic path — control points sit toward the origin for a clear concave waist.
 */
function sparkle4PathD(outerR) {
  const R = Math.max(0.5, Number(outerR) || SYMBOL_BASE_RADIUS);
  // Concave depth: closer to center → deeper waist between tips.
  const c = R * 0.18;
  return (
    `M0 ${fmt(-R)}` +
    `C${fmt(c)} ${fmt(-c)} ${fmt(c)} ${fmt(-c)} ${fmt(R)} 0` +
    `C${fmt(c)} ${fmt(c)} ${fmt(c)} ${fmt(c)} 0 ${fmt(R)}` +
    `C${fmt(-c)} ${fmt(c)} ${fmt(-c)} ${fmt(c)} ${fmt(-R)} 0` +
    `C${fmt(-c)} ${fmt(-c)} ${fmt(-c)} ${fmt(-c)} 0 ${fmt(-R)}` +
    'Z'
  );
}

function symbolPathD(type, outerR) {
  const t = normalizeType(type);
  if (t === 'diamond') return diamondPathD(outerR);
  if (t === 'star5') return starPathD(outerR, 5);
  return sparkle4PathD(outerR);
}

module.exports = {
  CORNER_SYMBOLS_KEY,
  SYMBOL_TYPES,
  SYMBOL_TYPE_LABELS,
  SYMBOL_SIDES,
  SYMBOL_SIDES_LABELS,
  SYMBOL_COUNT_MAX,
  SYMBOL_BASE_RADIUS,
  emptyCornerSymbols,
  clampCount,
  normalizeType,
  normalizeSides,
  normalizeEntry,
  normalizeCornerSymbols,
  hasAnyCornerSymbols,
  splitFontScalesPayload,
  joinFontScalesPayload,
  starPathD,
  diamondPathD,
  sparkle4PathD,
  symbolPathD,
};
