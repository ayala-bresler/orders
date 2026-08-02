'use strict';

/**
 * catalogService
 * --------------
 * Read-only product catalog for the client-facing selection step.
 * Clients may only pick from category 4 (סת"ם); a product is verse-
 * personalizable only when it has an 'עץ חיים' variant.
 */

const { query } = require('../db');
const { modelSkuPrefix } = require('../utils/modelSku');
const { modelImageExists } = require('./modelImageService');
const {
  isCrownOnlyModel,
  isSpecialTextModel,
} = require('../config/modelScopes');

// The only category a client may order from.
const CLIENT_CATEGORY_ID = Number(process.env.CLIENT_CATEGORY_ID || 4);

// The product type that unlocks the verse editor.
const VERSE_TYPE_NAME = process.env.VERSE_TYPE_NAME || 'עץ חיים';

/**
 * List selectable products for a category, each flagged with supports_verses
 * and its available variants.
 */
async function listProducts(categoryId = CLIENT_CATEGORY_ID) {
  const { rows } = await query(
    `SELECT
        p.product_code,
        p.product_name,
        p.base_price,
        EXISTS (
          SELECT 1
            FROM product_variants v
            JOIN product_types t ON t.product_type_code = v.product_type_code
           WHERE v.product_code = p.product_code
             AND t.type_name = $2
        ) AS supports_verses,
        COALESCE(
          (SELECT json_agg(json_build_object(
                     'sku', v.sku,
                     'product_type_code', v.product_type_code,
                     'type_name', t.type_name,
                     'model_code', v.model_code,
                     'model_name', m.model_name,
                     'size_code', v.size_code) ORDER BY v.sku)
             FROM product_variants v
             LEFT JOIN product_types t ON t.product_type_code = v.product_type_code
             LEFT JOIN models m ON m.model_code = v.model_code
            WHERE v.product_code = p.product_code),
          '[]'::json
        ) AS variants
       FROM products p
      WHERE p.category_id = $1
      ORDER BY p.product_name`,
    [categoryId, VERSE_TYPE_NAME]
  );
  return rows;
}

/**
 * The primary variant to record for a product: prefers the 'עץ חיים' variant,
 * otherwise the first variant. Used to capture model/size on an order line.
 */
async function getPrimaryVariant(productCode) {
  const { rows } = await query(
    `SELECT v.sku, v.product_type_code, t.type_name,
            v.model_code, m.model_name, v.size_code
       FROM product_variants v
       LEFT JOIN product_types t ON t.product_type_code = v.product_type_code
       LEFT JOIN models m ON m.model_code = v.model_code
      WHERE v.product_code = $1
      ORDER BY (t.type_name = $2) DESC, v.sku
      LIMIT 1`,
    [productCode, VERSE_TYPE_NAME]
  );
  return rows[0] || null;
}

/** Whether a specific product supports verse personalization. */
async function productSupportsVerses(productCode) {
  const { rows } = await query(
    `SELECT EXISTS (
        SELECT 1
          FROM product_variants v
          JOIN product_types t ON t.product_type_code = v.product_type_code
         WHERE v.product_code = $1 AND t.type_name = $2
     ) AS supports_verses,
     EXISTS (SELECT 1 FROM products WHERE product_code = $1) AS exists`,
    [productCode, VERSE_TYPE_NAME]
  );
  return rows[0];
}

/** All models for order-details dropdowns (includes scope flags). */
async function listModels() {
  const { rows } = await query(
    `SELECT model_code, model_name
       FROM models
      ORDER BY model_name`
  );
  return rows.map((row) => ({
    model_code: row.model_code,
    model_name: row.model_name,
    crown_only: isCrownOnlyModel(row.model_code),
    special_text: isSpecialTextModel(row.model_code),
  }));
}

/**
 * Fallback variant for special models (e.g. 10) that may lack a dedicated
 * product_variants row — borrow any עץ חיים / category product so the line
 * can still be created with model_code overridden.
 */
