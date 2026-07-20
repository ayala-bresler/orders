'use strict';

const { DOMParser } = require('@xmldom/xmldom');
const { readRootSvgMetrics } = require('../export/svgRootMetrics');
const { accumulate, apply } = require('../export/transform');
const { extractSvgContent } = require('../export/svgExtract');

const CORNERS = ['top_right', 'top_left', 'bottom_right', 'bottom_left'];

function parseViewBoxNumbers(viewBox) {
  const parts = String(viewBox || '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (parts.length < 4 || !parts.every((n) => Number.isFinite(n))) return null;
  return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
}

function assignCorner(cx, cy, vb) {
  const midX = vb.x + vb.w / 2;
  const midY = vb.y + vb.h / 2;
  const right = cx >= midX;
  const top = cy < midY;
  if (right && top) return 'top_right';
  if (!right && top) return 'top_left';
  if (right && !top) return 'bottom_right';
  return 'bottom_left';
}

/** Collect transformed ellipse centers + radii from the SVG DOM. */
function collectEllipses(doc) {
  const out = [];

  function walk(node, matrix) {
    if (!node || node.nodeType !== 1) return;
    const tag = node.tagName && node.tagName.toLowerCase();
    const M = accumulate(matrix, node);

    if (tag === 'ellipse') {
      const cx = Number(node.getAttribute('cx') || 0);
      const cy = Number(node.getAttribute('cy') || 0);
      const rx = Number(node.getAttribute('rx') || 0);
      const ry = Number(node.getAttribute('ry') || rx);
      const [tx, ty] = apply(M, cx, cy);
      const scaleX = Math.hypot(M[0], M[1]) || 1;
      const scaleY = Math.hypot(M[2], M[3]) || 1;
      const effectiveRx = rx * scaleX;
      const effectiveRy = ry * scaleY;
      out.push({
        cx: tx,
        cy: ty,
        rx: effectiveRx,
        ry: effectiveRy,
      });
    } else if (tag === 'circle') {
      const cx = Number(node.getAttribute('cx') || 0);
      const cy = Number(node.getAttribute('cy') || 0);
      const r = Number(node.getAttribute('r') || 0);
      const [tx, ty] = apply(M, cx, cy);
      const scale = (Math.hypot(M[0], M[1]) + Math.hypot(M[2], M[3])) / 2 || 1;
      const effectiveR = r * scale;
      out.push({
        cx: tx,
        cy: ty,
        rx: effectiveR,
        ry: effectiveR,
      });
    }

    for (let i = 0; i < node.childNodes.length; i += 1) {
      walk(node.childNodes.item(i), M);
    }
  }

  walk(doc.documentElement, [1, 0, 0, 1, 0, 0]);
  return out;
}

/** Group ellipses into four corner medallions; derive centers and ring radii. */
function buildMedallionGeometry(ellipses, vb) {
  const groups = Object.fromEntries(CORNERS.map((c) => [c, []]));

  for (const el of ellipses) {
    const corner = assignCorner(el.cx, el.cy, vb);
    groups[corner].push(el);
  }

  const medallionCenters = {};
  const ringRadii = {};

  for (const corner of CORNERS) {
    const items = groups[corner];
    if (!items.length) continue;

    const cx = items.reduce((s, e) => s + e.cx, 0) / items.length;
    const cy = items.reduce((s, e) => s + e.cy, 0) / items.length;
    const radii = items.map((e) => Math.max(e.rx, e.ry)).filter((r) => r > 0);
    const innerRx = radii.length ? Math.min(...radii) : null;
    const outerRx = radii.length ? Math.max(...radii) : null;

    medallionCenters[corner] = { cx, cy };
    ringRadii[corner] = { innerRx, outerRx };
  }

  return { medallionCenters, ringRadii };
}

function shapeBBoxCenter(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

function shapeAverageRadius(points, cx, cy) {
  return points.reduce((s, [x, y]) => s + Math.hypot(x - cx, y - cy), 0) / points.length;
}

/**
 * Fallback for templates that draw rings as stroked <path> circles (e.g. size 9).
 * Guide paths (textPath href targets) are excluded via textPathHrefs.
 */
function buildMedallionGeometryFromRingPaths(doc, vb, guideHrefs = new Set()) {
  const { shapes } = extractSvgContent(doc, guideHrefs);
  const groups = Object.fromEntries(CORNERS.map((c) => [c, []]));

  for (const shape of shapes) {
    const points = shape.points;
    if (!points || points.length < 12) continue;
    const { cx, cy } = shapeBBoxCenter(points);
    const avgR = shapeAverageRadius(points, cx, cy);
    if (!Number.isFinite(avgR) || avgR < 24) continue;
    const corner = assignCorner(cx, cy, vb);
    groups[corner].push({ cx, cy, avgR });
  }

  const medallionCenters = {};
  const ringRadii = {};

  for (const corner of CORNERS) {
    const items = groups[corner];
    if (!items.length) continue;

    const cx = items.reduce((s, e) => s + e.cx, 0) / items.length;
    const cy = items.reduce((s, e) => s + e.cy, 0) / items.length;
    const radii = items.map((e) => e.avgR).filter((r) => r > 0);
    medallionCenters[corner] = { cx, cy };
    ringRadii[corner] = {
      innerRx: radii.length ? Math.min(...radii) : null,
      outerRx: radii.length ? Math.max(...radii) : null,
    };
  }

  return { medallionCenters, ringRadii };
}

function guideHrefSet(fields) {
  return new Set(
    fields
      .filter((f) => f.href)
      .map((f) => (f.href.startsWith('#') ? f.href : `#${f.href}`))
  );
}

function mergeMedallionGeometry(primary, fallback) {
  const medallionCenters = { ...fallback.medallionCenters, ...primary.medallionCenters };
  const ringRadii = {};

  for (const corner of CORNERS) {
    const base = primary.ringRadii[corner];
    const fb = fallback.ringRadii[corner];
    const innerCandidates = [base?.innerRx, fb?.innerRx].filter(
      (v) => Number.isFinite(v) && v > 0
    );
    const outerCandidates = [base?.outerRx, fb?.outerRx].filter(
      (v) => Number.isFinite(v) && v > 0
    );

    if (!innerCandidates.length && !outerCandidates.length) continue;

    ringRadii[corner] = {
      innerRx: innerCandidates.length ? Math.min(...innerCandidates) : null,
      outerRx: outerCandidates.length ? Math.max(...outerCandidates) : null,
    };

    if (!medallionCenters[corner]) {
      medallionCenters[corner] =
        primary.medallionCenters?.[corner] || fallback.medallionCenters?.[corner];
    }
  }

  return { medallionCenters, ringRadii };
}

/** Derive center from a circular path `d` (arc notation) when ellipses are absent. */
function centerFromCirclePath(d) {
  if (!d) return null;
  const m = d.match(/^M\s*([\d.+-]+)[,\s]+([\d.+-]+)/i);
  if (!m) return null;
  const cx = Number(m[1]);
  const cy = Number(m[2]);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return { cx, cy };
}

/** Fill missing medallion centers from textPath guide circles. */
function enrichCentersFromPaths(medallionCenters, pathById, fields, vb) {
  const out = { ...medallionCenters };

  for (const field of fields) {
    const corner = field.corner || field.group;
    if (!corner || out[corner]) continue;
    const href = field.href || '';
    const pathId = href.startsWith('#') ? href.slice(1) : href;
    const guide = pathById[pathId];
    if (!guide?.d && !guide?.points?.length) continue;
    if (guide.points?.length) {
      out[corner] = shapeBBoxCenter(guide.points);
    } else {
      const center = centerFromCirclePath(guide.d);
      if (center) out[corner] = center;
    }
  }

  return out;
}

/**
 * Analyze an SVG template and return geometry metadata for relative processing.
 * Does NOT mutate the SVG — preserves original user units for laser cutting.
 */
function analyzeSvgTemplate(svgString, fields = []) {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const rootMetrics = readRootSvgMetrics(doc);
  const vb = parseViewBoxNumbers(rootMetrics.viewBox);
  if (!vb) {
    throw new Error('SVG template is missing a valid viewBox.');
  }

  const ellipses = collectEllipses(doc);
  const fromEllipses = buildMedallionGeometry(ellipses, vb);
  const fromRingPaths = buildMedallionGeometryFromRingPaths(doc, vb, guideHrefSet(fields));
  let { medallionCenters, ringRadii } = mergeMedallionGeometry(fromEllipses, fromRingPaths);

  const { pathById } = extractSvgContent(doc);
  medallionCenters = enrichCentersFromPaths(medallionCenters, pathById, fields, vb);

  for (const corner of CORNERS) {
    if (
      (!ringRadii[corner]?.innerRx || !ringRadii[corner]?.outerRx) &&
      fromRingPaths.ringRadii[corner]
    ) {
      ringRadii = { ...ringRadii, [corner]: fromRingPaths.ringRadii[corner] };
      if (!medallionCenters[corner] && fromRingPaths.medallionCenters[corner]) {
        medallionCenters = {
          ...medallionCenters,
          [corner]: fromRingPaths.medallionCenters[corner],
        };
      }
    }
  }

  const globalInner = [];
  const globalOuter = [];
  for (const corner of CORNERS) {
    const r = ringRadii[corner];
    if (r?.innerRx) globalInner.push(r.innerRx);
    if (r?.outerRx) globalOuter.push(r.outerRx);
  }

  return {
    viewBox: rootMetrics.viewBox,
    width: rootMetrics.width,
    height: rootMetrics.height,
    viewBoxParsed: vb,
    medallionCenters,
    ringRadii,
    innerRx: globalInner.length ? globalInner.reduce((a, b) => a + b, 0) / globalInner.length : null,
    outerRx: globalOuter.length ? globalOuter.reduce((a, b) => a + b, 0) / globalOuter.length : null,
  };
}

module.exports = {
  CORNERS,
  analyzeSvgTemplate,
  assignCorner,
  parseViewBoxNumbers,
};
