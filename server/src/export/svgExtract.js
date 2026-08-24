'use strict';

const { TEMPLATE } = require('./templateRegistry');
const { accumulate, apply } = require('./transform');
const {
  flattenEllipse,
  flattenRect,
  pathToPolylines,
  transformPolylines,
  longestPolyline,
} = require('./pathUtils');
function readHrefAttr(node) {
  if (!node || typeof node.getAttribute !== 'function') return '';
  const xlink =
    (typeof node.getAttributeNS === 'function' &&
      node.getAttributeNS('http://www.w3.org/1999/xlink', 'href')) ||
    node.getAttribute('xlink:href') ||
    '';
  return xlink || node.getAttribute('href') || '';
}

function hrefId(node) {
  const h = readHrefAttr(node);
  return h.startsWith('#') ? h.slice(1) : h;
}

function isTextPathGuide(pathNode, textPathHrefs) {
  const id = pathNode.getAttribute('id');
  if (!id) return false;
  return textPathHrefs.has(`#${id}`);
}

function parseStyleFontSize(style) {
  if (!style) return 16;
  const m = style.match(/font-size\s*:\s*([\d.]+)(?:px|pt)?/i);
  if (!m) return 16;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return 16;
  // Brief PT experiment wrote sizes as pt (= CSS px × 0.75); restore numeric scale.
  const unit = (style.match(/font-size\s*:\s*[\d.]+\s*(pt|px)/i) || [])[1];
  if (unit && unit.toLowerCase() === 'pt') return n / 0.75;
  return n;
}

