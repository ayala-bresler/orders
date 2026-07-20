'use strict';

/**
 * Server-side SVG field discovery (mirrors client/src/utils/svgFieldDiscovery.js).
 */

const { DOMParser } = require('@xmldom/xmldom');
const { FIELDS: LEGACY_FIELDS, FIELD_BY_HREF } = require('../config/template');
const { assignCorner, parseViewBoxNumbers } = require('./svgTemplateMeta');
const {
  VERSE_CORNER_LABELS,
  columnForCornerRing,
  applyStandardEightVerseLayout,
} = require('../config/verseLayout');

function readHref(node) {
  return node.getAttribute('xlink:href') || node.getAttribute('href') || '';
}

function slugFromHref(href) {
  const raw = String(href || '').replace(/^#/, '');
  if (!raw) return '';
  return raw.replace(/[^a-zA-Z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 64);
}

function readLabel(node, fallback) {
  return (
    node.getAttribute('data-label') ||
    node.getAttribute('aria-label') ||
    node.getAttribute('id') ||
    fallback
  );
}

function readGroup(node, serverField) {
  return (
    node.getAttribute('data-group') ||
    serverField?.group ||
    serverField?.corner ||
    'default'
  );
}

function readGroupLabel(node, groupId, serverField) {
  return (
    node.getAttribute('data-group-label') ||
    serverField?.groupLabel ||
    (groupId === 'default' ? 'שדות טקסט' : groupId)
  );
}

function readSortOrder(node, serverField, index) {
  const raw = node.getAttribute('data-order');
  if (raw != null && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  if (serverField?.sortOrder != null) return serverField.sortOrder;
  if (serverField?.ring === 'outer') return index * 10;
  if (serverField?.ring === 'inner') return index * 10 + 1;
  return index;
}

function columnForCornerRingLegacy(corner, ring) {
  return columnForCornerRing(corner, ring);
}

function closestTag(node, tagName) {
  const want = tagName.toLowerCase();
  for (let n = node; n && n.nodeType === 1; n = n.parentNode) {
    const tag = n.tagName && n.tagName.toLowerCase();
    if (tag === want) return n;
  }
  return null;
}

/** Font size from SVG style (user units as authored in the file). */
function readFontSizePx(styleAttr, fallback = 16) {
  if (!styleAttr) return fallback;
  const m = String(styleAttr).match(/font-size\s*:\s*([\d.]+)/i);
  if (!m) return fallback;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n * 10) / 10;
}

function discoverSvgTextFields(svgString, serverFields = LEGACY_FIELDS) {
  if (!svgString) return [];

  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() === 'parsererror') return [];

  const hrefToServer = Object.fromEntries(
    serverFields.filter((f) => f.href).map((f) => [f.href, f])
  );
  const fields = [];
  const seenKeys = new Set();
  let index = 0;

  const textPaths = root.getElementsByTagName('textPath');
  for (let i = 0; i < textPaths.length; i += 1) {
    const textPath = textPaths.item(i);
    const href = readHref(textPath);
    const server = hrefToServer[href];
    const parentText = closestTag(textPath, 'text');
    const key =
      server?.key ||
      textPath.id ||
      parentText?.id ||
      slugFromHref(href) ||
      `text_path_${index}`;

    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const group = readGroup(textPath, server) || readGroup(parentText, server);
    const corner = server?.corner || (group !== 'default' ? group : null);
    const ring = server?.ring || null;

    fields.push({
      key,
      label: readLabel(textPath, readLabel(parentText, server?.label || key)),
      group,
      corner,
      groupLabel: readGroupLabel(textPath, group, server),
      sortOrder: readSortOrder(textPath, server, index),
      href: href || null,
      ring,
      column: server?.column || columnForCornerRingLegacy(corner, ring),
      defaultText: (textPath.textContent || '').trim(),
      fontSizePx: readFontSizePx(parentText?.getAttribute?.('style'), server?.fontSizePx ?? 16),
      type: 'textPath',
      found: true,
    });
    index += 1;
  }

  const textNodes = root.getElementsByTagName('text');
  for (let j = 0; j < textNodes.length; j += 1) {
    const textEl = textNodes.item(j);
    if (textEl.getElementsByTagName('textPath').length) continue;
    if (textEl.getAttribute('data-editable') !== 'true') continue;

    const server = serverFields.find((f) => f.key === textEl.id);
    const key = server?.key || textEl.id || `text_${index}`;
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);

    const group = readGroup(textEl, server);
    fields.push({
      key,
      label: readLabel(textEl, server?.label || key),
      group,
      corner: server?.corner || (group !== 'default' ? group : null),
      groupLabel: readGroupLabel(textEl, group, server),
      sortOrder: readSortOrder(textEl, server, index),
      href: null,
      ring: server?.ring || null,
      column: server?.column || columnForCornerRingLegacy(server?.corner, server?.ring),
      defaultText: (textEl.textContent || '').trim(),
      fontSizePx: readFontSizePx(textEl.getAttribute('style'), server?.fontSizePx ?? 16),
      type: 'text',
      found: true,
    });
    index += 1;
  }

  for (const server of serverFields) {
    if (!server?.key || seenKeys.has(server.key)) continue;
    if (fields.filter((f) => f.type === 'textPath' && f.found).length >= 8) continue;
    fields.push({
      ...server,
      group: server.group || server.corner || 'default',
      found: false,
    });
  }

  fields.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'he'));
  return fields;
}

