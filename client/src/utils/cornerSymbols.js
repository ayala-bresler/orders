/** Client mirror of server/src/config/cornerSymbols.js */

import { VERSE_CORNER_ORDER } from './verseLayout.js';

export const CORNER_SYMBOLS_KEY = '__cornerSymbols';

export const SYMBOL_TYPES = ['sparkle4', 'star5', 'diamond'];
export const SYMBOL_TYPE_LABELS = {
  sparkle4: 'כוכב 4 פינות מעוגל קעור',
  star5: 'כוכב סטנדרטי',
  diamond: 'מעוין',
};

export const SYMBOL_SIDES = ['both', 'right', 'left'];
export const SYMBOL_SIDES_LABELS = {
  both: 'R+L',
  right: 'R',
  left: 'L',
};

/** Soft ceiling only (runaway guard) — UI accepts free N up to this. */
export const SYMBOL_COUNT_MAX = 999;

/** @deprecated kept for HMR compatibility with older form builds */
export const SYMBOL_COUNT_OPTIONS = [0, 1, 2, 3];
/** @deprecated kept for HMR compatibility with older form builds */
export const SYMBOL_COUNT_LABELS = {
  0: 'ללא',
  1: 'אחד',
  2: 'שניים',
  3: 'שלושה',
};

export function emptyCornerSymbols() {
  const out = {};
  for (const corner of VERSE_CORNER_ORDER) {
    out[corner] = { type: 'sparkle4', count: 0, sides: 'both' };
  }
  return out;
}

export function clampCount(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(SYMBOL_COUNT_MAX, Math.round(v)));
}

export function normalizeType(t) {
  if (t === 'star6') return 'star5';
  if (SYMBOL_TYPES.includes(t)) return t;
  return 'sparkle4';
}

export function normalizeSides(raw) {
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

export function normalizeEntry(raw) {
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

export function normalizeCornerSymbols(raw) {
  const out = emptyCornerSymbols();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const corner of VERSE_CORNER_ORDER) {
    if (Object.prototype.hasOwnProperty.call(raw, corner)) {
      out[corner] = normalizeEntry(raw[corner]);
    }
  }
  return out;
}

export function hasAnyCornerSymbols(symbols) {
  const map = normalizeCornerSymbols(symbols);
  return VERSE_CORNER_ORDER.some((c) => map[c].count > 0);
}

export function splitFontScalesPayload(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { styles: {}, cornerSymbols: emptyCornerSymbols() };
  }
  const styles = { ...input };
  const raw = styles[CORNER_SYMBOLS_KEY];
  delete styles[CORNER_SYMBOLS_KEY];
  delete styles.__cornerStars;
  return { styles, cornerSymbols: normalizeCornerSymbols(raw) };
}

export function joinFontScalesPayload(styles, cornerSymbols) {
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

export function readCornerSymbolsFromFontScales(fontScales) {
  return splitFontScalesPayload(fontScales).cornerSymbols;
}

export function withCornerSymbolPatch(fontScales, corner, patch) {
  const { styles, cornerSymbols } = splitFontScalesPayload(fontScales);
  const cur = normalizeEntry(cornerSymbols[corner]);
  const next = normalizeEntry({ ...cur, ...patch });
  return joinFontScalesPayload(styles, {
    ...cornerSymbols,
    [corner]: next,
  });
}

/** Toggle R or L. Returns `'none'` when both sides are off (clear selection). */
export function toggleSymbolSide(currentSides, which) {
  const cur = normalizeSides(currentSides);
  let right = cur === 'both' || cur === 'right';
  let left = cur === 'both' || cur === 'left';
  if (which === 'right' || which === 'R') right = !right;
  if (which === 'left' || which === 'L') left = !left;
  if (right && left) return 'both';
  if (right) return 'right';
  if (left) return 'left';
  return 'none';
}