function parseStyleFontFamily(style) {
  if (!style) return 'FbKidushPro';
  const m = style.match(/font-family\s*:\s*['"]?([^;'"]+)/i);
  return m ? m[1].trim().replace(/['"]/g, '') : 'FbKidushPro';
}

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
  const strokeWidth =
    parseStyleValue(style, 'stroke-width') ||
    node.getAttribute('stroke-width') ||
    '1';
  return { fill, stroke, strokeWidth };
}

function isInvisiblePaint({ fill, stroke }) {
  const fillNone = !fill || fill === 'none';
  const strokeNone = !stroke || stroke === 'none';
  return fillNone && strokeNone;
}

function addShape(shapes, points, paint) {
  if (points && points.length >= 2) {
    shapes.push({ points, ...paint });
  }
}

/** Polyline points for a guide path entry (object or legacy array). */
function pathGuidePoints(guide) {
  if (!guide) return [];
  if (Array.isArray(guide)) return guide;
  return guide.points || [];
}

/** True when a textPath guide can be sampled (polyline points and/or bezier `d`). */
function hasUsablePathGuide(guide) {
  if (!guide) return false;
  if (typeof guide.d === 'string' && guide.d.trim()) return true;
  return pathGuidePoints(guide).length > 0;
}

function parseStyleLetterSpacingEm(style, fontSize) {
  const attr = parseStyleValue(style, 'letter-spacing');
  if (!attr) return 0;
  const s = String(attr).trim();
  if (s.endsWith('em')) return parseFloat(s) || 0;
  if (s.endsWith('px')) return (parseFloat(s) || 0) / (fontSize || 16);
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function isBoldWeight(value) {
  if (value == null || value === '') return false;
  const s = String(value).trim().toLowerCase();
  if (s === 'bold' || s === 'bolder') return true;
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 600;
}

/** Collect logical text + per-char bold flags from a textPath / text node. */
function readTextRuns(node) {
  let raw = '';
  const rawFlags = [];

  function walk(n, inheritedBold) {
    if (!n) return;
    if (n.nodeType === 3) {
      const t = n.nodeValue || '';
      raw += t;
      for (let i = 0; i < t.length; i += 1) rawFlags.push(inheritedBold);
      return;
    }
    if (n.nodeType !== 1) return;
    const tag = n.tagName && n.tagName.toLowerCase();
    let bold = inheritedBold;
    if (tag === 'tspan') {
      const fw =
        n.getAttribute('font-weight') ||
        parseStyleValue(n.getAttribute('style') || '', 'font-weight');
      if (fw) bold = isBoldWeight(fw);
      const sw = n.getAttribute('stroke-width');
      if (sw && parseFloat(sw) > 0) bold = true;
    }
    for (let c = n.firstChild; c; c = c.nextSibling) walk(c, bold);
  }

  walk(node, false);

  // Match legacy extract: collapse whitespace runs to a single space.
  let text = '';
  const boldFlags = [];
  let prevSpace = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    const isSpace = /\s/.test(ch);
    if (isSpace) {
      if (!prevSpace) {
        text += ' ';
        boldFlags.push(!!rawFlags[i]);
        prevSpace = true;
      }
    } else {
      text += ch;
      boldFlags.push(!!rawFlags[i]);
      prevSpace = false;
    }
  }
  return { text, boldFlags };
}

/** Text descriptors for one <text> element (same shape as extractSvgContent texts[]). */
function describeTextNode(node, matrix) {
  const items = [];
  const style = node.getAttribute('style') || '';
  const fontSize = parseStyleFontSize(style);
  const fontFamily = parseStyleFontFamily(style);
  const letterSpacingEm = parseStyleLetterSpacingEm(style, fontSize);
  const dyMatch = style.match(/dy\s*:\s*([^;]+)/i);
  const parentDy = dyMatch ? dyMatch[1].trim() : node.getAttribute('dy') || '';
  const dominantBaseline =
    node.getAttribute('dominant-baseline') ||
    parseStyleValue(style, 'dominant-baseline') ||
    'auto';

  const textPaths = [...node.childNodes].filter(
    (c) => c.tagName && c.tagName.toLowerCase() === 'textpath'
  );

  if (textPaths.length) {
    for (const textPath of textPaths) {
      const pathId = hrefId(textPath);
      const runs = readTextRuns(textPath);
      items.push({
        kind: 'textPath',
        pathId,
        text: runs.text,
        boldFlags: runs.boldFlags,
        fontSize,
        fontFamily,
        letterSpacingEm,
        startOffset: textPath.getAttribute('startOffset') || '0',
        textAnchor: textPath.getAttribute('text-anchor') || 'start',
        matrix,
        dy: textPath.getAttribute('dy') || '',
        parentDy,
        dominantBaseline,
      });
    }
  } else {
    const runs = readTextRuns(node);
    items.push({
      kind: 'plain',
      text: runs.text.trim(),
      boldFlags: runs.boldFlags,
      fontSize,
      fontFamily,
      letterSpacingEm,
      matrix,
      dy: '',
      parentDy,
    });
  }
  return items;
}

/** Walk SVG and collect geometry polylines + text descriptors. */
function extractSvgContent(doc, textPathHrefs = TEMPLATE.textPathHrefs) {
  const shapes = [];
  const texts = [];
  const pathById = {};

  function walk(node, matrix) {
    if (!node || node.nodeType !== 1) return;
    const tag = node.tagName && node.tagName.toLowerCase();
    const M = accumulate(matrix, node);

    if (tag === 'path') {
      const id = node.getAttribute('id');
      const d = node.getAttribute('d');
      if (id && d) {
        const local = pathToPolylines(d);
        pathById[id] = {
          points: longestPolyline(transformPolylines(local, M)),
          d,
          matrix: M,
        };
      }
      if (!isTextPathGuide(node, textPathHrefs)) {
        const paint = readPaint(node);
        if (!isInvisiblePaint(paint)) {
          const local = pathToPolylines(d);
          for (const line of transformPolylines(local, M)) {
            addShape(shapes, line, paint);
          }
        }
      }
    } else if (tag === 'ellipse') {
      const cx = Number(node.getAttribute('cx') || 0);
      const cy = Number(node.getAttribute('cy') || 0);
      const rx = Number(node.getAttribute('rx') || 0);
      const ry = Number(node.getAttribute('ry') || rx);
      addShape(shapes, flattenEllipse(cx, cy, rx, ry, M), readPaint(node));
    } else if (tag === 'circle') {
      const cx = Number(node.getAttribute('cx') || 0);
      const cy = Number(node.getAttribute('cy') || 0);
      const r = Number(node.getAttribute('r') || 0);
      addShape(shapes, flattenEllipse(cx, cy, r, r, M), readPaint(node));
    } else if (tag === 'rect') {
      const x = Number(node.getAttribute('x') || 0);
      const y = Number(node.getAttribute('y') || 0);
      const w = Number(node.getAttribute('width') || 0);
      const h = Number(node.getAttribute('height') || 0);
      const paint = readPaint(node);
      if (paint.fill === 'none' && paint.stroke === 'none') {
        paint.fill = '#000000';
      }
      addShape(shapes, flattenRect(x, y, w, h, M), paint);
    } else if (tag === 'text') {
      texts.push(...describeTextNode(node, M));
    }

    for (let i = 0; i < node.childNodes.length; i += 1) {
      walk(node.childNodes.item(i), M);
    }
  }

  walk(doc.documentElement, [1, 0, 0, 1, 0, 0]);

  const polylines = shapes.map((s) => s.points);
  return { shapes, polylines, texts, pathById };
}

/** DXF export: SVG user units 1:1 (Y flip applied separately in mapPolyline). */
function mapPoint(x, y, scale, svgHeight) {
  return [x * scale, (svgHeight - y) * scale];
}

function mapPolyline(line, scale, svgHeight) {
  return line.map(([x, y]) => mapPoint(x, y, scale, svgHeight));
}

module.exports = {
  extractSvgContent,
  describeTextNode,
  pathGuidePoints,
  hasUsablePathGuide,
  readHrefAttr,
  mapPolyline,
  mapPoint,
};