async function getFallbackVerseVariant(categoryId = CLIENT_CATEGORY_ID) {
  const { rows } = await query(
    `SELECT v.sku, v.product_code, v.product_type_code, t.type_name,
            v.model_code, m.model_name, v.size_code
       FROM product_variants v
       JOIN products p ON p.product_code = v.product_code
       LEFT JOIN product_types t ON t.product_type_code = v.product_type_code
       LEFT JOIN models m ON m.model_code = v.model_code
      WHERE p.category_id = $1
      ORDER BY (t.type_name = $2) DESC, v.sku
      LIMIT 1`,
    [categoryId, VERSE_TYPE_NAME]
  );
  return rows[0] || null;
}

/**
 * Models for the client picker: each card = one דגם with short SKU (4-03) and image.
 * Includes variant/product linkage when available in category 4.
 */
async function listSelectableModels(categoryId = CLIENT_CATEGORY_ID) {
  const { rows } = await query(
    `SELECT
        m.model_code,
        m.model_name,
        pv.product_code,
        pv.sku,
        pv.size_code,
        COALESCE(pt.type_name = $2, FALSE) AS supports_verses
       FROM models m
       LEFT JOIN LATERAL (
         SELECT v.sku, v.product_code, v.size_code, v.product_type_code
           FROM product_variants v
           JOIN products p ON p.product_code = v.product_code
          WHERE v.model_code = m.model_code
            AND p.category_id = $1
          ORDER BY v.sku
          LIMIT 1
       ) pv ON TRUE
       LEFT JOIN product_types pt ON pt.product_type_code = pv.product_type_code
      ORDER BY m.model_name`,
    [categoryId, VERSE_TYPE_NAME]
  );

  const mapped = [];
  for (const row of rows) {
    if (isCrownOnlyModel(row.model_code)) continue;

    const special = isSpecialTextModel(row.model_code);
    const short_sku = modelSkuPrefix(row.model_code);
    let product_code = row.product_code || null;
    let sku = row.sku || null;
    let size_code = row.size_code || null;
    let supports_verses = Boolean(row.supports_verses);

    // Special (מיוחד) may have no variant — still show in picker and stay orderable.
    if (special && !product_code) {
      const fallback = await getFallbackVerseVariant(categoryId);
      if (fallback) {
        product_code = fallback.product_code;
        sku = fallback.sku;
        size_code = fallback.size_code;
        supports_verses = true;
      }
    }

    mapped.push({
      model_code: row.model_code,
      model_name: row.model_name,
      short_sku,
      product_code,
      sku,
      size_code,
      supports_verses,
      has_image: special ? false : modelImageExists(short_sku),
      crown_only: false,
      special_text: special,
    });
  }
  return mapped;
}

/**
 * Best variant for a model in the client category (prefers עץ חיים).
 */
async function getVariantByModel(modelCode, categoryId = CLIENT_CATEGORY_ID) {
  const { rows } = await query(
    `SELECT v.sku, v.product_code, v.product_type_code, t.type_name,
            v.model_code, m.model_name, v.size_code
       FROM product_variants v
       JOIN products p ON p.product_code = v.product_code
       LEFT JOIN product_types t ON t.product_type_code = v.product_type_code
       LEFT JOIN models m ON m.model_code = v.model_code
      WHERE v.model_code = $1
        AND p.category_id = $2
      ORDER BY (t.type_name = $3) DESC, v.sku
      LIMIT 1`,
    [modelCode, categoryId, VERSE_TYPE_NAME]
  );
  if (rows[0]) return rows[0];

  // Special text model (10): allow ordering even without a dedicated variant row.
  if (isSpecialTextModel(modelCode)) {
    const fallback = await getFallbackVerseVariant(categoryId);
    if (!fallback) return null;
    const { rows: nameRows } = await query(
      `SELECT model_code, model_name FROM models WHERE model_code = $1 LIMIT 1`,
      [modelCode]
    );
    return {
      ...fallback,
      model_code: nameRows[0]?.model_code || modelCode,
      model_name: nameRows[0]?.model_name || 'מיוחד',
    };
  }

  return null;
}

/** Selectable plate diameters for laser templates (product_sizes). Max size: 15. */
async function listProductSizes(productTypeCode = '01') {
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

module.exports = {
  CLIENT_CATEGORY_ID,
  VERSE_TYPE_NAME,
  listProducts,
  listModels,
  listSelectableModels,
  listProductSizes,
  getPrimaryVariant,
  getVariantByModel,
  getFallbackVerseVariant,
  productSupportsVerses,
};
