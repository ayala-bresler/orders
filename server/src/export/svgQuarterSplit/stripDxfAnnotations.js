'use strict';

/**
 * Strip laser-irrelevant annotations from the full SVG before flatten → DXF.
 *
 * Remove:
 *   - large ring shapes: <circle>, <ellipse>, stroked ring <path>s (not textPath guides)
 *   - orientation labels only: ימין למעלה / שמאל למעלה / ימין למטה / שמאל למטה
 *
 * Keep:
 *   - all <rect> markers
 *   - all circular verse text on <textPath>
 */

const { TEMPLATE } = require('../templateRegistry');
const { VERSE_CORNER_LABELS } = require('../../config/verseLayout');
const { QUARTER_DEFS } = require('./splitQuarters');

function normalizeLabel(text) {
  return String(text || '')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Orientation labels drawn in the medallion center — not verse textPath content. */
const CORNER_LABELS = new Set(
  [
    ...Object.values(VERSE_CORNER_LABELS),
    ...QUARTER_DEFS.map((d) => d.label),
    'ימין למעלה',
    'שמאל למעלה',
    'ימין למטה',
    'שמאל למטה',
  ].map(normalizeLabel)
);

function parseStyleValue(style, prop) {
  if (!style) return null;
  const re = new RegExp(`${prop}\\s*:\\s*([^;]+)`, 'i');
  const m = style.match(re);
  return m ? m[1].trim() : null;
}

function readPaint(node) {
  const style = node.getAttribute('style') || '';
  const fill =
    parseStyleValue(style, 'fill') || node.getAttribute('fill') || 'none';
  const stroke =
    parseStyleValue(style, 'stroke') || node.getAttribute('stroke') || 'none';
  return { fill, stroke };
}

function isFillNone(fill) {
  return !fill || fill === 'none';
}

function isStrokeNone(stroke) {
  return !stroke || stroke === 'none';
}

function hrefTargetId(node) {
  const h =
    node.getAttribute('xlink:href') ||
    node.getAttribute('href') ||
    '';
  return h.startsWith('#') ? h.slice(1) : h;
}

function collectTextPathTargetIds(root, out = new Set()) {
  if (!root || root.nodeType !== 1) return out;
  const tag = root.tagName && root.tagName.toLowerCase();
  if (tag === 'textpath') {
    const id = hrefTargetId(root);
    if (id) out.add(id);
  }
  for (let i = 0; i < root.childNodes.length; i += 1) {
    collectTextPathTargetIds(root.childNodes.item(i), out);
  }
  return out;
}

function hasTextPathChild(node) {
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const c = node.childNodes.item(i);
    if (c.nodeType === 1 && c.tagName && c.tagName.toLowerCase() === 'textpath') {
      return true;
    }
  }
  return false;
}

function plainTextContent(node) {
  let out = '';
  for (let i = 0; i < node.childNodes.length; i += 1) {
    const c = node.childNodes.item(i);
    if (c.nodeType === 3) out += c.nodeValue || '';
    else if (c.nodeType === 1) {
      const tag = c.tagName && c.tagName.toLowerCase();
      if (tag === 'textpath') continue;
      out += plainTextContent(c);
    }
  }
  return out;
}

function isGuidePath(node, textPathTargetIds) {
  const id = node.getAttribute('id');
  if (!id) return false;
  if (textPathTargetIds.has(id)) return true;
  return TEMPLATE.textPathHrefs.has(`#${id}`);
}

/** Stroked closed rings drawn as <path> (e.g. size 9) — not textPath guides. */
function isStrokedRingPath(node, textPathTargetIds) {
  const tag = node.tagName && node.tagName.toLowerCase();
  if (tag !== 'path') return false;
  if (isGuidePath(node, textPathTargetIds)) return false;
  const { fill, stroke } = readPaint(node);
  if (!isFillNone(fill) || isStrokeNone(stroke)) return false;
  const d = node.getAttribute('d') || '';
  // Ring paths are multi-cubic closed curves; skip tiny/accidental strokes.
  return d.length > 80;
}

function walkCollect(root, visit, out = []) {
  if (!root || root.nodeType !== 1) return out;
  visit(root, out);
  const kids = [];
  for (let i = 0; i < root.childNodes.length; i += 1) {
    kids.push(root.childNodes.item(i));
  }
  for (const kid of kids) walkCollect(kid, visit, out);
  return out;
}

function removeNodes(nodes) {
  for (const node of nodes) {
    if (node.parentNode) node.parentNode.removeChild(node);
  }
  return nodes.length;
}

/** Remove orientation <text> (not textPath verses). Call before bake so labels never become glyph paths. */
function stripOrientationLabels(doc) {
  const root = doc.documentElement;
  if (!root) return { removed: 0 };
  const nodes = walkCollect(root, (node, out) => {
    const tag = node.tagName && node.tagName.toLowerCase();
    if (tag !== 'text' || hasTextPathChild(node)) return;
    const label = normalizeLabel(plainTextContent(node));
    if (label && CORNER_LABELS.has(label)) out.push(node);
  });
  return { removed: removeNodes(nodes) };
}

/** Remove big ring geometry only — never touches <rect> or textPath guides. */
function stripRingShapes(doc) {
  const root = doc.documentElement;
  if (!root) return { removed: 0 };
  const textPathTargetIds = collectTextPathTargetIds(root);
  const nodes = walkCollect(root, (node, out) => {
    const tag = node.tagName && node.tagName.toLowerCase();
    if (tag === 'circle' || tag === 'ellipse') out.push(node);
    else if (isStrokedRingPath(node, textPathTargetIds)) out.push(node);
  });
  return { removed: removeNodes(nodes) };
}

/**
 * Mutates `doc` in place. Call after analyzeQuarterMarkers (rects stay in the DOM),
 * before flattenSvgToPaths / bakeTextToPaths.
 */
function stripDxfAnnotations(doc) {
  const a = stripOrientationLabels(doc);
  const b = stripRingShapes(doc);
  return { removed: a.removed + b.removed };
}

module.exports = {
  stripDxfAnnotations,
  stripOrientationLabels,
  stripRingShapes,
  CORNER_LABELS,
  normalizeLabel,
};
