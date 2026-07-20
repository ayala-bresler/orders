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

/** All selectable models (דגם) for order details dropdowns. */
async function listModels() {
  const { rows } = await query(
    `SELECT model_code, model_name
       FROM models
      ORDER BY model_name`
  );
  return rows;
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

  return rows.map((row) => {
    const short_sku = modelSkuPrefix(row.model_code);
    return {
      model_code: row.model_code,
      model_name: row.model_name,
      short_sku,
      product_code: row.product_code || null,
      sku: row.sku || null,
      size_code: row.size_code || null,
      supports_verses: Boolean(row.supports_verses),
      has_image: modelImageExists(short_sku),
    };
  });
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
  return rows[0] || null;
}

/** Selectable parchment diameters for laser templates (product_sizes). */
async function listProductSizes(productTypeCode = '01') {
  const { rows } = await query(
    `SELECT size_code, product_type_code, size_name, svg_template_file,
            diameter_mm, export_scale_factor, sort_order, supports_verses
       FROM product_sizes
      WHERE product_type_code = $1
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
  productSupportsVerses,
};
