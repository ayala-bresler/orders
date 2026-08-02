'use strict';

/**
 * Place corner separator symbols in the free gaps between upper/lower verses.
 *
 * Horizontal: even spacing of N symbols in each free gap (from measured verse advances).
 * Vertical: R_center = (R_outer + R_inner) / 2 from medallion center.
 */

const { svgPathProperties } = require('svg-path-properties');
const { extractSvgContent } = require('./svgExtract');
const { apply } = require('./transform');
const {
  VERSE_CORNER_ORDER,
  VERSE_RING_LOWER,
  VERSE_RING_UPPER,
} = require('../config/verseLayout');
const {
  normalizeCornerSymbols,
  hasAnyCornerSymbols,
  symbolPathD,
  SYMBOL_BASE_RADIUS,
} = require('../config/cornerSymbols');
const {
  loadFont,
  measureTextWidth,
  ringTargetRadiusPx,
} = require('./svgText');
const { styleForKey } = require('../config/verseStyles');
const { normalizeVerseText } = require('../utils/verseText');

const SYMBOL_ATTR = 'data-corner-symbol';

/** Nominal verse mid-angles on the medallion (SVG Y-down): upper=top, lower=bottom. */
const RING_MID_ANGLE = {
  [VERSE_RING_UPPER]: -Math.PI / 2,
  [VERSE_RING_LOWER]: Math.PI / 2,
};

function removeExisting(doc) {
  const root = doc.documentElement;
  if (!root) return;
  const doomed = [];
  const walk = (node) => {
    if (!node || node.nodeType !== 1) return;
    if (node.getAttribute && node.getAttribute(SYMBOL_ATTR) === 'true') {
      doomed.push(node);
      return;
    }
    for (let i = 0; i < node.childNodes.length; i += 1) {
      walk(node.childNodes.item(i));
    }
  };
  walk(root);
  for (const node of doomed) {
    if (node.parentNode) node.parentNode.removeChild(node);
  }
}

function samplerFromGuide(guide) {
  const matrix = guide?.matrix || [1, 0, 0, 1, 0, 0];
  const d = guide?.d;
  if (!d) return null;
  try {
    const props = new svgPathProperties(d);
    return {
      length: () => props.getTotalLength(),
      at(dist) {
        const p = props.getPointAtLength(dist);
        const [x, y] = apply(matrix, p.x, p.y);
        return { x, y };
      },
    };
  } catch {
    return null;
  }
}

function angToT(a) {
  let t = a / (2 * Math.PI);
  t -= Math.floor(t);
  return t;
}

function angleOf(pt, center) {
  return Math.atan2(pt.y - center.cy, pt.x - center.cx);
}

/**
 * Occupied circle fractions for a verse centered on its guide path (startOffset 50%).
 * Mid-angle from the real path midpoint; half-width from measured text advance —
 * so the free-gap center moves when upper/lower text length changes.
 * @returns {Array<[number, number]>}
 */
function occupiedIntervals(sampler, advancePx, center, ring) {
  const L = sampler.length();
  if (!(L > 0) || !center) return [];

  const midPt = sampler.at(L / 2);
  let midAng = angleOf(midPt, center);
  if (!Number.isFinite(midAng)) {
    midAng = RING_MID_ANGLE[ring] ?? 0;
  }

  const halfAng =
    advancePx > 0 ? Math.min(Math.PI * 0.95, (advancePx / L) * Math.PI) : 0;
  const midT = angToT(midAng);
  if (halfAng < 1e-4) {
    const eps = 0.002;
    return wrapInterval(midT - eps, midT + eps);
  }
  const halfT = halfAng / (2 * Math.PI);
  return wrapInterval(midT - halfT, midT + halfT);
}

function wrapInterval(s, e) {
  if (s >= 0 && e <= 1) return [[s, e]];
  if (s < 0) return [[s + 1, 1], [0, e]];
  return [[s, 1], [0, e - 1]];
}

function mergeIntervals(intervals) {
  const flat = intervals
    .filter(([a, b]) => b > a + 1e-9)
    .sort((u, v) => u[0] - v[0]);
  if (!flat.length) return [];
  const out = [[flat[0][0], flat[0][1]]];
  for (let i = 1; i < flat.length; i += 1) {
    const [s, e] = flat[i];
    const last = out[out.length - 1];
    if (s <= last[1] + 1e-9) last[1] = Math.max(last[1], e);
    else out.push([s, e]);
  }
  return out;
}

/** Free arcs as [start, end); wrap gap may have end > 1. */
function freeGaps(occupied) {
  const merged = mergeIntervals(occupied);
  if (!merged.length) return [[0, 1]];
  const gaps = [];
  if (merged[0][0] > 1e-9) gaps.push([0, merged[0][0]]);
  for (let i = 0; i < merged.length - 1; i += 1) {
    gaps.push([merged[i][1], merged[i + 1][0]]);
  }
  if (merged[merged.length - 1][1] < 1 - 1e-9) {
    gaps.push([merged[merged.length - 1][1], 1]);
  }
  if (
    gaps.length >= 2 &&
    Math.abs(gaps[0][0]) < 1e-9 &&
    Math.abs(gaps[gaps.length - 1][1] - 1) < 1e-9
  ) {
    const first = gaps.shift();
    const last = gaps.pop();
    gaps.push([last[0], first[1] + 1]);
  }
  return gaps.filter(([a, b]) => b - a > 1e-4);
}