/** Ensure every field has corner, ring, column for DB + layout. */
function enrichDiscoveredFields(fields, svgString) {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  const vbRaw = doc.documentElement?.getAttribute?.('viewBox');
  const vb = parseViewBoxNumbers(vbRaw);
  const byCorner = Object.create(null);

  const enriched = fields.map((field) => {
    let corner = field.corner || (field.group !== 'default' ? field.group : null);
    let ring = field.ring;
    let column = field.column;

    const legacy = field.href ? FIELD_BY_HREF[field.href] : null;
    if (legacy) {
      corner = corner || legacy.corner;
      ring = ring || legacy.ring;
      column = column || legacy.column;
    }

    if (!corner && vb && field.href) {
      const pathId = field.href.replace(/^#/, '');
      const pathEl = doc.getElementById(pathId);
      const d = pathEl?.getAttribute?.('d') || '';
      const m = d.match(/^M\s*([\d.+-]+)[,\s]+([\d.+-]+)/i);
      if (m) {
        corner = assignCorner(Number(m[1]), Number(m[2]), vb);
      }
    }

    if (corner && !ring) {
      const bucket = byCorner[corner] || (byCorner[corner] = []);
      ring = bucket.length === 0 ? 'inner' : bucket.length === 1 ? 'outer' : 'inner';
      bucket.push(field.key);
    }

    column = column || columnForCornerRingLegacy(corner, ring);

    const cornerLabel = corner ? VERSE_CORNER_LABELS[corner] : null;

    return {
      ...field,
      corner,
      ring,
      column,
      group: field.group || corner || 'default',
      groupLabel: cornerLabel || field.groupLabel,
    };
  });

  return applyStandardEightVerseLayout(enriched);
}

function buildFieldMaps(fields) {
  const fieldByKey = Object.fromEntries(fields.map((f) => [f.key, f]));
  const fieldByHref = Object.fromEntries(
    fields.filter((f) => f.href).map((f) => [f.href, f])
  );
  const fieldByColumn = Object.fromEntries(
    fields.filter((f) => f.column).map((f) => [f.column, f])
  );
  const editableColumns = [...new Set(fields.map((f) => f.column).filter(Boolean))];
  return { fieldByKey, fieldByHref, fieldByColumn, editableColumns };
}

module.exports = {
  discoverSvgTextFields,
  enrichDiscoveredFields,
  buildFieldMaps,
  columnForCornerRing: columnForCornerRingLegacy,
};
