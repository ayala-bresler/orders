'use strict';

const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const Drawing = require('dxf-writer');
const templateResolver = require('../services/templateResolver');
const svgService = require('../services/svgService');
const { mapPolyline } = require('./svgExtract');
const { pathToPolylines } = require('./pathUtils');
const { readRootSvgMetrics } = require('./svgRootMetrics');
const { splitSvgIntoQuarters, QUARTER_DEFS } = require('./svgQuarterSplit');
const { buildZipStore } = require('./zipStore');
const { STORAGE_DIR } = require('../services/orderService');

/** Quarter id → numbered DXF filename (1 = top-right … 4 = bottom-left). */
const QUARTER_DXF_NUMBER = {
  topRight: 1,
  topLeft: 2,
  bottomRight: 3,
  bottomLeft: 4,
};

/** Attachment / zip order: 1, 2, 3, 4. */
const QUARTER_EXPORT_ORDER = ['topRight', 'topLeft', 'bottomRight', 'bottomLeft'];

function quarterDxfNumber(quarterId) {
  return QUARTER_DXF_NUMBER[quarterId] ?? null;
}

function sortQuartersForExport(quarters) {
  return [...quarters].sort(
    (a, b) => QUARTER_EXPORT_ORDER.indexOf(a.id) - QUARTER_EXPORT_ORDER.indexOf(b.id)
  );
}

/** DXF uses SVG coordinates 1:1 (Y flipped only for CAD axis). No mm scaling. */
const EXPORT_SCALE = 1;

function quarterDxfPath(orderId, orderItemId, quarterId) {
  const n = quarterDxfNumber(quarterId);
  const suffix = n != null ? String(n) : quarterId;
  return path.join(STORAGE_DIR, String(orderId), `item-${orderItemId}-${suffix}.dxf`);
}

function quarterSvgPath(orderId, orderItemId, quarterId) {
  return path.join(STORAGE_DIR, String(orderId), `item-${orderItemId}-${quarterId}.svg`);
}

function quarterDxfFilename(_orderId, _itemId, quarterId) {
  const n = quarterDxfNumber(quarterId);
  if (n == null) {
    return `${quarterId}.dxf`;
  }
  return `${n}.dxf`;
}

function parseSvgHeight(svgString) {
  return Number(readRootSvgMetrics(svgString).viewBox.split(/[\s,]+/)[3]) || 841.89;
}

/** Read baked path geometry from a prepared paths-only SVG. */
function extractBakedPathPolylines(doc) {
  const polylines = [];

  function walk(node) {
    if (!node || node.nodeType !== 1) return;
    const tag = node.tagName && node.tagName.toLowerCase();
    if (tag === 'path') {
      const d = node.getAttribute('d');
      if (d) polylines.push(...pathToPolylines(d));
    }
    for (let i = 0; i < node.childNodes.length; i += 1) {
      walk(node.childNodes.item(i));
    }
  }

  walk(doc.documentElement);
  return polylines;
}

/**
 * Convert one quarter SVG (paths-only, origin at 0,0) → DXF string.
 */
function svgToDxf(preparedSvgString) {
  const warnings = [];
  const doc = new DOMParser().parseFromString(preparedSvgString, 'image/svg+xml');
  const svgHeight = parseSvgHeight(preparedSvgString);
  const all = extractBakedPathPolylines(doc);

  const draw = new Drawing();
  draw.setUnits('Unitless');
  draw.addLayer('geometry', Drawing.ACI.WHITE, 'CONTINUOUS');
  draw.setActiveLayer('geometry');

  for (const line of all) {
    if (!line || line.length < 2) continue;
    const mapped = mapPolyline(line, EXPORT_SCALE, svgHeight);
    draw.drawPolyline(mapped, false);
  }

  return { dxf: draw.toDxfString(), warnings };
}

/**
 * Split raw SVG into 4 quarters and convert each to DXF (in memory only).
 */
function exportQuartersFromRawSvg(rawSvgString, saveOptions = null) {
  const scaleFactor = saveOptions?.scaleFactor;
  const split = splitSvgIntoQuarters(
    rawSvgString,
    scaleFactor != null ? { scaleFactor } : {}
  );
  const warnings = [...split.warnings];
  const quarters = [];

  for (const def of QUARTER_DEFS) {
    const q = split.quarters[def.id];
    const { dxf, warnings: dxfWarnings } = svgToDxf(q.svg);
    warnings.push(...dxfWarnings);
    quarters.push({
      id: def.id,
      label: def.label,
      svg: q.svg,
      dxf,
      viewBox: q.viewBox,
      bounds: q.bounds,
    });
  }

  return {
    quarters,
    intersection: split.intersection,
    analysis: split.analysis,
    scaleFactor: split.scaleFactor,
    warnings,
    filePaths: null,
  };
}

function buildQuartersZip(orderId, itemId, quarters) {
  return buildZipStore(
    sortQuartersForExport(quarters).map((q) => ({
      name: quarterDxfFilename(orderId, itemId, q.id),
      data: q.dxf,
    }))
  );
}

async function renderAndExport(orderId, orderItemId, values, fontScales = {}) {
  const templateContext = await templateResolver.resolveTemplate({ orderId, orderItemId });
  const rawSvg = svgService.renderCustomizedSvg(values, fontScales, templateContext);
  return exportQuartersFromRawSvg(rawSvg, {
    orderId,
    orderItemId,
    scaleFactor: templateContext.exportScaleFactor,
  });
}

async function exportOrderItemDxf(orderId, orderItemId, getVerses) {
  const found = await getVerses(orderId, orderItemId);
  if (!found) {
    const err = new Error('Order item not found.');
    err.status = 404;
    throw err;
  }
  return renderAndExport(orderId, orderItemId, found.values, found.fontScales || {});
}

async function exportCustomDxf(orderId, orderItemId, values, fontScales) {
  return renderAndExport(orderId, orderItemId, values, fontScales || {});
}

/**
 * Client-prepared SVG (already path-baked) → 4 quarter DXFs.
 * Prefer exportCustomDxf(values) when labels must still be stripped as live <text>.
 */
async function exportFromPreparedSvg(orderId, orderItemId, preparedSvgString) {
  let scaleFactor;
  try {
    const templateContext = await templateResolver.resolveTemplate({
      orderId,
      orderItemId,
    });
    scaleFactor = templateContext.exportScaleFactor;
  } catch {
    /* fall back to default SCALE_FACTOR inside split */
  }
  return exportQuartersFromRawSvg(preparedSvgString, {
    orderId,
    orderItemId,
    scaleFactor,
  });
}

module.exports = {
  svgToDxf,
  exportQuartersFromRawSvg,
  exportOrderItemDxf,
  exportCustomDxf,
  exportFromPreparedSvg,
  buildQuartersZip,
  quarterDxfPath,
  quarterSvgPath,
  quarterDxfFilename,
  quarterDxfNumber,
  sortQuartersForExport,
  QUARTER_DXF_NUMBER,
  QUARTER_EXPORT_ORDER,
  QUARTER_DEFS,
};
