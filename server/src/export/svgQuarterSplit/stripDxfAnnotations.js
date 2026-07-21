'use strict';

/**
 * Strip laser-irrelevant annotations from the SVG DOM before flatten → DXF.
 * Removes: outer/inner rings (circle/ellipse + stroked ring paths),
 * corner labels (e.g. "ימין למעלה"), after markers were already analyzed.
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

const CORNER_LABELS = new Set(
  [
    ...Object.values(VERSE_CORNER_LABELS),
    ...QUARTER_DEFS.map((d) => d.label),
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

function collectRemovable(root, textPathTargetIds, out = []) {
  if (!root || root.nodeType !== 1) return out;
  const tag = root.tagName && root.tagName.toLowerCase();

  if (tag === 'circle' || tag === 'ellipse') {
    out.push(root);
  } else if (tag === 'text' && !hasTextPathChild(root)) {
    const label = normalizeLabel(plainTextContent(root));
    if (label && CORNER_LABELS.has(label)) out.push(root);
  } else if (isStrokedRingPath(root, textPathTargetIds)) {
    out.push(root);
  }

  // Snapshot children — we may remove descendants later.
  const kids = [];
  for (let i = 0; i < root.childNodes.length; i += 1) {
    kids.push(root.childNodes.item(i));
  }
  for (const kid of kids) {
    collectRemovable(kid, textPathTargetIds, out);
  }
  return out;
}

/**
 * Mutates `doc` in place. Call after analyzeQuarterMarkers / removeMarkerRects,
 * before flattenSvgToPaths / bakeTextToPaths.
 */
function stripDxfAnnotations(doc) {
  const root = doc.documentElement;
  if (!root) return { removed: 0 };

  const textPathTargetIds = collectTextPathTargetIds(root);
  const nodes = collectRemovable(root, textPathTargetIds);
  for (const node of nodes) {
    if (node.parentNode) node.parentNode.removeChild(node);
  }
  return { removed: nodes.length };
}

module.exports = {
  stripDxfAnnotations,
  CORNER_LABELS,
  normalizeLabel,
};
