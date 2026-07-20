import {
  VERSE_CORNER_ORDER,
  VERSE_CORNER_LABELS,
  applyStandardEightVerseLayout,
} from './verseLayout.js';

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

/** Font size from SVG style (as authored in the file). */
function readFontSizePx(styleAttr, fallback = 16) {
  if (!styleAttr) return fallback;
  const m = String(styleAttr).match(/font-size\s*:\s*([\d.]+)/i);
  if (!m) return fallback;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n * 10) / 10;
}

/**
 * Parse SVG markup and return editable field descriptors.
 * @param {string} svgString
 * @param {Array<object>} [serverFields] optional API metadata (keys, columns, labels)
 * @returns {Array<object>}
 */
export function discoverSvgTextFields(svgString, serverFields = []) {
  if (!svgString) return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() === 'parsererror') return [];

  const hrefToServer = Object.fromEntries(
    serverFields.filter((f) => f.href).map((f) => [f.href, f])
  );
  const fields = [];
  const seenKeys = new Set();
  let index = 0;

  root.querySelectorAll('textPath').forEach((textPath) => {
    const href = readHref(textPath);
    const server = hrefToServer[href];
    const parentText = textPath.closest('text');
    const key =
      server?.key ||
      textPath.id ||
      parentText?.id ||
      slugFromHref(href) ||
      `text_path_${index}`;

    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    const group = readGroup(textPath, server) || readGroup(parentText, server);
    fields.push({
      key,
      label: readLabel(textPath, readLabel(parentText, server?.label || key)),
      group,
      groupLabel: readGroupLabel(textPath, group, server),
      sortOrder: readSortOrder(textPath, server, index),
      href: href || null,
      ring: server?.ring || null,
      column: server?.column || null,
      defaultText: (textPath.textContent || '').trim(),
      fontSizePx: readFontSizePx(
        parentText?.getAttribute?.('style'),
        server?.fontSizePx ?? 16
      ),
      type: 'textPath',
      found: true,
    });
    index += 1;
  });

  root.querySelectorAll('text[data-editable="true"]').forEach((textEl) => {
    if (textEl.querySelector('textPath')) return;

    const server = serverFields.find((f) => f.key === textEl.id);
    const key = server?.key || textEl.id || `text_${index}`;
    if (seenKeys.has(key)) return;
    seenKeys.add(key);

    const group = readGroup(textEl, server);
    fields.push({
      key,
      label: readLabel(textEl, server?.label || key),
      group,
      groupLabel: readGroupLabel(textEl, group, server),
      sortOrder: readSortOrder(textEl, server, index),
      href: null,
      ring: server?.ring || null,
      column: server?.column || null,
      defaultText: (textEl.textContent || '').trim(),
      fontSizePx: readFontSizePx(textEl.getAttribute('style'), server?.fontSizePx ?? 16),
      type: 'text',
      found: true,
    });
    index += 1;
  });

  for (const server of serverFields) {
    if (!server?.key || seenKeys.has(server.key)) continue;
    if (fields.filter((f) => f.type === 'textPath' && f.found).length >= 8) continue;
    fields.push({
      key: server.key,
      label: server.label || server.key,
      group: server.group || server.corner || 'default',
      groupLabel: server.groupLabel || server.label || server.corner || 'default',
      sortOrder: readSortOrder({ getAttribute: () => null }, server, index),
      href: server.href || null,
      ring: server.ring || null,
      column: server.column || null,
      defaultText: server.text || '',
      fontSizePx: server.fontSizePx ?? 16,
      type: 'textPath',
      found: false,
    });
    index += 1;
  }

  fields.sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'he'));
  return applyStandardEightVerseLayout(fields);
}

/**
 * Group discovered fields for dynamic form layout.
 * @returns {Array<{ id: string, label: string, items: object[] }>}
 */
export function groupDiscoveredFields(fields) {
  const groups = new Map();

  for (const field of fields) {
    const id = field.group || 'default';
    if (!groups.has(id)) {
      groups.set(id, {
        id,
        label: field.groupLabel || id,
        sortOrder: field.sortOrder,
        items: [],
      });
    }
    const group = groups.get(id);
    group.items.push(field);
    group.sortOrder = Math.min(group.sortOrder, field.sortOrder);
    if (field.groupLabel && group.label === id) {
      group.label = field.groupLabel;
    }
  }

  return [...groups.values()]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'he'))
    .map((g) => {
      let label = g.label;
      if (VERSE_CORNER_LABELS[g.id]) {
        label = VERSE_CORNER_LABELS[g.id];
      } else if (!label || label === g.id || /^[a-z0-9_]+$/i.test(label)) {
        const sample = g.items.find((item) => String(item.label || '').includes(' · '));
        if (sample) label = sample.label.split(' · ')[0].trim();
      }
      return {
        ...g,
        label,
        items: [...g.items].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, 'he')
        ),
      };
    });
}

/** Corner IDs in RTL display order. */
export const CORNER_GRID_ORDER = VERSE_CORNER_ORDER;

/** True when all four corner groups are present. */
export function hasCornerGridLayout(groups) {
  if (!groups?.length) return false;
  const ids = new Set(groups.map((g) => g.id));
  return CORNER_GRID_ORDER.every((id) => ids.has(id));
}

/** Sort groups for the 2×2 corner grid (RTL: right column first). */
export function orderGroupsForCornerGrid(groups) {
  const map = Object.fromEntries(groups.map((g) => [g.id, g]));
  return CORNER_GRID_ORDER.filter((id) => map[id]).map((id) => map[id]);
}
