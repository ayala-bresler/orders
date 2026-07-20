'use strict';

/**
 * svgService — load and personalize SVG templates while preserving original dimensions.
 * Template selection is dynamic (product_sizes); geometry is derived per file.
 */

const fs = require('fs');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const {
  FIELDS: LEGACY_FIELDS,
  FIELD_BY_KEY: LEGACY_FIELD_BY_KEY,
  FIELD_BY_HREF: LEGACY_FIELD_BY_HREF,
  MASTER_SVG_PATH,
} = require('../config/template');
const templateResolver = require('./templateResolver');
const {
  normalizeVerseText,
} = require('../utils/verseText');
const {
  BASE_FONT_SIZE_PX,
  MAX_FONT_SIZE_PX,
  MIN_FONT_SIZE_PX,
  validateStylesMap,
  styleForKey,
} = require('../config/verseStyles');
const { extractSvgContent } = require('../export/svgExtract');
const {
  loadFont,
  computeRingCenteringDyEm,
} = require('../export/svgText');

const MAX_VERSE_LENGTH = 350;
const BASE_FONT = BASE_FONT_SIZE_PX;
const MIN_FONT = MIN_FONT_SIZE_PX;

function fieldBaseFontSize(field) {
  const n = Number(field?.fontSizePx);
  return Number.isFinite(n) ? n : BASE_FONT;
}

/** @type {Map<string, { mtimeMs: number, raw: string }>} */
const _svgCache = new Map();

function fieldMaps(ctx) {
  return {
    fields: ctx.fields,
    fieldByKey: ctx.fieldByKey,
    fieldByHref: ctx.fieldByHref,
    fieldByColumn: ctx.fieldByColumn,
    editableColumns: ctx.editableColumns,
  };
}

function legacyContext() {
  return templateResolver.buildDefaultContext();
}

function resolveContext(templateContext) {
  return templateContext || legacyContext();
}

/**
 * Read SVG from disk (cached by path + mtime). Read-only.
 * @param {string} [svgPath]
 */
function loadMasterSvg(svgPath = MASTER_SVG_PATH) {
  let stat;
  try {
    stat = fs.statSync(svgPath);
  } catch (err) {
    throw new Error(
      `Master SVG template not found at "${svgPath}". (${err.code})`
    );
  }
  const cached = _svgCache.get(svgPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.raw;
  }
  const raw = fs.readFileSync(svgPath, 'utf8');
  _svgCache.set(svgPath, { mtimeMs: stat.mtimeMs, raw });
  return raw;
}

function parse(svgString) {
  const errors = [];
  const doc = new DOMParser({
    onError: (level, msg) => {
      if (level === 'fatalError') errors.push(msg);
    },
  }).parseFromString(svgString, 'text/xml');
  if (errors.length) {
    throw new Error(`Failed to parse SVG template: ${errors.join('; ')}`);
  }
  return doc;
}

function readHref(node) {
  return node.getAttribute('xlink:href') || node.getAttribute('href') || '';
}

function setTextContent(doc, node, value) {
  while (node.firstChild) node.removeChild(node.firstChild);
  node.appendChild(doc.createTextNode(value));
}

function indexEditableNodes(doc, fieldByHref) {
  const map = new Map();
  const nodes = doc.getElementsByTagName('textPath');
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes.item(i);
    const href = readHref(node);
    if (href && fieldByHref[href]) {
      map.set(href, node);
    }
  }
  return map;
}

function extractEditableFields(svgString, templateContext) {
  const ctx = resolveContext(templateContext);
  const raw = svgString || loadMasterSvg(ctx.svgPath);
  const doc = parse(raw);
  const nodeMap = indexEditableNodes(doc, ctx.fieldByHref);

  return ctx.fields.map((field) => {
    const node = nodeMap.get(field.href);
    const text = node ? (node.textContent || '').trim() : field.defaultText || '';
    return {
      key: field.key,
      column: field.column,
      corner: field.corner,
      ring: field.ring,
      label: field.label,
      href: field.href,
      group: field.group,
      groupLabel: field.groupLabel,
      sortOrder: field.sortOrder,
      fontSizePx: fieldBaseFontSize(field),
      text,
      found: Boolean(node),
    };
  });
}

function getDefaults(templateContext) {
  const out = {};
  for (const f of extractEditableFields(null, templateContext)) out[f.key] = f.text;
  return out;
}

