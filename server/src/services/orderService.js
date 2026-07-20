'use strict';

/**
 * orderService
 * ------------
 * Persists a personalized order item's verses in two places (per requirement):
 *   1. The 8 structured verse_* columns on order_items.
 *   2. A serialized customized SVG snapshot: stored in the order_items
 *      `customized_svg` column AND written to disk under STORAGE_DIR, linked to
 *      the order/item. The master template is never modified.
 */

const fs = require('fs');
const path = require('path');
const { query, pool } = require('../db');
const { EDITABLE_COLUMNS, FIELD_BY_KEY } = require('../config/template');
const { itemSupportsVerses, syncItemSizeFields } = require('./productSizeService');
const { compactStylesMap, normalizeStyleEntry, BASE_FONT_SIZE_PX } = require('../config/verseStyles');

async function assertItemSupportsVerses(orderId, orderItemId) {
  const details = await getOrderItemDetails(orderId, orderItemId);
  if (!details) {
    const err = new Error(`order_item ${orderItemId} not found for order ${orderId}.`);
    err.status = 404;
    throw err;
  }
  if (details.supportsVerses === false) {
    const err = new Error('מידה זו אינה תומכת בעריכת פסוקים.');
    err.status = 403;
    throw err;
  }
  return details;
}
const { ORDER_DETAIL_FIELDS, ITEM_DETAIL_FIELDS, ORDER_KEYS, ITEM_KEYS, isDetailsComplete, clampOrderNotes } = require('../config/orderFields');
const svgService = require('./svgService');
const templateResolver = require('./templateResolver');
const { formatModelLabel } = require('../utils/modelSku');
const { toDateOnlyString, formatHebrewDate } = require('../utils/dates');

const STORAGE_DIR =
  process.env.STORAGE_DIR ||
  path.resolve(__dirname, '..', '..', '..', 'saved', 'orders');

// The real order_items table uses `item_id` as its primary key. It is exposed
// to the API as `order_item_id` for a stable public contract.
const PK = 'item_id';

function itemSelectColumns() {
  return ITEM_KEYS.map((key) => `oi.${key}`).join(', ');
}

function snapshotPath(orderId, orderItemId) {
  return path.join(STORAGE_DIR, String(orderId), `item-${orderItemId}.svg`);
}

/**
 * Add a product line to an order and return the created row.
 * @param {number} orderId
 * @param {{product_code:string, quantity?:number, price?:number,
 *          model?:string, size?:string}} input
 */
async function createOrderItem(orderId, input) {
  const productCode = String(input && input.product_code || '').trim();
  if (!productCode) {
    const e = new Error('חסר קוד מוצר.');
    e.status = 400;
    throw e;
  }
  const sizeCode = input.size_code || input.size || '12';
  const plateDiameter = input.plate_diameter != null ? Number(input.plate_diameter) : 12;
  const productTypeCode = input.product_type_code || templateResolver.DEFAULT_PRODUCT_TYPE_CODE;
  const { rows } = await query(
    `INSERT INTO order_items
       (order_id, product_code, quantity, price_at_purchase, model, size_code, product_type_code, plate_diameter)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING ${PK} AS order_item_id, order_id, product_code, quantity, model, size_code, product_type_code, plate_diameter`,
    [
      orderId,
      productCode,
      Number(input.quantity) || 1,
      Number(input.price) || 0,
      input.model || null,
      sizeCode,
      productTypeCode,
      Number.isFinite(plateDiameter) ? plateDiameter : 12,
    ]
  );
  return rows[0];
}

/** Product/variant metadata for an order item (read-only display).
 *  Per the catalog model:
 *    - מק"ט  = product_variants.sku (NOT products.product_code)
 *    - דגם   = models.model_name (via product_variants.model_code)
 *    - גודל  = sizes.size_name (via product_variants.size_code)
 */
