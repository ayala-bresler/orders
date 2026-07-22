'use strict';

const fs = require('fs');
const path = require('path');
const { query } = require('../db');
const { MASTER_SVG_PATH, BUNDLED_MASTER, FIELDS: LEGACY_FIELDS } = require('../config/template');
const {
  discoverSvgTextFields,
  enrichDiscoveredFields,
  buildFieldMaps,
} = require('../utils/svgFieldDiscovery');
const { analyzeSvgTemplate } = require('../utils/svgTemplateMeta');
const { resolveProductSizeRow } = require('../utils/productSizeDisplay');
const { SCALE_FACTOR: DEFAULT_SCALE_FACTOR } = require('../export/svgQuarterSplit/scalePaths');

const TEMPLATES_ROOT = path.resolve(__dirname, '..', '..', 'templates');
const DEFAULT_PRODUCT_TYPE_CODE = process.env.VERSE_PRODUCT_TYPE_CODE || '01';

function resolveSvgPath(relativeFile) {
  const rel = String(relativeFile || '').replace(/^[/\\]+/, '');
  if (!rel) {
    throw new Error('SVG template path is empty.');
  }
  const resolved = path.resolve(TEMPLATES_ROOT, rel);
  if (!resolved.startsWith(TEMPLATES_ROOT)) {
    throw new Error('Invalid SVG template path.');
  }
  return resolved;
}

function isReadableSvgFile(svgPath) {
  try {
    return fs.existsSync(svgPath) && fs.statSync(svgPath).isFile();
  } catch {
    return false;
  }
}

/** Prefer DB path; fall back to sizes/order-{code}.svg then bundled master. */
function resolveSizeSvgPath(sizeRow) {
  const candidates = [];
  const dbRel = String(sizeRow?.svg_template_file || '').trim();
  if (dbRel) candidates.push(dbRel);
  if (sizeRow?.size_code) {
    candidates.push(`sizes/${sizeRow.size_code}.svg`);
  }
  candidates.push(path.relative(TEMPLATES_ROOT, BUNDLED_MASTER));

  for (const rel of candidates) {
    const abs = resolveSvgPath(rel);
    if (isReadableSvgFile(abs)) return abs;
  }

  if (isReadableSvgFile(MASTER_SVG_PATH)) return MASTER_SVG_PATH;

  throw new Error(
    `SVG template not found for size "${sizeRow?.size_code || '?'}".`
  );
}

function readSvgFile(svgPath) {
  if (!fs.existsSync(svgPath)) {
    throw new Error(`SVG template not found: ${svgPath}`);
  }
  if (!fs.statSync(svgPath).isFile()) {
    throw new Error(`SVG template path is not a file: ${svgPath}`);
  }
  return fs.readFileSync(svgPath, 'utf8');
}

function buildTemplateContext({
  svgPath,
  svgRaw,
  sizeCode = null,
  productTypeCode = DEFAULT_PRODUCT_TYPE_CODE,
  exportScaleFactor = null,
  sizeName = null,
}) {
  const {
    applyCanonicalDefaultsToFields,
    prepareTemplateSvgString,
  } = require('../utils/canonicalVerses');

  const discovered = discoverSvgTextFields(svgRaw, LEGACY_FIELDS);
  let fields = enrichDiscoveredFields(discovered, svgRaw);
  fields = applyCanonicalDefaultsToFields(fields);
  // Runtime only: canonical 11–15 verses (size SVG files / rotates unchanged on disk).
  const preparedSvg = prepareTemplateSvgString(svgRaw, fields);
  const maps = buildFieldMaps(fields);
  const meta = analyzeSvgTemplate(preparedSvg, fields);

  return {
    id: sizeCode ? `${productTypeCode}-${sizeCode}` : 'default',
    svgPath,
    svgRaw: preparedSvg,
    sizeCode,
    productTypeCode,
    sizeName,
    exportScaleFactor: exportScaleFactor ?? DEFAULT_SCALE_FACTOR,
    fields,
    ...maps,
    meta,
  };
}

function buildDefaultContext() {
  const svgPath = MASTER_SVG_PATH;
  const svgRaw = readSvgFile(svgPath);
  return buildTemplateContext({
    svgPath,
    svgRaw,
    productTypeCode: DEFAULT_PRODUCT_TYPE_CODE,
    exportScaleFactor: DEFAULT_SCALE_FACTOR,
    sizeName: 'ברירת מחדל',
  });
}

async function listProductSizes(productTypeCode = DEFAULT_PRODUCT_TYPE_CODE) {
  const { rows } = await query(
    `SELECT size_code, product_type_code, size_name, svg_template_file,
            diameter_mm, export_scale_factor, sort_order, supports_verses
       FROM product_sizes
      WHERE product_type_code = $1
        AND size_code IS DISTINCT FROM '16'
        AND (diameter_mm IS NULL OR diameter_mm <= 15)
      ORDER BY sort_order, size_name`,
    [productTypeCode]
  );
  return rows;
}

async function getProductSize(sizeCode, productTypeCode = DEFAULT_PRODUCT_TYPE_CODE) {
  if (!sizeCode) return null;
  const { rows } = await query(
    `SELECT size_code, product_type_code, size_name, svg_template_file,
            diameter_mm, export_scale_factor, sort_order, supports_verses
       FROM product_sizes
      WHERE product_type_code = $1 AND size_code = $2
      LIMIT 1`,
    [productTypeCode, sizeCode]
  );
  return rows[0] || null;
}

async function resolveTemplate(options = {}) {
  const productTypeCode = options.productTypeCode || DEFAULT_PRODUCT_TYPE_CODE;
  let dbSizeCode = null;
  let plateDiameter = null;

  if (options.orderId && options.orderItemId) {
    const { rows } = await query(
      `SELECT size_code, product_type_code, plate_diameter
         FROM order_items
        WHERE order_id = $1 AND item_id = $2
        LIMIT 1`,
      [options.orderId, options.orderItemId]
    );
    if (rows[0]) {
      dbSizeCode = rows[0].size_code;
      plateDiameter = rows[0].plate_diameter;
      if (rows[0].product_type_code) {
        options.productTypeCode = rows[0].product_type_code;
      }
    }
  }

  const ptc = options.productTypeCode || productTypeCode;
  const sizes = await listProductSizes(ptc);
  const sizeRow = resolveProductSizeRow(sizes, {
    plate_diameter: plateDiameter,
    size_code: options.sizeCode || dbSizeCode,
  });

  if (!sizeRow) {
    if (dbSizeCode || options.sizeCode) {
      const err = new Error(
        `מידת קלף "${options.sizeCode || dbSizeCode}" אינה תקפה. בחר קוטר צלחת מחדש במסך פרטי ההזמנה.`
      );
      err.status = 404;
      throw err;
    }
    return buildDefaultContext();
  }

  const svgPath = resolveSizeSvgPath(sizeRow);
  const svgRaw = readSvgFile(svgPath);

  return buildTemplateContext({
    svgPath,
    svgRaw,
    sizeCode: sizeRow.size_code,
    productTypeCode: sizeRow.product_type_code,
    exportScaleFactor: sizeRow.export_scale_factor,
    sizeName: sizeRow.size_name,
  });
}

module.exports = {
  DEFAULT_PRODUCT_TYPE_CODE,
  TEMPLATES_ROOT,
  BUNDLED_MASTER,
  resolveSvgPath,
  buildTemplateContext,
  buildDefaultContext,
  listProductSizes,
  getProductSize,
  resolveTemplate,
};