function validateValues(input, templateContext) {
  const ctx = resolveContext(templateContext);
  const errors = [];
  const values = {};
  if (input == null || typeof input !== 'object') {
    return { values, errors: ['Payload must be an object of { fieldKey: text }.'] };
  }
  for (const [key, rawVal] of Object.entries(input)) {
    if (!ctx.fieldByKey[key]) {
      errors.push(`Unknown field key "${key}" (only verse text nodes are editable).`);
      continue;
    }
    if (rawVal == null) {
      values[key] = '';
      continue;
    }
    if (typeof rawVal !== 'string') {
      errors.push(`Field "${key}" must be a string.`);
      continue;
    }
    const clean = normalizeVerseText(rawVal);
    if (clean.length > MAX_VERSE_LENGTH) {
      errors.push(`Field "${key}" exceeds ${MAX_VERSE_LENGTH} characters.`);
      continue;
    }
    values[key] = clean;
  }
  return { values, errors };
}

function validateFontScales(input, templateContext) {
  const ctx = resolveContext(templateContext);
  const { styles, errors } = validateStylesMap(input, ctx.fieldByKey);
  return { scales: styles, errors };
}

function setTextFontSize(textEl, sizePx) {
  if (!textEl) return;
  let style = textEl.getAttribute('style') || '';
  const px = `${Number(sizePx).toFixed(2)}px`;
  if (/font-size\s*:/i.test(style)) {
    style = style.replace(/font-size\s*:\s*[\d.]+(?:px|pt)/i, `font-size:${px}`);
  } else {
    if (style.trim() && !style.trim().endsWith(';')) style += ';';
    style += `font-size:${px}`;
  }
  textEl.setAttribute('style', style);
}

function setTextLetterSpacing(textEl, letterSpacingEm) {
  if (!textEl) return;
  let style = textEl.getAttribute('style') || '';
  const em = Number(letterSpacingEm);
  if (!Number.isFinite(em) || Math.abs(em) < 0.0001) {
    if (/letter-spacing\s*:/i.test(style)) {
      style = style.replace(/letter-spacing\s*:\s*[^;]+;?/i, '');
      textEl.setAttribute('style', style.trim());
    }
    return;
  }
  const val = `${em.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}em`;
  if (/letter-spacing\s*:/i.test(style)) {
    style = style.replace(/letter-spacing\s*:\s*[^;]+/i, `letter-spacing:${val}`);
  } else {
    if (style.trim() && !style.trim().endsWith(';')) style += ';';
    style += `letter-spacing:${val}`;
  }
  textEl.setAttribute('style', style);
}

function fmtDyEm(dyEm) {
  const em = Number(dyEm);
  if (!Number.isFinite(em)) return '0.4em';
  return `${em.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}em`;
}

function applyVerseLayout(doc, primaryPath, text, stylesMap, field) {
  const textEl = primaryPath.parentNode;
  if (!textEl) return;

  const line = normalizeVerseText(text);
  const basePx = fieldBaseFontSize(field);
  const verseStyle = styleForKey(stylesMap, field.key, basePx);
  const sizePx = Math.max(MIN_FONT, verseStyle.fontSizePx);
  setTextFontSize(textEl, sizePx);
  setTextLetterSpacing(textEl, verseStyle.letterSpacingEm);
  setTextContent(doc, primaryPath, line);
  // Uniform arc midpoint: path rotate places top/bottom; offset stays centered.
  primaryPath.setAttribute('text-anchor', 'middle');
  primaryPath.setAttribute('startOffset', '50%');
}

/**
 * Recompute equal-margin ring dy for every verse at the current font size / text.
 * Matches DXF outline placement (absolute ink midpoint between R_min and R_max).
 */
function applyDynamicRingDy(doc, ctx, stylesMap) {
  const font = loadFont('FbKidushPro-bold');
  if (!font) return;

  const { pathById } = extractSvgContent(doc);
  const textPaths = doc.getElementsByTagName('textPath');

  for (let i = 0; i < textPaths.length; i += 1) {
    const textPath = textPaths.item(i);
    const href = readHref(textPath);
    const field = href ? ctx.fieldByHref[href] : null;
    if (!field) continue;

    const textEl = textPath.parentNode;
    const pathId = href.startsWith('#') ? href.slice(1) : href;
    const pathGuide = pathById[pathId];
    const corner = field.corner || field.group;
    const center = ctx.meta?.medallionCenters?.[corner];
    const radii = ctx.meta?.ringRadii?.[corner];
    if (!textEl || !pathGuide || !center || !radii?.innerRx || !radii?.outerRx) continue;

    const basePx = fieldBaseFontSize(field);
    const verseStyle = styleForKey(stylesMap, field.key, basePx);
    const fontSize = Math.max(MIN_FONT, verseStyle.fontSizePx);
    const text = normalizeVerseText(textPath.textContent || '');

    textPath.setAttribute('text-anchor', 'middle');
    textPath.setAttribute('startOffset', '50%');

    const dyEm = computeRingCenteringDyEm(font, text, fontSize, {
      pathGuide,
      startOffset: '50%',
      textAnchor: 'middle',
      cx: center.cx,
      cy: center.cy,
      innerRx: radii.innerRx,
      outerRx: radii.outerRx,
      letterSpacingEm: verseStyle.letterSpacingEm || 0,
    });

    textEl.setAttribute('dominant-baseline', 'central');
    textEl.setAttribute('alignment-baseline', 'middle');
    textEl.setAttribute('dy', fmtDyEm(dyEm));
    textPath.removeAttribute('dy');
    textPath.setAttribute('dominant-baseline', 'central');
    textPath.setAttribute('alignment-baseline', 'middle');
  }
}

