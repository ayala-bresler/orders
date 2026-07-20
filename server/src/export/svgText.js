'use strict';

const fs = require('fs');
const path = require('path');
const opentype = require('opentype.js');
const { svgPathProperties } = require('svg-path-properties');
const { apply } = require('./transform');
const { pathGuidePoints } = require('./svgExtract');
const { TEMPLATE, SVG_OUTER_RX, SVG_INNER_RX, MEDALLION_CENTERS } = require('./templateRegistry');
const { FIELD_BY_HREF } = require('../config/template');
const { pathToPolylines, transformPolylines } = require('./pathUtils');

const _fontCache = new Map();

function fmt(n) {
  const r = Math.round(Number(n) * 10000) / 10000;
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function loadFont(family) {
  const file =
    TEMPLATE.fontMap[family] || TEMPLATE.defaultFontFile || TEMPLATE.fontMap['FbKidushPro-bold'];
  if (!file) return null;
  const full = path.join(TEMPLATE.fontsDir, file);
  if (_fontCache.has(full)) return _fontCache.get(full);
  if (!fs.existsSync(full)) return null;
  try {
    const font = opentype.parse(fs.readFileSync(full));
    _fontCache.set(full, font);
    return font;
  } catch {
    return null;
  }
}

function measureTextWidth(font, text, fontSize, letterSpacingEm = 0) {
  const chars = [...String(text || '')];
  if (!chars.length) return 0;
  const extra = letterSpacingEm * fontSize;
  let w = 0;
  for (let i = 0; i < chars.length; i += 1) {
    const g = font.charToGlyph(chars[i]);
    if (g) w += (g.advanceWidth * fontSize) / font.unitsPerEm;
    if (i < chars.length - 1) w += extra;
  }
  return w;
}

function glyphAdvanceWithSpacing(font, ch, fontSize, letterSpacingEm = 0) {
  const g = font.charToGlyph(ch);
  const base = g ? (g.advanceWidth * fontSize) / font.unitsPerEm : 0;
  return { base, spacing: letterSpacingEm * fontSize };
}

/** Radial thickness of the medallion ring (outer rx − inner rx in order.svg). */
function ringAnnulusThicknessPx() {
  return SVG_OUTER_RX - SVG_INNER_RX;
}

/**
 * Ink extents above/below alphabetic baseline (px) for a single verse line.
 * @returns {{ above: number, below: number, total: number }}
 */
function measureVerseInkHalfExtents(font, text, fontSize) {
  const line = String(text || '');
  if (!font || !line) {
    return { above: fontSize / 2, below: fontSize / 2, total: fontSize };
  }

  let top = Infinity;
  let bottom = -Infinity;

  for (const ch of line) {
    const g = font.charToGlyph(ch);
    if (!g || g.unicode === undefined) continue;
    const bb = g.getPath(0, 0, fontSize).getBoundingBox();
    top = Math.min(top, bb.y1);
    bottom = Math.max(bottom, bb.y2);
  }

  if (!Number.isFinite(top)) {
    return { above: fontSize / 2, below: fontSize / 2, total: fontSize };
  }

  const above = Math.max(0, -top);
  const below = Math.max(0, bottom);
  const blockCenter = (top + bottom) / 2;
  return { above, below, total: bottom - top, top, bottom, blockCenter };
}

function measureVerseInkHeight(font, text, fontSize) {
  return measureVerseInkHalfExtents(font, text, fontSize).total;
}

function parseDy(raw, fontSize) {
  if (raw == null || raw === '') return 0;
  const s = String(raw).trim();
  if (s.endsWith('em')) return parseFloat(s) * fontSize;
  if (s.endsWith('px')) return parseFloat(s);
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function pointsToPathD(points) {
  if (!points.length) return '';
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length; i += 1) {
    d += ` L ${points[i][0]} ${points[i][1]}`;
  }
  return d;
}

function samplePathAsD(pathPoints) {
  return pointsToPathD(pathPoints);
}

function pathLength(pathPoints) {
  if (!pathPoints || pathPoints.length < 2) return 0;
  const d = samplePathAsD(pathPoints);
  try {
    return new svgPathProperties(d).getTotalLength();
  } catch {
    let len = 0;
    for (let i = 1; i < pathPoints.length; i += 1) {
      const dx = pathPoints[i][0] - pathPoints[i - 1][0];
      const dy = pathPoints[i][1] - pathPoints[i - 1][1];
      len += Math.hypot(dx, dy);
    }
    return len;
  }
}

function pointAtLength(pathPoints, dist) {
  const d = samplePathAsD(pathPoints);
  try {
    const props = new svgPathProperties(d);
    const p = props.getPointAtLength(dist);
    const p2 = props.getPointAtLength(Math.min(dist + 0.5, pathLength(pathPoints)));
    const angle = Math.atan2(p2.y - p.y, p2.x - p.x);
    return { x: p.x, y: p.y, angle };
  } catch {
    return { x: pathPoints[0][0], y: pathPoints[0][1], angle: 0 };
  }
}

/**
 * Sample a textPath guide in user space.
 * Prefers the original bezier `d` + transform (smooth tangents); falls back to polyline points.
 */
function createPathGuideSampler(guide) {
  const matrix = guide?.matrix || [1, 0, 0, 1, 0, 0];
  const points = pathGuidePoints(guide);
  const d = guide?.d;

  if (d) {
    const props = new svgPathProperties(d);
    return {
      length: () => props.getTotalLength(),
      at(dist) {
        const p = props.getPointAtLength(dist);
        const tan = props.getTangentAtLength(dist);
        const [x, y] = apply(matrix, p.x, p.y);
        const [tx, ty] = apply(matrix, p.x + tan.x, p.y + tan.y);
        return { x, y, angle: Math.atan2(ty - y, tx - x) };
      },
    };
  }

  return {
    length: () => pathLength(points),
    at(dist) {
      return pointAtLength(points, dist);
    },
  };
}

function offsetAlongNormal(pt, dyPx) {
  if (!dyPx) return pt;
  const nx = -Math.sin(pt.angle);
  const ny = Math.cos(pt.angle);
  return {
    x: pt.x + nx * dyPx,
    y: pt.y + ny * dyPx,
    angle: pt.angle,
  };
}

function centralTextAnchor(base, dyPx, fontSize) {
  const pt = offsetAlongNormal(base, dyPx);
  return {
    ...pt,
    baselineLocalY: svgCentralAlphabeticOffsetPx(fontSize),
    useEmCenter: false,
  };
}

function glyphWorldRadii(font, ch, fontSize, anchor, cx, cy) {
  const g = font.charToGlyph(ch);
  if (!g || g.unicode === undefined) return [];
  const bb = g.getPath(0, anchor.baselineLocalY ?? 0, fontSize).getBoundingBox();
  const cos = Math.cos(anchor.angle);
  const sin = Math.sin(anchor.angle);
  const corners = [
    [bb.x1, bb.y1],
    [bb.x1, bb.y2],
    [bb.x2, bb.y1],
    [bb.x2, bb.y2],
  ];
  return corners.map(([lx, ly]) => {
    const wx = lx * cos - ly * sin + anchor.x;
    const wy = lx * sin + ly * cos + anchor.y;
    return Math.hypot(wx - cx, wy - cy);
  });
}

/** Min/max ink radius from medallion center after laying out the full verse on the path. */
function measureVerseInkRadialBounds(
  font,
  text,
  fontSize,
  pathGuide,
  startOffset,
  textAnchor,
  dyPx,
  cx,
  cy,
  letterSpacingEm = 0
) {
  if (!font || !pathGuidePoints(pathGuide).length) return null;

  const sampler = createPathGuideSampler(pathGuide);
  const len = sampler.length();
  const chars = charsForTextPath(text);
  if (!chars.length) return null;

  const spacingPx = letterSpacingEm * fontSize;
  const advances = chars.map((ch) => glyphAdvanceWithSpacing(font, ch, fontSize, letterSpacingEm).base);
  const totalAdvance = advances.reduce((s, v) => s + v, 0) + Math.max(0, chars.length - 1) * spacingPx;

  let start = resolveOffset(startOffset, len);
  if (textAnchor === 'middle') start -= totalAdvance / 2;
  else if (textAnchor === 'end') start -= totalAdvance;

  let rMin = Infinity;
  let rMax = -Infinity;
  let cursor = start;

  for (let i = 0; i < chars.length; i += 1) {
    const base = sampler.at(Math.max(0, Math.min(len, cursor)));
    const anchor = centralTextAnchor(base, dyPx, fontSize);
    for (const r of glyphWorldRadii(font, chars[i], fontSize, anchor, cx, cy)) {
      rMin = Math.min(rMin, r);
      rMax = Math.max(rMax, r);
    }
    cursor += advances[i] + (i < chars.length - 1 ? spacingPx : 0);
  }

  if (!Number.isFinite(rMin)) return null;
  return { rMin, rMax, rMid: (rMin + rMax) / 2 };
}

/**
 * Fit verse ink in the annulus by absolute radial centering (same as computeRingCenteringDyPx).
 * Kept as a named export for bake/audit scripts.
 */
function computeRingFittingDyPx(font, text, fontSize, layout, options = {}) {
  return computeRingCenteringDyPx(font, text, fontSize, layout, options);
}

function computeRingFittingDyEm(font, text, fontSize, layout, options = {}) {
  if (!font || !fontSize) return 0.4;
  return computeRingFittingDyPx(font, text, fontSize, layout, options) / fontSize;
}

/** Distance from alphabetic baseline to typo-metric em-box center (opentype tables). */
function typoCenterFromBaselinePx(font, fontSize) {
  const scale = fontSize / font.unitsPerEm;
  const asc = font.tables?.os2?.sTypoAscender ?? font.ascender ?? 800;
  const desc = font.tables?.os2?.sTypoDescender ?? font.descender ?? -200;
  return ((asc + desc) / 2) * scale;
}

/** SVG dominant-baseline="central" uses half the used em, not typo (asc+desc)/2. */
function svgCentralAlphabeticOffsetPx(fontSize) {
  return fontSize / 2;
}

/**
 * Preview-only: em-box top padding is visible in live SVG text but absent in path outlines.
 * Export recalculates dy with emBoxCorrection: false (see exportParentDyForTextItems).
 */
function emBoxPathDyCorrectionPx(font, fontSize) {
  return svgCentralAlphabeticOffsetPx(fontSize) - typoCenterFromBaselinePx(font, fontSize);
}

function formatDyEm(dyEm) {
  const em = Number(dyEm);
  if (!Number.isFinite(em)) return '';
  return `${em.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}em`;
}

function parseDyAttrs(item) {
  return parseDy(item.parentDy, item.fontSize) + parseDy(item.dy, item.fontSize);
}

/**
 * Anchor glyphs on a textPath.
 * parentDy comes from the SVG template (dy attribute); bake via fix-svg-verse-ring-center.js.
 */
function anchorOnTextPath(base, pathPts, font, item) {
  const dyPx = parseDyAttrs(item);
  const central = String(item.dominantBaseline || '').toLowerCase() === 'central';
  const pt = offsetAlongNormal(base, dyPx);

  if (central && font) {
    return {
      ...pt,
      baselineLocalY: svgCentralAlphabeticOffsetPx(item.fontSize),
      useEmCenter: false,
    };
  }

  return { ...pt, baselineLocalY: 0, useEmCenter: false };
}

function shiftOutlineToEmCenter(outline, font, fontSize) {
  const shift = typoCenterFromBaselinePx(font, fontSize);
  for (const cmd of outline.commands) {
    if (cmd.y != null) cmd.y -= shift;
    if (cmd.y1 != null) cmd.y1 -= shift;
    if (cmd.y2 != null) cmd.y2 -= shift;
  }
  return outline;
}

function transformOpentypePath(path, ox, oy, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  /** Match SVG text-on-path: rotate tangent, no extra mirror. */
  const tx = (x, y) => {
    const rx = x * cos - y * sin + ox;
    const ry = x * sin + y * cos + oy;
    return [fmt(rx), fmt(ry)];
  };

  const parts = [];
  for (const cmd of path.commands) {
    switch (cmd.type) {
      case 'M': {
        const [x, y] = tx(cmd.x, cmd.y);
        parts.push(`M ${x} ${y}`);
        break;
      }
      case 'L': {
        const [x, y] = tx(cmd.x, cmd.y);
        parts.push(`L ${x} ${y}`);
        break;
      }
      case 'C': {
        const [x1, y1] = tx(cmd.x1, cmd.y1);
        const [x2, y2] = tx(cmd.x2, cmd.y2);
        const [x, y] = tx(cmd.x, cmd.y);
        parts.push(`C ${x1} ${y1} ${x2} ${y2} ${x} ${y}`);
        break;
      }
      case 'Q': {
        const [x1, y1] = tx(cmd.x1, cmd.y1);
        const [x, y] = tx(cmd.x, cmd.y);
        parts.push(`Q ${x1} ${y1} ${x} ${y}`);
        break;
      }
      case 'Z':
        parts.push('Z');
        break;
      default:
        break;
    }
  }
  return parts.join(' ');
}

function glyphOutlinePaths(font, char, fontSize, anchor) {
  const g = font.charToGlyph(char);
  if (!g || g.unicode === undefined) return [];
  const baselineY = anchor.baselineLocalY ?? 0;
  let outline = g.getPath(0, baselineY, fontSize);
  if (anchor.useEmCenter) {
    outline = shiftOutlineToEmCenter(outline, font, fontSize);
  }
  const d = transformOpentypePath(outline, anchor.x, anchor.y, anchor.angle);
  return d ? [d] : [];
}

function glyphToPolylines(font, char, fontSize, anchor) {
  const g = font.charToGlyph(char);
  if (!g || g.unicode === undefined) return [];
  const baselineY = anchor?.baselineLocalY ?? 0;
  const outline = g.getPath(0, baselineY, fontSize);
  if (anchor?.useEmCenter) {
    shiftOutlineToEmCenter(outline, font, fontSize);
  }
  const d = outline.toPathData(2);
  return pathToPolylines(d);
}

function transformGlyphPolyline(line, anchor) {
  const cos = Math.cos(anchor.angle);
  const sin = Math.sin(anchor.angle);
  return line.map(([x, y]) => {
    const rx = x * cos - y * sin + anchor.x;
    const ry = x * sin + y * cos + anchor.y;
    return [rx, ry];
  });
}

function resolveOffset(startOffset, pathLen) {
  const s = String(startOffset || '0').trim();
  if (s.endsWith('%')) return (parseFloat(s) / 100) * pathLen;
  return parseFloat(s) || 0;
}

function isRtlText(text) {
  return /[\u0590-\u05FF\uFB1D-\uFB4F]/.test(String(text || ''));
}

/** Hebrew/RTL on textPath: logical order must run opposite to path tangent stepping. */
function charsForTextPath(text) {
  const chars = [...String(text || '')];
  if (isRtlText(text)) chars.reverse();
  return chars;
}

function verseTextMidpointDist(pathGuide, font, text, fontSize, startOffset, textAnchor, letterSpacingEm = 0) {
  const sampler = createPathGuideSampler(pathGuide);
  const len = sampler.length();
  const chars = charsForTextPath(text);
  if (!chars.length) return len / 2;

  const spacingPx = letterSpacingEm * fontSize;
  const advances = chars.map((ch) => glyphAdvanceWithSpacing(font, ch, fontSize, letterSpacingEm).base);
  const totalAdvance = advances.reduce((s, v) => s + v, 0) + Math.max(0, chars.length - 1) * spacingPx;

  let start = resolveOffset(startOffset, len);
  if (textAnchor === 'middle') start -= totalAdvance / 2;
  else if (textAnchor === 'end') start -= totalAdvance;

  let mid = Math.max(0, Math.min(len, start + totalAdvance / 2));

  if (isRtlText(text) && totalAdvance > 0) {
    mid = Math.max(0, Math.min(len, mid - totalAdvance * 0.04));
  }

  return mid;
}

/**
 * Ink-center radius for equal margins between rings.
 *
 * User formula (inner edge of a H-high block):
 *   TargetRadius = R_min + ((R_max − R_min) − H_font) / 2
 * Ink midpoint then sits at TargetRadius + H_font/2 ≡ (R_min + R_max) / 2.
 *
 * @param {number} innerRx R_min
 * @param {number} outerRx R_max
 * @param {number} textLenPx H_font (glyph ink height)
 * @returns {number} absolute radius from medallion center for the ink midpoint
 */
function ringTargetRadiusPx(innerRx, outerRx, textLenPx) {
  const inner = Number(innerRx);
  const outer = Number(outerRx);
  const textLen = Number(textLenPx);
  if (!Number.isFinite(inner) || !Number.isFinite(outer)) {
    return (SVG_INNER_RX + SVG_OUTER_RX) / 2;
  }
  const gap = outer - inner;
  if (!Number.isFinite(textLen) || textLen <= 0) {
    return inner + gap / 2;
  }
  const targetInnerEdge = inner + (gap - textLen) / 2;
  return targetInnerEdge + textLen / 2;
}

/**
 * Closed-form dy guess for dominant-baseline="central" (linear radial model).
 * Used only as a seed; absolute solve refines against measured ink radii.
 */
function guessRingCenteringDyPx(font, text, fontSize, layout, rTarget) {
  const pathGuide = layout?.pathGuide ?? (layout?.pathPts ? { points: layout.pathPts } : null);
  const { startOffset, textAnchor, cx, cy } = layout;
  const sampler = createPathGuideSampler(pathGuide);
  const midDist = verseTextMidpointDist(
    pathGuide,
    font,
    text,
    fontSize,
    startOffset,
    textAnchor,
    layout.letterSpacingEm || 0
  );
  const base = sampler.at(midDist);
  const rPath = Math.hypot(base.x - cx, base.y - cy);
  if (rPath < 1e-6) return 0.4 * fontSize;

  const ux = (base.x - cx) / rPath;
  const uy = (base.y - cy) / rPath;
  const nx = -Math.sin(base.angle);
  const ny = Math.cos(base.angle);
  const dot = nx * ux + ny * uy;
  if (Math.abs(dot) < 1e-4) return 0.4 * fontSize;

  const { blockCenter } = measureVerseInkHalfExtents(font, text, fontSize);
  const inkFromCentral = svgCentralAlphabeticOffsetPx(fontSize) + blockCenter;
  return (rTarget - rPath) / dot - inkFromCentral;
}

/**
 * dy (px) so the verse ink midpoint sits at the equal-margin annulus center.
 *
 * Solves absolutely: measure full-glyph rMin/rMax from the medallion center and
 * choose dy that minimizes |rMid − R_target|, where
 *   R_target = R_min + ((R_max − R_min) − H_font)/2 + H_font/2
 * with dominant-baseline="central" (bake + runtime SVG/DXF).
 *
 * @param {{ emBoxCorrection?: boolean }} [options] ignored — kept for callers
 */
function computeRingCenteringDyPx(font, text, fontSize, layout, options = {}) {
  const pathGuide = layout?.pathGuide ?? (layout?.pathPts ? { points: layout.pathPts } : null);
  if (!font || !fontSize || !pathGuidePoints(pathGuide).length) return 0.4 * fontSize;

  const { startOffset, textAnchor, cx, cy } = layout;
  const innerRx = Number(layout.innerRx);
  const outerRx = Number(layout.outerRx);
  const letterSpacingEm = layout.letterSpacingEm || 0;
  const textLen = measureVerseInkHeight(font, text, fontSize);
  const rTarget =
    Number.isFinite(innerRx) && Number.isFinite(outerRx) && outerRx > innerRx
      ? ringTargetRadiusPx(innerRx, outerRx, textLen)
      : ringTargetRadiusPx(SVG_INNER_RX, SVG_OUTER_RX, textLen);

  const measureMid = (dyPx) => {
    const bounds = measureVerseInkRadialBounds(
      font,
      text,
      fontSize,
      pathGuide,
      startOffset,
      textAnchor,
      dyPx,
      cx,
      cy,
      letterSpacingEm
    );
    return bounds ? bounds.rMid : null;
  };

  const seed = guessRingCenteringDyPx(font, text, fontSize, layout, rTarget);
  let best = { dyPx: seed, err: Infinity };
  const consider = (dyPx) => {
    const mid = measureMid(dyPx);
    if (mid == null) return;
    const err = Math.abs(mid - rTarget);
    if (err < best.err) best = { dyPx, err };
  };

  consider(seed);

  // Absolute radial search — does not assume dy origin / path direction.
  const span = fontSize * 3.5;
  const steps = 220;
  for (let i = 0; i <= steps; i += 1) {
    consider(-span + (2 * span * i) / steps);
  }

  const refineSpan = fontSize * 0.45;
  for (let i = 0; i <= 80; i += 1) {
    consider(best.dyPx - refineSpan + (2 * refineSpan * i) / 80);
  }

  // Final binary refinement around best (handles non-linear path curvature).
  let lo = best.dyPx - fontSize * 0.2;
  let hi = best.dyPx + fontSize * 0.2;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    const a = measureMid(lo);
    const b = measureMid(hi);
    const m = measureMid(mid);
    consider(lo);
    consider(hi);
    consider(mid);
    if (a == null || b == null || m == null) break;
    // Move toward the side where measured mid is closer to target.
    const errLo = Math.abs(a - rTarget);
    const errHi = Math.abs(b - rTarget);
    if (errLo < errHi) hi = mid;
    else lo = mid;
  }

  return best.dyPx;
}