async function getOrderItemMeta(orderId, orderItemId) {
  const { rows } = await query(
    `SELECT oi.${PK} AS order_item_id, oi.product_code, oi.quantity, oi.model AS model_code,
            oi.plate_diameter, oi.size_code,
            p.product_name,
            om.model_name AS model_name,
            pv.sku       AS sku,
            pv.type_name AS type_name,
            pv.model     AS variant_model,
            pv.size      AS size
       FROM order_items oi
       LEFT JOIN products p ON p.product_code = oi.product_code
       LEFT JOIN models om ON om.model_code = oi.model
       LEFT JOIN LATERAL (
         SELECT v.sku,
                t.type_name AS type_name,
                m.model_name AS model,
                s.size_name AS size
           FROM product_variants v
           LEFT JOIN product_types t ON t.product_type_code = v.product_type_code
           LEFT JOIN models m ON m.model_code = v.model_code
           LEFT JOIN sizes s ON s.size_code = v.size_code
          WHERE v.product_code = oi.product_code
          ORDER BY (t.type_name = 'עץ חיים') DESC, v.sku
          LIMIT 1
       ) pv ON TRUE
      WHERE oi.order_id = $1 AND oi.${PK} = $2`,
    [orderId, orderItemId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    ...row,
    model_label: formatModelLabel(row.model_code, row.model_name),
  };
}

/** Normalize verse_font_scales JSON from a DB row (legacy scale or fontSizePx object). */
function fontScalesFromRow(row) {
  const raw = row && row.verse_font_scales;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out = {};
  for (const [key, val] of Object.entries(raw)) {
    if (!FIELD_BY_KEY[key]) continue;
    const style = normalizeStyleEntry(val);
    const entry = {};
    const hadSize =
      typeof val === 'number' ||
      (val && typeof val === 'object' && (val.fontSizePx != null || val.fontSizePt != null || val.fontScale != null));
    if (hadSize) entry.fontSizePx = style.fontSizePx;
    if (Math.abs(style.letterSpacingEm) > 0.0001) entry.letterSpacingEm = style.letterSpacingEm;
    if (Object.keys(entry).length) out[key] = entry;
  }
  return out;
}

/** Read the persisted verses for an order item as a { fieldKey: text } map. */
async function getOrderItemVerses(orderId, orderItemId) {
  await assertItemSupportsVerses(orderId, orderItemId);
  const templateContext = await templateResolver.resolveTemplate({ orderId, orderItemId });
  const cols = (
    templateContext.editableColumns.length
      ? templateContext.editableColumns
      : EDITABLE_COLUMNS
  ).join(', ');
  const { rows } = await query(
    `SELECT ${PK} AS order_item_id, ${cols}, customized_svg_path, verse_font_scales,
            size_code, product_type_code
       FROM order_items
      WHERE order_id = $1 AND ${PK} = $2`,
    [orderId, orderItemId]
  );
  if (!rows.length) return null;
  const row = rows[0];
  const meta = await getOrderItemMeta(orderId, orderItemId);
  return {
    orderItemId: row.order_item_id,
    values: svgService.valuesFromColumns(row, templateContext),
    fontScales: fontScalesFromRow(row),
    customizedSvgPath: row.customized_svg_path,
    sizeCode: row.size_code,
    productTypeCode: row.product_type_code,
    meta,
    templateMeta: {
      viewBox: templateContext.meta.viewBox,
      width: templateContext.meta.width,
      height: templateContext.meta.height,
      sizeCode: templateContext.sizeCode,
      sizeName: templateContext.sizeName,
    },
  };
}

/**
 * Save personalized verses for an order item.
 * @param {number} orderId
 * @param {number} orderItemId
 * @param {Object<string,string>} values  { fieldKey: text }
 * @param {Object<string,number>} [fontScales]  { fieldKey: 0.4..1.0 }
 * @returns {Promise<{orderItemId:number, values:Object, fontScales:Object, customizedSvgPath:string}>}
 */
async function saveOrderItemVerses(orderId, orderItemId, values, fontScales = {}) {
  await assertItemSupportsVerses(orderId, orderItemId);
  const templateContext = await templateResolver.resolveTemplate({ orderId, orderItemId });
  const { values: clean, errors } = svgService.validateValues(values, templateContext);
  if (errors.length) {
    const err = new Error(errors.join(' '));
    err.status = 400;
    throw err;
  }
  const { scales: cleanScales, errors: scaleErrors } = svgService.validateFontScales(fontScales, templateContext);
  if (scaleErrors.length) {
    const err = new Error(scaleErrors.join(' '));
    err.status = 400;
    throw err;
  }
  const customizedSvg = svgService.renderCustomizedSvg(clean, cleanScales, templateContext);

  const filePath = snapshotPath(orderId, orderItemId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, customizedSvg, 'utf8');

  const columnValues = svgService.columnsFromValues(clean, templateContext);
  const setClauses = [];
  const params = [];
  let i = 1;
  for (const [col, val] of Object.entries(columnValues)) {
    if (!templateContext.fieldByColumn[col]) continue;
    setClauses.push(`${col} = $${i}`);
    params.push(val);
    i += 1;
  }
  setClauses.push(`customized_svg = $${i}`);
  params.push(customizedSvg);
  i += 1;
  setClauses.push(`customized_svg_path = $${i}`);
  params.push(filePath);
  i += 1;
  setClauses.push(`verse_font_scales = $${i}`);
  const baseByKey = Object.fromEntries(
    (templateContext.fields || []).map((f) => [f.key, f.fontSizePx ?? BASE_FONT_SIZE_PX])
  );
  params.push(Object.keys(cleanScales).length ? compactStylesMap(cleanScales, baseByKey) : null);
  i += 1;

  params.push(orderId, orderItemId);
  const returningCols = (
    templateContext.editableColumns.length
      ? templateContext.editableColumns
      : EDITABLE_COLUMNS
  ).join(', ');
  const { rows } = await query(
    `UPDATE order_items
        SET ${setClauses.join(', ')}
      WHERE order_id = $${i} AND ${PK} = $${i + 1}
      RETURNING ${PK} AS order_item_id, ${returningCols},
                customized_svg_path, verse_font_scales`,
    params
  );

  if (!rows.length) {
    const err = new Error(
      `order_item ${orderItemId} not found for order ${orderId}.`
    );
    err.status = 404;
    throw err;
  }

  const row = rows[0];
  return {
    orderItemId: row.order_item_id,
    values: svgService.valuesFromColumns(row, templateContext),
    fontScales: fontScalesFromRow(row),
    customizedSvg,
    customizedSvgPath: row.customized_svg_path,
    templateMeta: templateContext.meta,
  };
}

function orderSelectFragment() {
  return ORDER_KEYS.length ? `, ${ORDER_KEYS.map((k) => `o.${k}`).join(', ')}` : '';
}

function rowToOrderDetails(row) {
  if (!row) return null;
  const out = {
    order_id: row.order_id,
    total_amount: row.total_amount,
    status: row.status,
    customer_address: row.customer_address ?? null,
    order_date: toDateOnlyString(row.order_date),
  };
  for (const key of ORDER_KEYS) {
    if (key === 'estimated_delivery_date') {
      out[key] = toDateOnlyString(row[key]);
    } else {
      out[key] = row[key] ?? null;
    }
  }
  return out;
}

function rowToItemDetails(row) {
  if (!row) return null;
  const out = { order_item_id: row.order_item_id, product_code: row.product_code };
  for (const key of ITEM_KEYS) {
    out[key] = row[key] ?? null;
  }
  if (out.quantity == null || !Number.isFinite(Number(out.quantity))) {
    out.quantity = 1;
  }
  if (out.price_at_purchase == null || !Number.isFinite(Number(out.price_at_purchase))) {
    out.price_at_purchase = 0;
  }
  return out;
}

function parseIncomingValue(key, raw) {
  if (raw === undefined) return undefined;
  if (raw === null || raw === '') return null;
  if (key === 'quantity') {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 1 ? Math.round(n) : null;
  }
  if (key === 'price_at_purchase') {
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  if ([
    'parchment_diameter', 'plate_diameter', 'parchment_height',
    'parochet_height',
  ].includes(key)) {
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }
  if (['has_stones', 'has_crown', 'has_breastplate', 'has_pointer'].includes(key)) {
    if (raw === true || raw === 'true' || raw === 1 || raw === '1') return true;
    if (raw === false || raw === 'false' || raw === 0 || raw === '0') return false;
    return null;
  }
  if (key === 'order_notes') {
    const text = raw == null ? '' : String(raw);
    return clampOrderNotes(text) || null;
  }
  return String(raw).trim() || null;
}

function normalizeItemForSave(item) {
  const out = { ...item };
  if (out.quantity == null || !Number.isFinite(Number(out.quantity)) || Number(out.quantity) < 1) {
    out.quantity = 1;
  } else {
    out.quantity = Math.round(Number(out.quantity));
  }
  if (out.price_at_purchase == null || !Number.isFinite(Number(out.price_at_purchase))) {
    out.price_at_purchase = 0;
  } else {
    out.price_at_purchase = Number(out.price_at_purchase);
  }
  return out;
}

/** Load order header + one item's manufacturing fields. */
async function getOrderItemDetails(orderId, orderItemId) {
  const itemCols = itemSelectColumns();
  const { rows } = await query(
    `SELECT o.order_id, o.customer_id, o.total_amount, o.status, o.order_date${orderSelectFragment()},
            c.address AS customer_address, c.full_name AS customer_name,
            oi.${PK} AS order_item_id, oi.product_code, ${itemCols}
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.order_id
       LEFT JOIN customers c ON c.customer_id = o.customer_id
      WHERE o.order_id = $1 AND oi.${PK} = $2`,
    [orderId, orderItemId]
  );
  if (!rows.length) return null;

  const row = rows[0];
  const order = rowToOrderDetails(row);
  let item = rowToItemDetails(row);
  item = await syncItemSizeFields(item, item.product_type_code || '01');
  const meta = await getOrderItemMeta(orderId, orderItemId);
  const supportsVerses = await itemSupportsVerses(item);

  return {
    order,
    item,
    meta,
    customerName: row.customer_name || null,
    detailsComplete: isDetailsComplete(order, item),
    supportsVerses,
    fieldDefs: {
      order: ORDER_DETAIL_FIELDS,
      item: ITEM_DETAIL_FIELDS,
    },
  };
}

/** Save order header + item manufacturing fields atomically. */
async function saveOrderItemDetails(orderId, orderItemId, { order: orderInput = {}, item: itemInput = {} } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const itemCols = itemSelectColumns();
    const existing = await client.query(
      `SELECT o.order_id, o.customer_id, o.total_amount, o.status, o.order_date${orderSelectFragment()},
              oi.${PK} AS order_item_id, oi.product_code, ${itemCols}
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.order_id
        WHERE o.order_id = $1 AND oi.${PK} = $2
        FOR UPDATE`,
      [orderId, orderItemId]
    );
    if (!existing.rows.length) {
      const err = new Error(`order_item ${orderItemId} not found for order ${orderId}.`);
      err.status = 404;
      throw err;
    }

    const base = existing.rows[0];
    const nextOrder = { ...rowToOrderDetails(base) };
    const nextItem = { ...rowToItemDetails(base) };

    for (const key of ORDER_KEYS) {
      if (Object.prototype.hasOwnProperty.call(orderInput, key)) {
        nextOrder[key] = parseIncomingValue(key, orderInput[key]);
      }
    }
    for (const key of ITEM_KEYS) {
      if (Object.prototype.hasOwnProperty.call(itemInput, key)) {
        nextItem[key] = parseIncomingValue(key, itemInput[key]);
      }
    }

    const syncedItem = await syncItemSizeFields(nextItem, nextItem.product_type_code);
    const safeItem = normalizeItemForSave(syncedItem);
    if (safeItem.quantity < 1 || safeItem.quantity > 99) {
      const err = new Error('כמות חייבת להיות בין 1 ל-99.');
      err.status = 400;
      throw err;
    }

    if (ORDER_KEYS.length) {
      const orderSets = [];
      const orderParams = [];
      let pi = 1;
      for (const key of ORDER_KEYS) {
        orderSets.push(`${key} = $${pi}`);
        orderParams.push(nextOrder[key]);
        pi += 1;
      }
      orderParams.push(orderId);
      await client.query(
        `UPDATE orders SET ${orderSets.join(', ')} WHERE order_id = $${pi}`,
        orderParams
      );
    }

    const itemSets = [];
    const itemParams = [];
    let ii = 1;
    for (const key of ITEM_KEYS) {
      itemSets.push(`${key} = $${ii}`);
      itemParams.push(safeItem[key]);
      ii += 1;
    }
    itemParams.push(orderId, orderItemId);
    await client.query(
      `UPDATE order_items SET ${itemSets.join(', ')}
        WHERE order_id = $${ii} AND ${PK} = $${ii + 1}`,
      itemParams
    );

    const totalRes = await client.query(
      `SELECT COALESCE(SUM(COALESCE(price_at_purchase, 0) * COALESCE(quantity, 1)), 0) AS total
         FROM order_items WHERE order_id = $1`,
      [orderId]
    );
    const total = Number(totalRes.rows[0]?.total || 0);
    await client.query(`UPDATE orders SET total_amount = $1 WHERE order_id = $2`, [total, orderId]);

    await client.query('COMMIT');

    const order = { ...nextOrder, total_amount: total };
    const item = safeItem;
    const supportsVerses = await itemSupportsVerses(item);
    return {
      order,
      item,
      meta: await getOrderItemMeta(orderId, orderItemId),
      detailsComplete: isDetailsComplete(order, item),
      supportsVerses,
      fieldDefs: {
        order: ORDER_DETAIL_FIELDS,
        item: ITEM_DETAIL_FIELDS,
      },
    };
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23502') {
      const friendly = new Error('שדה חובה חסר — לא ניתן לשמור ערך ריק בעמודה נדרשת.');
      friendly.status = 400;
      throw friendly;
    }
    throw err;
  } finally {
    client.release();
  }
}

