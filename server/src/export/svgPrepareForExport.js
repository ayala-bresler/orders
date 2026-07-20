'use strict';

const { DOMParser } = require('@xmldom/xmldom');
const { extractSvgContent } = require('./svgExtract');
const { bakeTextToPaths } = require('./svgBakeText');
const { readRootSvgMetrics } = require('./svgRootMetrics');

function fmt(n) {
  const r = Math.round(Number(n) * 10000) / 10000;
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function polylineToPathD(points, close = false) {
  if (!points || points.length < 2) return '';
  let d = `M ${fmt(points[0][0])} ${fmt(points[0][1])}`;
  for (let i = 1; i < points.length; i += 1) {
    d += ` L ${fmt(points[i][0])} ${fmt(points[i][1])}`;
  }
  if (close) d += ' Z';
  return d;
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function buildCleanSvg(viewBox, width, height, pathElements) {
  const lines = pathElements.map((p) => {
    const fill = p.fill || 'none';
    const stroke = p.stroke || 'none';
    const sw =
      p.stroke && p.stroke !== 'none' && p.strokeWidth != null
        ? ` stroke-width="${escapeAttr(p.strokeWidth)}"`
        : '';
    return `  <path d="${escapeAttr(p.d)}" fill="${escapeAttr(fill)}" stroke="${escapeAttr(stroke)}"${sw}/>`;
  });

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${escapeAttr(viewBox)}" width="${escapeAttr(width)}" height="${escapeAttr(height)}">\n` +
    `${lines.join('\n')}\n` +
    '</svg>'
  );
}

/**
 * Display SVG → paths-only SVG for DXF/email.
 * 1) Bake text on native guide paths to outlines (while textPath still exists).
 * 2) Flatten remaining geometry (ellipses, rects, baked text paths) to paths.
 */
function prepareSvgForExport(rawSvgString) {
  const warnings = [];
  const doc = new DOMParser().parseFromString(rawSvgString, 'image/svg+xml');
  const { viewBox, width, height } = readRootSvgMetrics(doc);

  warnings.push(...bakeTextToPaths(doc));

  const { shapes } = extractSvgContent(doc);
  const pathElements = [];

  for (const shape of shapes) {
    const d = polylineToPathD(shape.points, shape.close !== false);
    if (!d) continue;
    pathElements.push({
      d,
      fill: shape.fill || 'none',
      stroke: shape.stroke || 'none',
      strokeWidth: shape.strokeWidth,
    });
  }

  const svg = buildCleanSvg(viewBox, width, height, pathElements);
  return { svg, warnings };
}

module.exports = {
  prepareSvgForExport,
  polylineToPathD,
};
