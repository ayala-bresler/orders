'use strict';

const { accumulate, apply } = require('../transform');
const { fmt } = require('./svgFormat');

function collectRectNodes(root, out = []) {
  if (!root || root.nodeType !== 1) return out;
  const tag = root.tagName && root.tagName.toLowerCase();
  if (tag === 'rect') out.push(root);
  for (let i = 0; i < root.childNodes.length; i += 1) {
    collectRectNodes(root.childNodes.item(i), out);
  }
  return out;
}

function matrixForNode(node) {
  const chain = [];
  for (let n = node; n && n.nodeType === 1; n = n.parentNode) {
    chain.unshift(n);
  }
  let m = [1, 0, 0, 1, 0, 0];
  for (const el of chain) {
    m = accumulate(m, el);
  }
  return m;
}

function readRectBounds(rectEl) {
  const x = Number(rectEl.getAttribute('x') || 0);
  const y = Number(rectEl.getAttribute('y') || 0);
  const w = Number(rectEl.getAttribute('width') || 0);
  const h = Number(rectEl.getAttribute('height') || 0);
  const matrix = matrixForNode(rectEl);

  const corners = [
    apply(matrix, x, y),
    apply(matrix, x + w, y),
    apply(matrix, x + w, y + h),
    apply(matrix, x, y + h),
  ];

  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);

  return {
    node: rectEl,
    x: Math.min(...xs),
    y: Math.min(...ys),
    right: Math.max(...xs),
    bottom: Math.max(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

/**
 * Step 1 — locate original <rect> markers and compute the exact quarter
 * intersection (X_mid, Y_mid) in **original** SVG user units (before scale).
 *
 * Left column  = first half of rects sorted by X (then Y).
 * Right column = second half.
 * Top row      = first half of rects sorted by Y (then X).
 * Bottom row   = second half.
 *
 * X_mid = midpoint between max-right of left column and min-left of right column.
 * Y_mid = midpoint between max-bottom of top row and min-top of bottom row.
 */
function analyzeQuarterMarkers(doc) {
  const warnings = [];
  const rectNodes = collectRectNodes(doc.documentElement);

  if (rectNodes.length < 2) {
    throw new Error(
      `נדרשים לפחות 2 אלמנטי <rect> לחישוב קווי החיתוך; נמצאו ${rectNodes.length}.`
    );
  }

  if (rectNodes.length !== 16) {
    warnings.push(
      `צפויים 16 מלבני מיקום; נמצאו ${rectNodes.length}. החישוב יתבצע על חלוקה לשניים.`
    );
  }

  const rects = rectNodes.map(readRectBounds);

  const byX = [...rects].sort((a, b) => a.x - b.x || a.y - b.y);
  const byY = [...rects].sort((a, b) => a.y - b.y || a.x - b.x);

  const half = Math.floor(rects.length / 2);
  const leftColumn = byX.slice(0, half);
  const rightColumn = byX.slice(half);
  const topRow = byY.slice(0, half);
  const bottomRow = byY.slice(half);

  const leftMaxRight = Math.max(...leftColumn.map((r) => r.right));
  const rightMinLeft = Math.min(...rightColumn.map((r) => r.x));
  const topMaxBottom = Math.max(...topRow.map((r) => r.bottom));
  const bottomMinTop = Math.min(...bottomRow.map((r) => r.y));

  const xMid = (leftMaxRight + rightMinLeft) / 2;
  const yMid = (topMaxBottom + bottomMinTop) / 2;

  return {
    xMid,
    yMid,
    rects,
    rectNodes,
    leftColumn,
    rightColumn,
    topRow,
    bottomRow,
    warnings,
    summary: {
      leftMaxRight: fmt(leftMaxRight),
      rightMinLeft: fmt(rightMinLeft),
      topMaxBottom: fmt(topMaxBottom),
      bottomMinTop: fmt(bottomMinTop),
      xMid: fmt(xMid),
      yMid: fmt(yMid),
    },
  };
}

function removeMarkerRects(rectNodes) {
  for (const node of rectNodes) {
    if (node.parentNode) node.parentNode.removeChild(node);
  }
}

module.exports = {
  analyzeQuarterMarkers,
  removeMarkerRects,
  collectRectNodes,
  readRectBounds,
};
