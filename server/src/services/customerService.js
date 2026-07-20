'use strict';

/**
 * customerService
 * ---------------
 * Phone-based identification. Existing customers use the name from the DB.
 * New customers require explicit confirmation before insert.
 */

const { query } = require('../db');

/** Keep digits only so "050-123-4567" and "0501234567" match. */
function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function normalizeName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

const OPEN_STATUSES = ['draft', 'open'];

async function getLatestOpenOrder(customerId) {
  const { rows } = await query(
    `SELECT order_id, customer_id, status, order_date, total_amount
       FROM orders
      WHERE customer_id = $1 AND status = ANY($2)
      ORDER BY order_date DESC
      LIMIT 1`,
    [customerId, OPEN_STATUSES]
  );
  return rows[0] || null;
}

async function createDraftOrder(customerId) {
  const { rows } = await query(
    `INSERT INTO orders (customer_id, status)
     VALUES ($1, 'draft')
     RETURNING order_id, customer_id, status, order_date, total_amount`,
    [customerId]
  );
  return rows[0];
}

const VERSE_TYPE_NAME = process.env.VERSE_TYPE_NAME || 'עץ חיים';

async function getOrderItems(orderId) {
  const { rows } = await query(
    `SELECT oi.item_id AS order_item_id, oi.product_code, oi.quantity,
            oi.model AS model_code,
            p.product_name, oi.customized_svg_path,
            m.model_name,
            oi.has_crown, oi.crown_model,
            cm.model_name AS crown_model_name,
            oi.has_breastplate, oi.breastplate_model,
            bm.model_name AS breastplate_model_name,
            oi.has_pointer, oi.pointer_model,
            pm.model_name AS pointer_model_name,
            EXISTS (
              SELECT 1 FROM product_variants v
                JOIN product_types t ON t.product_type_code = v.product_type_code
               WHERE v.product_code = oi.product_code AND t.type_name = $2
            ) AS supports_verses
       FROM order_items oi
       LEFT JOIN products p ON p.product_code = oi.product_code
       LEFT JOIN models m ON m.model_code = oi.model
       LEFT JOIN models cm ON cm.model_code = oi.crown_model
       LEFT JOIN models bm ON bm.model_code = oi.breastplate_model
       LEFT JOIN models pm ON pm.model_code = oi.pointer_model
      WHERE oi.order_id = $1
      ORDER BY oi.item_id`,
    [orderId, VERSE_TYPE_NAME]
  );
  return rows;
}

async function attachOrderContext(customer) {
  let order = await getLatestOpenOrder(customer.customer_id);
  const returning = Boolean(order);
  if (!order) order = await createDraftOrder(customer.customer_id);
  const items = await getOrderItems(order.order_id);
  return { customer, order, items, returning, isNew: false };
}

/**
 * Look up a customer by phone. Does not create new records.
 * @param {{ phone: string, email?: string, address?: string }} input
 */
async function identify(input) {
  const phone = normalizePhone(input && input.phone);

  if (phone.length < 7) {
    const e = new Error('נא להזין מספר טלפון תקין.');
    e.status = 400;
    throw e;
  }

  const { rows: existingRows } = await query(
    `SELECT customer_id, full_name, phone, email, address
       FROM customers
      WHERE phone = $1`,
    [phone]
  );

  if (existingRows.length === 0) {
    return { isNew: true, needsConfirmation: true, phone };
  }

  const existing = existingRows[0];
  const incomingEmail = String(input.email || '').trim() || null;
  const incomingAddress = String(input.address || '').trim() || null;
  const { rows } = await query(
    `UPDATE customers
        SET email = COALESCE(NULLIF(BTRIM(email), ''), $2, email),
            address = COALESCE(NULLIF(BTRIM(address), ''), $3, address)
      WHERE customer_id = $1
      RETURNING customer_id, full_name, phone, email, address`,
    [existing.customer_id, incomingEmail, incomingAddress]
  );

  return attachOrderContext(rows[0]);
}

/**
 * Create a new customer after user confirmation.
 * @param {{ phone: string, full_name: string, email?: string, address?: string }} input
 */
async function confirmNewCustomer(input) {
  const phone = normalizePhone(input && input.phone);
  const fullName = normalizeName(input && input.full_name);

  if (phone.length < 7) {
    const e = new Error('נא להזין מספר טלפון תקין.');
    e.status = 400;
    throw e;
  }
  if (!fullName) {
    const e = new Error('נא להזין שם מלא.');
    e.status = 400;
    throw e;
  }

  const { rows: existingRows } = await query(
    `SELECT customer_id FROM customers WHERE phone = $1`,
    [phone]
  );
  if (existingRows.length > 0) {
    const e = new Error('מספר הטלפון כבר רשום במערכת.');
    e.status = 409;
    throw e;
  }

  const { rows } = await query(
    `INSERT INTO customers (full_name, phone, email, address)
     VALUES ($1, $2, $3, $4)
     RETURNING customer_id, full_name, phone, email, address`,
    [fullName, phone, input.email || null, input.address || null]
  );

  return attachOrderContext(rows[0]);
}

module.exports = {
  normalizePhone,
  normalizeName,
  identify,
  confirmNewCustomer,
  getOrderItems,
  getLatestOpenOrder,
  createDraftOrder,
};
