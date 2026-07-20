'use strict';

/**
 * Step 3 — uniform scale applied to flattened geometry before quarter split.
 * 35.2778% of original SVG user units (matches CNC / manufacturing sheet size).
 */
const SCALE_FACTOR = 0.352778;

function scalePoint(x, y, factor = SCALE_FACTOR) {
  return [x * factor, y * factor];
}

function scalePoints(points, factor = SCALE_FACTOR) {
  return points.map(([x, y]) => scalePoint(x, y, factor));
}

/**
 * Scale one flattened shape (polyline + paint). Stroke width scales with geometry.
 */
function scalePathShape(shape, factor = SCALE_FACTOR) {
  const scaled = {
    ...shape,
    points: scalePoints(shape.points, factor),
  };

  if (shape.strokeWidth != null && shape.stroke && shape.stroke !== 'none') {
    const sw = Number(shape.strokeWidth);
    if (!Number.isNaN(sw)) {
      scaled.strokeWidth = String(sw * factor);
    }
  }

  return scaled;
}

/** Scale every flattened path shape in-place mathematically (not via SVG transform). */
function scalePaths(paths, factor = SCALE_FACTOR) {
  return paths.map((shape) => scalePathShape(shape, factor));
}

/** Scale cut lines computed from original marker rects (step 1). */
function scaleIntersection(xMid, yMid, factor = SCALE_FACTOR) {
  return {
    xMid: xMid * factor,
    yMid: yMid * factor,
    scaleFactor: factor,
    original: { xMid, yMid },
  };
}

/** Scale full canvas dimensions to match scaled geometry. */
function scaleCanvas(canvasWidth, canvasHeight, factor = SCALE_FACTOR) {
  return {
    canvasWidth: canvasWidth * factor,
    canvasHeight: canvasHeight * factor,
    scaleFactor: factor,
    original: { canvasWidth, canvasHeight },
  };
}

module.exports = {
  SCALE_FACTOR,
  scalePoint,
  scalePoints,
  scalePathShape,
  scalePaths,
  scaleIntersection,
  scaleCanvas,
};