/** dy (em) to center verse ink in the ring annulus for dominant-baseline="central". */
function computeRingCenteringDyEm(font, text, fontSize, layout, options = {}) {
  if (!font || !fontSize) return 0.4;
  return computeRingCenteringDyPx(font, text, fontSize, layout, options) / fontSize;
}

/**
 * Export dy for a verse <text>: same ring/ink model as preview but without em-box top padding.
 * @returns {string|null} e.g. "0.42em" for parentDy override, or null if not a verse textPath
 */
function exportParentDyForTextItems(font, items, pathById, templateMeta, fieldByHref) {
  const primary = items.find((it) => it.kind === 'textPath');
  if (!primary) return null;

  const pathId = primary.pathId.startsWith('#') ? primary.pathId.slice(1) : primary.pathId;
  const field =
    (fieldByHref && fieldByHref[`#${pathId}`]) ||
    FIELD_BY_HREF[`#${pathId}`];
  if (!field) return null;

  const pathGuide = pathById[pathId];
  if (!pathGuide || !pathGuidePoints(pathGuide).length) return null;

  const center =
    templateMeta?.medallionCenters?.[field.corner || field.group] ||
    MEDALLION_CENTERS[field.corner || field.group];
  if (!center) return null;

  const corner = field.corner || field.group;
  const perCorner = templateMeta?.ringRadii?.[corner];
  const innerRx = perCorner?.innerRx ?? templateMeta?.innerRx;
  const outerRx = perCorner?.outerRx ?? templateMeta?.outerRx;

  const text = (primary.text || '').trim();

  const dyEm = computeRingCenteringDyEm(font, text, primary.fontSize, {
    pathGuide,
    startOffset: primary.startOffset,
    textAnchor: primary.textAnchor,
    cx: center.cx,
    cy: center.cy,
    innerRx,
    outerRx,
    letterSpacingEm: primary.letterSpacingEm || 0,
  }, { emBoxCorrection: false });

  return formatDyEm(dyEm);
}