/**
 * Pick the left (t≈0.5) and right (t≈0) free gaps so both sides always get symbols.
 */
function pickLeftRightGaps(gaps) {
  if (!gaps.length) {
    return {
      right: [0 - 0.12, 0 + 0.12],
      left: [0.5 - 0.12, 0.5 + 0.12],
    };
  }

  const scored = gaps.map(([g0, g1]) => {
    const span = g1 - g0;
    const mid = g0 + span / 2;
    const midNorm = mid - Math.floor(mid);
    return { g0, g1, span, midNorm };
  });

  const distTo = (midNorm, target) => {
    const d = Math.abs(midNorm - target);
    return Math.min(d, 1 - d);
  };

  let right = null;
  let left = null;
  let bestR = Infinity;
  let bestL = Infinity;
  for (const g of scored) {
    const dr = distTo(g.midNorm, 0);
    const dl = distTo(g.midNorm, 0.5);
    if (dr < bestR) {
      bestR = dr;
      right = g;
    }
    if (dl < bestL) {
      bestL = dl;
      left = g;
    }
  }

  // If both picks landed on the same gap (e.g. nearly empty circle), split it.
  if (right && left && right.g0 === left.g0 && right.g1 === left.g1) {
    const mid = right.g0 + right.span / 2;
    return {
      right: [right.g0, mid],
      left: [mid, right.g1],
    };
  }

  return {
    right: right ? [right.g0, right.g1] : [ -0.12, 0.12 ],
    left: left ? [left.g0, left.g1] : [0.38, 0.62],
  };
}

/** Visible size ≈ verse font height (outer radius ≈ half em). */
function symbolRadiusFromFont(fontSizePx) {
  const fs = Number(fontSizePx);
  if (!Number.isFinite(fs) || fs <= 0) return SYMBOL_BASE_RADIUS;
  return Math.max(2.2, Math.min(9, fs * 0.48));
}

/**
 * Left-side medallions: UI "L" = toward plate center (= geo right = הכי בימין).
 * Right-side medallions: UI "L" = geo left (toward plate center).
 */
function isLeftSideCorner(corner) {
  return corner === 'top_left' || corner === 'bottom_left';
}

/**
 * Map UI side mode → geometric gaps.
 * L = "left of the inscription" (toward plate center);
 * R = outer edge of the plate.
 * Placement is always the center of the free gap (updates with verse length).
 */
function resolveSidePlacements(corner, sideMode, leftGap, rightGap) {
  const swap = isLeftSideCorner(corner);
  const gapUiLeft = swap ? rightGap : leftGap;
  const gapUiRight = swap ? leftGap : rightGap;
  const out = [];
  if (sideMode === 'both' || sideMode === 'left') {
    out.push({ gap: gapUiLeft, side: 'left' });
  }
  if (sideMode === 'both' || sideMode === 'right') {
    out.push({ gap: gapUiRight, side: 'right' });
  }
  return out;
}

/**
 * Place N symbols with even spacing inside the free gap (circle fraction).
 * Positions at centers of N equal segments: t_i = g0 + (i+0.5)/N * span.
 * Recalculated whenever upper/lower verse advances change the gap.
 * @returns {number[]} angles in radians
 */
function evenAnglesInGap(gap, count) {
  const g0 = gap[0];
  const g1 = gap[1];
  const span = g1 - g0;
  if (!(span > 1e-4) || count <= 0) return [];

  const out = [];
  for (let i = 0; i < count; i += 1) {
    const t = g0 + ((i + 0.5) / count) * span;
    out.push(t * 2 * Math.PI);
  }
  return out;
}

function createSvgEl(doc, tag) {
  // xmldom: prefer createElement so serialize → re-parse (bake) stays stable.
  return doc.createElement(tag);
}

function appendSymbol(doc, parent, { x, y, radius, type, corner, side, ang }) {
  const path = createSvgEl(doc, 'path');
  path.setAttribute(SYMBOL_ATTR, 'true');
  path.setAttribute('data-corner', corner);
  path.setAttribute('data-symbol-side', side);
  path.setAttribute('data-symbol-type', type);
  path.setAttribute('fill', '#241F1F');
  path.setAttribute('stroke', 'none');
  path.setAttribute('d', symbolPathD(type, radius));
  // Tip (-Y local) points radially outward — follows the circle at this angle.
  const deg = (Number(ang) + Math.PI / 2) * (180 / Math.PI);
  const tx = Math.round(x * 1000) / 1000;
  const ty = Math.round(y * 1000) / 1000;
  const rot = Math.round(deg * 1000) / 1000;
  path.setAttribute('transform', `translate(${tx} ${ty}) rotate(${rot})`);
  parent.appendChild(path);
}

