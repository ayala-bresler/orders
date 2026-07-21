'use strict';

const { DOMParser } = require('@xmldom/xmldom');
const { readRootSvgMetrics } = require('../svgRootMetrics');
const { analyzeQuarterMarkers, removeMarkerRects } = require('./analyzeMarkers');
const { stripDxfAnnotations } = require('./stripDxfAnnotations');
const { flattenSvgToPaths } = require('./flattenToPaths');
const {
  SCALE_FACTOR,
  scalePaths,
  scaleIntersection,
  scaleCanvas,
} = require('./scalePaths');
const { splitIntoQuarters, QUARTER_DEFS } = require('./splitQuarters');

/**
 * SVG → 4 quarter SVGs pipeline (steps 1–5):
 *
 * 1. analyzeQuarterMarkers  — read original <rect> markers; compute X_mid, Y_mid
 * 1b.stripDxfAnnotations    — drop rings, corner labels, marker rects (laser DXF)
 * 2. flattenSvgToPaths      — text + shapes → polylines (paths kept, not removed)
 * 3. scalePaths             — multiply all coordinates + cut lines by SCALE_FACTOR
 * 4. splitIntoQuarters      — assign geometry per scaled quarter; origin at (0,0)
 * 5. return quarter SVGs    — ready for DXF conversion
 *
 * @param {string} rawSvgString - Original SVG XML (marker rects intact).
 * @param {{ scaleFactor?: number }} [options]
 */
function splitSvgIntoQuarters(rawSvgString, options = {}) {
  const scaleFactor = options.scaleFactor ?? SCALE_FACTOR;
  const warnings = [];
  const doc = new DOMParser().parseFromString(rawSvgString, 'image/svg+xml');

  // Step 1: cut lines from original (unscaled) marker rects
  const analysis = analyzeQuarterMarkers(doc);
  warnings.push(...analysis.warnings);

  // Step 1b: remove annotations that must not appear in laser DXF
  removeMarkerRects(analysis.rectNodes);
  stripDxfAnnotations(doc);

  const { viewBox, width, height } = readRootSvgMetrics(doc);
  const vbParts = viewBox.split(/[\s,]+/).map(Number);
  const canvasWidth = vbParts.length === 4 ? vbParts[2] : Number(width);
  const canvasHeight = vbParts.length === 4 ? vbParts[3] : Number(height);

  // Step 2: flatten to path polylines (rings / labels / markers already gone)
  const { paths: flatPaths, warnings: flattenWarnings } = flattenSvgToPaths(doc);
  warnings.push(...flattenWarnings);

  // Step 3: uniform scale on geometry and cut lines
  const scaledPaths = scalePaths(flatPaths, scaleFactor);
  const intersection = scaleIntersection(analysis.xMid, analysis.yMid, scaleFactor);
  const canvas = scaleCanvas(canvasWidth, canvasHeight, scaleFactor);

  // Step 4: split by scaled intersection; each quarter viewBox starts at (0,0)
  const quarters = splitIntoQuarters(scaledPaths, {
    xMid: intersection.xMid,
    yMid: intersection.yMid,
    canvasWidth: canvas.canvasWidth,
    canvasHeight: canvas.canvasHeight,
  });

  // Step 5: output
  return {
    quarters,
    intersection,
    analysis: analysis.summary,
    scaleFactor,
    warnings,
    flattenedPathCount: flatPaths.length,
    canvas: {
      viewBox: `0 0 ${canvas.canvasWidth} ${canvas.canvasHeight}`,
      width: String(canvas.canvasWidth),
      height: String(canvas.canvasHeight),
      canvasWidth: canvas.canvasWidth,
      canvasHeight: canvas.canvasHeight,
      original: { viewBox, width, height, canvasWidth, canvasHeight },
    },
  };
}

module.exports = {
  splitSvgIntoQuarters,
  analyzeQuarterMarkers,
  flattenSvgToPaths,
  scalePaths,
  scaleIntersection,
  scaleCanvas,
  splitIntoQuarters,
  SCALE_FACTOR,
  QUARTER_DEFS,
  stripDxfAnnotations,
};