function layoutTextPathItem(font, item, pathGuide, outPolylines, outPaths) {
  const sampler = createPathGuideSampler(pathGuide);
  const len = sampler.length();
  const chars = charsForTextPath(item.text);
  if (!chars.length) return;

  const letterSpacingEm = item.letterSpacingEm || 0;
  const spacingPx = letterSpacingEm * item.fontSize;
  const advances = chars.map((ch) => glyphAdvanceWithSpacing(font, ch, item.fontSize, letterSpacingEm).base);
  const totalAdvance = advances.reduce((s, v) => s + v, 0) + Math.max(0, chars.length - 1) * spacingPx;

  let start = resolveOffset(item.startOffset, len);
  if (item.textAnchor === 'middle') start -= totalAdvance / 2;
  else if (item.textAnchor === 'end') start -= totalAdvance;

  let cursor = start;
  for (let i = 0; i < chars.length; i += 1) {
    const base = sampler.at(Math.max(0, Math.min(len, cursor)));
    const anchor = anchorOnTextPath(base, pathGuide, font, item);
    const glyphLines = glyphToPolylines(font, chars[i], item.fontSize, anchor);
    for (const gl of glyphLines) {
      outPolylines.push(transformGlyphPolyline(gl, anchor));
    }
    for (const d of glyphOutlinePaths(font, chars[i], item.fontSize, anchor)) {
      outPaths.push(d);
    }
    cursor += advances[i] + (i < chars.length - 1 ? spacingPx : 0);
  }
}

