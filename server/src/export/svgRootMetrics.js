'use strict';

const { DOMParser } = require('@xmldom/xmldom');

/** Read viewBox / width / height from the root <svg> only (never from child shapes). */
function readRootSvgMetrics(docOrString) {
  const doc =
    typeof docOrString === 'string'
      ? new DOMParser().parseFromString(docOrString, 'image/svg+xml')
      : docOrString;

  const root = doc.documentElement;
  const tag = root && root.tagName && root.tagName.toLowerCase();
  if (!root || tag !== 'svg') {
    throw new Error('SVG root element is missing or invalid.');
  }

  const viewBoxAttr = root.getAttribute('viewBox');
  if (!viewBoxAttr || !viewBoxAttr.trim()) {
    throw new Error('SVG root is missing viewBox.');
  }
  const viewBox = viewBoxAttr.trim();
  let width = root.getAttribute('width');
  let height = root.getAttribute('height');

  if (!width || !height) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4) {
      width = width || String(parts[2]);
      height = height || String(parts[3]);
    }
  }

  if (!width || !height) {
    throw new Error('SVG root is missing width/height and viewBox dimensions.');
  }

  return { viewBox, width, height };
}

module.exports = { readRootSvgMetrics };
