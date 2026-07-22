'use strict';

/**
 * Canonical verse defaults — always the texts from sizes/12.svg (same as 11–15).
 * Applied at runtime for every size (including 9) without rewriting size SVG files.
 */

const fs = require('fs');
const path = require('path');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const {
  discoverSvgTextFields,
  enrichDiscoveredFields,
} = require('./svgFieldDiscovery');
const { FIELDS: LEGACY_FIELDS } = require('../config/template');

const CANONICAL_SIZE_SVG = path.resolve(
  __dirname,
  '..',
  '..',
  'templates',
  'sizes',
  '12.svg'
);

/** @type {Record<string, string>|null} */
let _byKey = null;

function clearCanonicalVerseCache() {
  _byKey = null;
}

function loadCanonicalVerseDefaultsByKey() {
  if (_byKey) return _byKey;
  if (!fs.existsSync(CANONICAL_SIZE_SVG)) {
    _byKey = {};
    return _byKey;
  }
  const raw = fs.readFileSync(CANONICAL_SIZE_SVG, 'utf8');
  const discovered = discoverSvgTextFields(raw, LEGACY_FIELDS);
  const fields = enrichDiscoveredFields(discovered, raw);
  const out = {};
  for (const field of fields) {
    if (field?.key) {
      out[field.key] = String(field.defaultText || field.text || '').trim();
    }
  }
  _byKey = out;
  return _byKey;
}

/** Overlay canonical defaultText onto discovered fields (by key). */
function applyCanonicalDefaultsToFields(fields) {
  const defaults = loadCanonicalVerseDefaultsByKey();
  if (!fields?.length || !Object.keys(defaults).length) return fields || [];
  return fields.map((field) => {
    const text = defaults[field.key];
    if (text == null || text === '') return field;
    return { ...field, defaultText: text, text };
  });
}

/**
 * Replace editable textPath contents with canonical verses (by field href/key).
 * Mutates `doc`.
 */
function applyCanonicalVersesToDoc(doc, fields) {
  const defaults = loadCanonicalVerseDefaultsByKey();
  if (!doc || !fields?.length) return 0;

  let updated = 0;
  for (const field of fields) {
    const text = defaults[field.key];
    if (text == null) continue;
    const href = field.href || '';
    const id = href.startsWith('#') ? href.slice(1) : href;
    if (!id) continue;

    const textPaths = doc.getElementsByTagName('textPath');
    for (let i = 0; i < textPaths.length; i += 1) {
      const tp = textPaths.item(i);
      const h = tp.getAttribute('xlink:href') || tp.getAttribute('href') || '';
      const hid = h.startsWith('#') ? h.slice(1) : h;
      if (hid !== id) continue;
      while (tp.firstChild) tp.removeChild(tp.firstChild);
      tp.appendChild(doc.createTextNode(text));
      updated += 1;
      break;
    }
  }
  return updated;
}

function prepareTemplateSvgString(svgRaw, fields) {
  const doc = new DOMParser().parseFromString(svgRaw, 'image/svg+xml');
  applyCanonicalVersesToDoc(doc, fields);
  return new XMLSerializer().serializeToString(doc);
}

module.exports = {
  CANONICAL_SIZE_SVG,
  loadCanonicalVerseDefaultsByKey,
  clearCanonicalVerseCache,
  applyCanonicalDefaultsToFields,
  applyCanonicalVersesToDoc,
  prepareTemplateSvgString,
};