/** Outline paths for one text descriptor (textPath or plain). */
function layoutTextItemToPaths(font, item, pathById) {
  const polylines = [];
  const paths = [];

  if (item.kind === 'plain') {
    layoutPlainText(font, item.text, item.fontSize, item.matrix, polylines, paths);
    return paths;
  }

  const pathId = item.pathId.startsWith('#') ? item.pathId.slice(1) : item.pathId;
  const pathGuide = pathById[pathId];
  if (!pathGuide || !pathGuidePoints(pathGuide).length) return paths;

  layoutTextPathItem(font, item, pathGuide, polylines, paths);
  return paths;
}

function transformPathWithMatrix(path, matrix, ox = 0) {
  const parts = [];
  for (const cmd of path.commands) {
    switch (cmd.type) {
      case 'M': {
        const [x, y] = apply(matrix, ox + cmd.x, cmd.y);
        parts.push(`M ${fmt(x)} ${fmt(y)}`);
        break;
      }
      case 'L': {
        const [x, y] = apply(matrix, ox + cmd.x, cmd.y);
        parts.push(`L ${fmt(x)} ${fmt(y)}`);
        break;
      }
      case 'C': {
        const [x1, y1] = apply(matrix, ox + cmd.x1, cmd.y1);
        const [x2, y2] = apply(matrix, ox + cmd.x2, cmd.y2);
        const [x, y] = apply(matrix, ox + cmd.x, cmd.y);
        parts.push(`C ${x1} ${y1} ${x2} ${y2} ${x} ${y}`);
        break;
      }
      case 'Q': {
        const [x1, y1] = apply(matrix, ox + cmd.x1, cmd.y1);
        const [x, y] = apply(matrix, ox + cmd.x, cmd.y);
        parts.push(`Q ${x1} ${y1} ${x} ${y}`);
        break;
      }
      case 'Z':
        parts.push('Z');
        break;
      default:
        break;
    }
  }
  return parts.join(' ');
}