function fieldFor(ctx, corner, ring) {
  return (ctx.fields || []).find(
    (f) => (f.corner || f.group) === corner && f.ring === ring
  );
}

function verseTextForField(field, values, canonical) {
  if (values && Object.prototype.hasOwnProperty.call(values, field.key)) {
    const provided = values[field.key];
    return provided == null ? '' : String(provided);
  }
  return canonical[field.key] || field.defaultText || '';
}

function verseAdvance(font, text, fontSize, letterSpacingEm) {
  const line = normalizeVerseText(text || '');
  // Blank verse occupies no arc — free gap spans the full side (DXF-safe).
  if (!String(line).trim()) return 0;
  return measureTextWidth(font, line, fontSize, letterSpacingEm || 0);
}

/**
 * @param {Document} doc
 * @param {object} ctx
 * @param {object} values cleaned verse values
 * @param {object} stylesMap cleaned font scales (no symbols key)
 * @param {object} cornerSymbols normalized map
 * @param {object} [canonical] defaults by key
 */
function applyCornerSymbolSeparators(
  doc,
  ctx,
  values,
  stylesMap,
  cornerSymbols,
  canonical = {}
) {
  removeExisting(doc);
  const symbols = normalizeCornerSymbols(cornerSymbols);
  if (!hasAnyCornerSymbols(symbols)) return;

  const font = loadFont('FbKidushPro-bold');
  if (!font) return;

  const root = doc.documentElement;
  if (!root) return;

  const { pathById } = extractSvgContent(doc);
  let group = null;

  for (const corner of VERSE_CORNER_ORDER) {
    try {
      placeCornerSymbols(
        doc,
        ctx,
        values,
        stylesMap,
        canonical,
        symbols,
        font,
        pathById,
        corner,
        () => {
          if (!group) {
            group = createSvgEl(doc, 'g');
            group.setAttribute(SYMBOL_ATTR, 'true');
            group.setAttribute('id', 'corner-symbol-separators');
            root.appendChild(group);
          }
          return group;
        }
      );
    } catch (err) {
      console.error(
        `[cornerSymbols] corner ${corner} failed:`,
        err && err.message ? err.message : err
      );
    }
  }
}

function placeCornerSymbols(
  doc,
  ctx,
  values,
  stylesMap,
  canonical,
  symbols,
  font,
  pathById,
  corner,
  ensureGroup
) {
  const entry = symbols[corner];
  const count = entry?.count || 0;
  if (count <= 0) return;

  const upper = fieldFor(ctx, corner, VERSE_RING_UPPER);
  const lower = fieldFor(ctx, corner, VERSE_RING_LOWER);
  if (!upper?.href && !lower?.href) return;

  const center = ctx.meta?.medallionCenters?.[corner];
  const radii = ctx.meta?.ringRadii?.[corner];
  if (!center || !radii?.innerRx || !radii?.outerRx) return;

  const rCenter = ringTargetRadiusPx(radii.innerRx, radii.outerRx);

  const occupied = [];
  const fontSizes = [];

  for (const field of [upper, lower]) {
    if (!field?.href) continue;
    const pathId = field.href.startsWith('#') ? field.href.slice(1) : field.href;
    const guide = pathById[pathId];
    const sampler = samplerFromGuide(guide);
    if (!sampler) continue;

    const basePx = field.fontSizePx ?? 16;
    const style = styleForKey(stylesMap, field.key, basePx);
    fontSizes.push(style.fontSizePx);
    const text = verseTextForField(field, values, canonical);
    const adv = verseAdvance(font, text, style.fontSizePx, style.letterSpacingEm);
    occupied.push(...occupiedIntervals(sampler, adv, center, field.ring));
  }

  const avgFont =
    fontSizes.length > 0
      ? fontSizes.reduce((a, b) => a + b, 0) / fontSizes.length
      : 16;
  const radius = symbolRadiusFromFont(avgFont);

  const gaps = freeGaps(occupied);
  const { left, right } = pickLeftRightGaps(gaps);
  const sideMode = entry.sides || 'both';
  const sides = resolveSidePlacements(corner, sideMode, left, right);
  if (!sides.length) return;

  const group = ensureGroup();

  for (const { gap, side } of sides) {
    // Even spacing of N symbols across the free gap between verse ends.
    const angles = evenAnglesInGap(gap, count);
    angles.forEach((ang, i) => {
      if (!Number.isFinite(ang)) return;
      const x = center.cx + rCenter * Math.cos(ang);
      const y = center.cy + rCenter * Math.sin(ang);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      appendSymbol(doc, group, {
        x,
        y,
        radius,
        type: entry.type,
        corner,
        side: `${side}${i}`,
        ang,
      });
    });
  }
}

module.exports = {
  applyCornerSymbolSeparators,
  removeExisting,
  SYMBOL_ATTR,
};