async function markOrderSubmitted(orderId) {
  await query(
    `UPDATE orders SET status = 'submitted' WHERE order_id = $1`,
    [orderId]
  );
}

/**
 * After a product is finished (DXF/PDF), remove only that line from the open order.
 * Other items stay. If none remain, mark the order submitted.
 */
async function completeOrderItem(orderId, orderItemId) {
  const deleted = await deleteOrderItem(orderId, orderItemId);
  const { getOrderItems } = require('./customerService');
  const items = await getOrderItems(orderId);
  let orderSubmitted = false;
  if (!items.length) {
    await markOrderSubmitted(orderId);
    orderSubmitted = true;
  }
  return {
    deletedItemId: deleted.deletedItemId,
    remainingItems: items,
    remainingCount: items.length,
    orderSubmitted,
  };
}

const OPEN_STATUSES = ['draft', 'open'];

function removeItemStorageFiles(orderId, orderItemId) {
  const dir = path.join(STORAGE_DIR, String(orderId));
  if (!fs.existsSync(dir)) return;
  const prefix = `item-${orderItemId}`;
  for (const name of fs.readdirSync(dir)) {
    if (name === prefix || name.startsWith(`${prefix}.`) || name.startsWith(`${prefix}-`)) {
      fs.rmSync(path.join(dir, name), { force: true });
    }
  }
}

