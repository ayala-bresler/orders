'use strict';

const { bakeTextToPaths } = require('../svgBakeText');
const { extractSvgContent } = require('../svgExtract');

/**
 * Step 2: bake verse text to outline paths, then flatten remaining shapes to polylines.
 * Big rings and orientation labels are stripped earlier; all <rect> markers remain.
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
