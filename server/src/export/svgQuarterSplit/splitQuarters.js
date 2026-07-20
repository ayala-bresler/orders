'use strict';

const { polylineToPathD } = require('../svgPrepareForExport');
const { fmt, escapeAttr } = require('./svgFormat');

const QUARTER_DEFS = [
  { id: 'topLeft', label: 'שמאל-למעלה', col: 'left', row: 'top' },
  { id: 'topRight', label: 'ימין-למעלה', col: 'right', row: 'top' },
  { id: 'bottomLeft', label: 'שמאל-למטה', col: 'left', row: 'bottom' },
  { id: 'bottomRight', label: 'ימין-למטה', col: 'right', row: 'bottom' },
];

function quarterBounds(def, xMid, yMid, canvasWidth, canvasHeight) {
  const x0 = def.col === 'left' ? 0 : xMid;
  const x1 = def.col === 'left' ? xMid : canvasWidth;
  const y0 = def.row === 'top' ? 0 : yMid;
  const y1 = def.row === 'top' ? yMid : canvasHeight;

  return {
    x0,
    y0,
    x1,
    y1,
    width: x1 - x0,
    height: y1 - y0,
    translateX: -x0,
    translateY: -y0,
  };
}

function shapeBBox(points) {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function shapeCenter(points) {
  const box = shapeBBox(points);
  return {
    x: (box.minX + box.maxX) / 2,
    y: (box.minY + box.maxY) / 2,
  };
}

/** Assign a shape to exactly one quarter by the center of its bounding box. */
function assignPathToQuarter(points, xMid, yMid) {
  const { x, y } = shapeCenter(points);
  if (x < xMid) return y < yMid ? 'topLeft' : 'bottomLeft';
  return y < yMid ? 'topRight' : 'bottomRight';
}

function translatePoints(points, dx, dy) {
  return points.map(([x, y]) => [x + dx, y + dy]);
}

function pathElementMarkup(path) {
  const fill = path.fill || 'none';
  const stroke = path.stroke || 'none';
  const sw =
    path.stroke && path.stroke !== 'none' && path.strokeWidth != null
      ? ` stroke-width="${escapeAttr(path.strokeWidth)}"`
      : '';
  return `  <path d="${escapeAttr(path.d)}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}"${sw}/>`;
}

/**
 * Build one quarter SVG with only shapes belonging to that region (origin at 0,0).
 * DXF conversion ignores clipPath — geometry must be filtered before export.
 */
function buildQuarterSvg(paths, width, height) {
  const pathLines = paths.map((p) => pathElementMarkup(p)).join('\n');
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${fmt(width)} ${fmt(height)}" width="${fmt(width)}" height="${fmt(height)}">\n` +
    `${pathLines}\n` +
    '</svg>'
  );
}

/**
 * Step 4 — assign each scaled shape to one quarter and build SVG with origin at (0,0).
 * Uses geometric filtering (not clipPath) so DXF export receives only quarter geometry.
 */
function splitIntoQuarters(paths, { xMid, yMid, canvasWidth, canvasHeight }) {
  const buckets = Object.fromEntries(QUARTER_DEFS.map((d) => [d.id, []]));

  for (const shape of paths) {
    const quarterId = assignPathToQuarter(shape.points, xMid, yMid);
    buckets[quarterId].push(shape);
  }

  const quarters = {};

  for (const def of QUARTER_DEFS) {
    const bounds = quarterBounds(def, xMid, yMid, canvasWidth, canvasHeight);
    const quarterPaths = buckets[def.id].map((shape) => ({
      d: polylineToPathD(
        translatePoints(shape.points, bounds.translateX, bounds.translateY),
        shape.close
      ),
      fill: shape.fill,
      stroke: shape.stroke,
      strokeWidth: shape.strokeWidth,
    }));

    quarters[def.id] = {
      id: def.id,
      label: def.label,
      svg: buildQuarterSvg(quarterPaths, bounds.width, bounds.height),
      pathCount: quarterPaths.length,
      bounds: {
        x0: bounds.x0,
        y0: bounds.y0,
        x1: bounds.x1,
        y1: bounds.y1,
        width: bounds.width,
        height: bounds.height,
      },
      viewBox: `0 0 ${fmt(bounds.width)} ${fmt(bounds.height)}`,
    };
  }

  return quarters;
}

module.exports = {
  splitIntoQuarters,
  buildQuarterSvg,
  quarterBounds,
  assignPathToQuarter,
  shapeCenter,
  QUARTER_DEFS,
};