/** Remove one line from a draft/open order and delete its stored files. */
async function deleteOrderItem(orderId, orderItemId) {
  const orderIdNum = Number(orderId);
  const itemIdNum = Number(orderItemId);
  if (!Number.isInteger(orderIdNum) || !Number.isInteger(itemIdNum)) {
    const e = new Error('מזהה הזמנה או פריט שגוי.');
    e.status = 400;
    throw e;
  }

  const { rows: orderRows } = await query(
    `SELECT order_id FROM orders WHERE order_id = $1 AND status = ANY($2)`,
    [orderIdNum, OPEN_STATUSES]
  );
  if (!orderRows[0]) {
    const e = new Error('ההזמנה לא נמצאה או שאינה ניתנת לעריכה.');
    e.status = 404;
    throw e;
  }

  const { rows } = await query(
    `DELETE FROM order_items
      WHERE order_id = $1 AND ${PK} = $2
      RETURNING ${PK} AS order_item_id`,
    [orderIdNum, itemIdNum]
  );
  if (!rows[0]) {
    const e = new Error('הפריט לא נמצא בהזמנה.');
    e.status = 404;
    throw e;
  }

  removeItemStorageFiles(orderIdNum, itemIdNum);
  return { deletedItemId: itemIdNum };
}

/** Delete a draft/open order, remove stored files, and open a fresh draft for the client. */
async function deleteOrder(orderId) {
  const orderIdNum = Number(orderId);
  if (!Number.isInteger(orderIdNum)) {
    const e = new Error('מזהה הזמנה שגוי.');
    e.status = 400;
    throw e;
  }

  const { rows } = await query(
    `DELETE FROM orders
      WHERE order_id = $1
        AND status = ANY($2)
      RETURNING customer_id`,
    [orderIdNum, OPEN_STATUSES]
  );

  if (!rows[0]) {
    const e = new Error('ההזמנה לא נמצאה או שאינה ניתנת למחיקה.');
    e.status = 404;
    throw e;
  }

  const orderDir = path.join(STORAGE_DIR, String(orderIdNum));
  if (fs.existsSync(orderDir)) {
    fs.rmSync(orderDir, { recursive: true, force: true });
  }

  const { createDraftOrder } = require('./customerService');
  const order = rows[0].customer_id
    ? await createDraftOrder(rows[0].customer_id)
    : null;

  return { deletedOrderId: orderIdNum, order, items: [] };
}

module.exports = {
  STORAGE_DIR,
  createOrderItem,
  getOrderItemMeta,
  getOrderItemVerses,
  saveOrderItemVerses,
  getOrderItemDetails,
  saveOrderItemDetails,
  markOrderSubmitted,
  completeOrderItem,
  deleteOrderItem,
  deleteOrder,
  assertItemSupportsVerses,
};
