'use strict';

const { bakeTextToPaths } = require('../svgBakeText');
const { extractSvgContent } = require('../svgExtract');

/**
 * Step 2: bake text to outline paths, then flatten ellipses / rects / paths to polylines.
 * Marker rects are kept — they are assigned to their quarter during split.
 */
function flattenSvgToPaths(doc) {
  const warnings = [...bakeTextToPaths(doc)];
  const { shapes } = extractSvgContent(doc);
  const paths = [];

  for (const shape of shapes) {
    if (!shape.points || shape.points.length < 2) continue;
    paths.push({
      points: shape.points,
      close: shape.close !== false,
      fill: shape.fill || 'none',
      stroke: shape.stroke || 'none',
      strokeWidth: shape.strokeWidth,
    });
  }

  return { paths, warnings };
}

module.exports = { flattenSvgToPaths };
