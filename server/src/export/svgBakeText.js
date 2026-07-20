'use strict';

/**
 * Phase 1 of export: convert live <text>/<textPath> to vector paths while guide
 * paths are still native bezier circles — before geometry flattening for DXF.
 */

const { DOMParser } = require('@xmldom/xmldom');
const { accumulate } = require('./transform');
const { TEMPLATE } = require('./templateRegistry');
const { extractSvgContent, describeTextNode } = require('./svgExtract');
const { loadFont, layoutTextItemToPaths } = require('./svgText');

function collectTextNodes(root, out = []) {
  if (!root || root.nodeType !== 1) return out;
  const tag = root.tagName && root.tagName.toLowerCase();
  if (tag === 'text') out.push(root);
  for (let i = 0; i < root.childNodes.length; i += 1) {
    collectTextNodes(root.childNodes.item(i), out);
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

function replaceTextWithPaths(doc, textEl, pathDs) {
  const g = doc.createElement('g');
  g.setAttribute('data-exported-text', 'true');
  for (const d of pathDs) {
    if (!d) continue;
    const p = doc.createElement('path');
    p.setAttribute('d', d);
    p.setAttribute('fill', '#241F1F');
    p.setAttribute('stroke', 'none');
    g.appendChild(p);
  }
  if (textEl.parentNode) {
    textEl.parentNode.replaceChild(g, textEl);
  }
}

function readHref(node) {
  return node?.getAttribute?.('xlink:href') || node?.getAttribute?.('href') || '';
}

/** Remove textPath guide paths (by live document hrefs + registry fallback). */
function removeGuidePaths(doc) {
  const ids = new Set();
  for (const href of TEMPLATE.textPathHrefs) {
    ids.add(href.startsWith('#') ? href.slice(1) : href);
  }
  const textPaths = doc.getElementsByTagName('textPath');
  for (let i = 0; i < textPaths.length; i += 1) {
    const href = readHref(textPaths.item(i));
    if (href) ids.add(href.startsWith('#') ? href.slice(1) : href);
  }
  for (const id of ids) {
    const el = doc.getElementById(id);
    if (el?.parentNode) el.parentNode.removeChild(el);
  }
}

/**
 * Replace all text in the SVG document with outline paths (in-place).
 * Guide paths are removed afterward. Geometry (ellipses, rects) is untouched.
 * Same glyph layout as DXF export (dy + dominant-baseline="central").
 * @returns {string[]} warnings
 */
function bakeTextToPaths(doc) {
  const warnings = [];
  const textNodes = collectTextNodes(doc.documentElement);
  if (!textNodes.length) return warnings;

  const font = loadFont('FbKidushPro-bold');
  if (!font) {
    warnings.push(
      'קובץ הפונט לא נמצא בתיקייה server/fonts — הטקסט לא יומר למסלולים. ' +
        `הוסיפו ${TEMPLATE.defaultFontFile}.`
    );
    return warnings;
  }

  const { pathById } = extractSvgContent(doc);

  for (const textEl of textNodes) {
    const items = describeTextNode(textEl, matrixForNode(textEl));
    const pathDs = [];
    for (const item of items) {
      pathDs.push(...layoutTextItemToPaths(font, item, pathById));
    }
    if (!pathDs.length) {
      warnings.push('טקסט לא הומר למסלולים (פונט או נתיב חסר).');
      if (textEl.parentNode) textEl.parentNode.removeChild(textEl);
      continue;
    }
    replaceTextWithPaths(doc, textEl, pathDs);
  }

  removeGuidePaths(doc);
  return warnings;
}

module.exports = {
  bakeTextToPaths,
};