function layoutPlainText(font, text, fontSize, matrix, outPolylines, outPaths) {
  const [originX, originY] = apply(matrix, 0, 0);
  const [advX, advY] = apply(matrix, 1, 0);
  const scaleX = Math.hypot(advX - originX, advY - originY) || 1;
  const scaledSize = fontSize * scaleX;
  const rtl = isRtlText(text);

  let ox = rtl ? measureTextWidth(font, text, scaledSize) : 0;

  for (const ch of text) {
    if (rtl) {
      const g = font.charToGlyph(ch);
      if (g) ox -= (g.advanceWidth * scaledSize) / font.unitsPerEm;
    }
    const glyphLines = glyphToPolylines(font, ch, scaledSize);
    for (const gl of glyphLines) {
      outPolylines.push(gl.map(([px, py]) => apply(matrix, ox + px, py)));
    }
    const g = font.charToGlyph(ch);
    if (g && g.unicode !== undefined) {
      const d = transformPathWithMatrix(g.getPath(0, 0, scaledSize), matrix, ox);
      if (d) outPaths.push(d);
    }
    if (!rtl && g) {
      ox += (g.advanceWidth * scaledSize) / font.unitsPerEm;
    }
  }
}

/** Convert text descriptors to vector outlines in SVG user space. */
function textToOutlinePaths(texts, pathById) {
  const polylines = [];
  const paths = [];
  const warnings = [];

  for (const item of texts) {
    const font = loadFont(item.fontFamily);
    if (!font) {
      warnings.push(`Font missing for "${item.fontFamily}" — text skipped.`);
      continue;
    }

    if (item.kind === 'plain') {
      layoutPlainText(font, item.text, item.fontSize, item.matrix, polylines, paths);
      continue;
    }

    const pathId = item.pathId.startsWith('#') ? item.pathId.slice(1) : item.pathId;
    const pathGuide = pathById[pathId];
    if (!pathGuide || !pathGuidePoints(pathGuide).length) continue;

    layoutTextPathItem(font, item, pathGuide, polylines, paths);
  }

  return { polylines, paths, warnings };
}

/** @deprecated use textToOutlinePaths — kept for compatibility */
function textToPolylines(texts, pathById) {
  const { polylines, warnings } = textToOutlinePaths(texts, pathById);
  return { polylines, warnings };
}

module.exports = {
  textToPolylines,
  textToOutlinePaths,
  layoutTextItemToPaths,
  measureTextWidth,
  measureVerseInkHeight,
  computeRingCenteringDyEm,
  computeRingFittingDyEm,
  computeRingFittingDyPx,
  measureVerseInkRadialBounds,
  ringTargetRadiusPx,
  exportParentDyForTextItems,
  ringAnnulusThicknessPx,
  loadFont,
};