function computeLayoutMetrics(values = {}, fontScales = {}, templateContext) {
  const ctx = resolveContext(templateContext);
  const { scales: cleanScales } = validateFontScales(fontScales, ctx);
  const layout = {};

  for (const field of ctx.fields) {
    const basePx = fieldBaseFontSize(field);
    const style = styleForKey(cleanScales, field.key, basePx);
    layout[field.key] = {
      baseFontSizePx: basePx,
      effectiveFontSizePx: Math.round(style.fontSizePx * 10) / 10,
      letterSpacingEm: style.letterSpacingEm,
      atMinFontSize: style.fontSizePx <= MIN_FONT_SIZE_PX + 0.01,
    };
  }

  return layout;
}

/**
 * Produce a personalized copy of the selected SVG template.
 * Original viewBox / width / height are never modified — only text nodes change.
 */
function renderCustomizedSvg(values = {}, fontScales = {}, templateContext) {
  const ctx = resolveContext(templateContext);
  const { values: clean, errors } = validateValues(values, ctx);
  if (errors.length) {
    const err = new Error(errors.join(' '));
    err.status = 400;
    throw err;
  }
  const { scales: cleanScales, errors: scaleErrors } = validateFontScales(fontScales, ctx);
  if (scaleErrors.length) {
    const err = new Error(scaleErrors.join(' '));
    err.status = 400;
    throw err;
  }

  const doc = parse(loadMasterSvg(ctx.svgPath));
  const nodeMap = indexEditableNodes(doc, ctx.fieldByHref);

  for (const [key, text] of Object.entries(clean)) {
    const field = ctx.fieldByKey[key];
    const node = nodeMap.get(field.href);
    if (!node) continue;
    applyVerseLayout(doc, node, text, cleanScales, field);
  }

  applyDynamicRingDy(doc, ctx, cleanScales);

  return new XMLSerializer().serializeToString(doc);
}

/**
 * Preview SVG — by default keeps live <textPath> (fast).
 * Pass { bake: true } for path outlines that match DXF ring centering exactly.
 */
function renderPreviewSvg(values = {}, fontScales = {}, templateContext, options = {}) {
  const customized = renderCustomizedSvg(values, fontScales, templateContext);
  if (!options.bake) return customized;
  const { bakeTextToPaths } = require('../export/svgBakeText');
  const doc = parse(customized);
  bakeTextToPaths(doc);
  return new XMLSerializer().serializeToString(doc);
}

function valuesFromColumns(row = {}, templateContext) {
  const ctx = resolveContext(templateContext);
  const out = {};
  for (const field of ctx.fields) {
    if (field.column && row[field.column] != null) out[field.key] = row[field.column];
  }
  return out;
}

function columnsFromValues(values = {}, templateContext) {
  const ctx = resolveContext(templateContext);
  const out = {};
  for (const [key, val] of Object.entries(values)) {
    const field = ctx.fieldByKey[key];
    if (field?.column) out[field.column] = val;
  }
  return out;
}

module.exports = {
  MAX_VERSE_LENGTH,
  BASE_FONT_SIZE_PX,
  MAX_FONT_SIZE_PX,
  loadMasterSvg,
  extractEditableFields,
  getDefaults,
  validateValues,
  validateFontScales,
  renderPreviewSvg,
  computeLayoutMetrics,
  renderCustomizedSvg,
  valuesFromColumns,
  columnsFromValues,
  resolveContext,
  fieldMaps,
  LEGACY_FIELDS,
  LEGACY_FIELD_BY_KEY,
  LEGACY_FIELD_BY_HREF,
};
