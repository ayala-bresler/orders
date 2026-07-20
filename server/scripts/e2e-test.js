'use strict';

/**
 * Self-cleaning end-to-end test of the personalization chain against the live
 * schema. Creates a throwaway customer/order/item, saves + reads verses, then
 * deletes everything it created. Uses an obviously fake phone number.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { pool } = require('../src/db');
const customerService = require('../src/services/customerService');
const catalogService = require('../src/services/catalogService');
const orderService = require('../src/services/orderService');

const TEST_PHONE = '999000111222'; // fake, self-cleaning

async function main() {
  let customerId, orderId;
  try {
    // 1. identify (creates customer + draft order)
    const id = await customerService.identify({ full_name: 'בדיקה אוטומטית', phone: TEST_PHONE });
    customerId = id.customer.customer_id;
    orderId = id.order.order_id;
    console.log('1. identify OK -> customer', customerId, 'order', orderId, '| returning:', id.returning);

    // 2. pick a verse-capable product
    const products = await catalogService.listProducts();
    const prod = products.find((p) => p.supports_verses);
    if (!prod) throw new Error('no verse-capable product found in category 4');
    console.log('2. product picked ->', prod.product_code, prod.product_name);

    // 3. create order item (capture variant model/size like the route does)
    const variant = await catalogService.getPrimaryVariant(prod.product_code);
    const item = await orderService.createOrderItem(orderId, {
      product_code: prod.product_code,
      model: variant?.model_code,
      size: variant?.size_code,
    });
    console.log('3. order item created -> item_id(order_item_id):', item.order_item_id);

    const meta = await orderService.getOrderItemMeta(orderId, item.order_item_id);
    console.log('   meta ->', JSON.stringify({ name: meta.product_name, sku: meta.sku, type: meta.type_name, model: meta.model, size: meta.size }));

    // 4. save verses
    const saved = await orderService.saveOrderItemVerses(orderId, item.order_item_id, {
      top_right_1: 'בדיקת פסוק ראשון',
      bottom_left_2: 'בדיקת פסוק שני',
    });
    console.log('4. verses saved. snapshot ->', saved.customizedSvgPath);

    // 5. read back
    const back = await orderService.getOrderItemVerses(orderId, item.order_item_id);
    const ok1 = back.values.top_right_1 === 'בדיקת פסוק ראשון';
    const ok2 = back.values.bottom_left_2 === 'בדיקת פסוק שני';
    console.log('5. read back -> top_right_1 OK:', ok1, '| bottom_left_2 OK:', ok2);

    if (!ok1 || !ok2) throw new Error('verse round-trip mismatch');
    console.log('\nE2E PASSED');
  } finally {
    // cleanup (cascade deletes order_items)
    if (orderId) await pool.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
    if (customerId) await pool.query('DELETE FROM customers WHERE customer_id = $1', [customerId]);
    console.log('cleanup done (removed test order + customer)');
    await pool.end();
  }
}

main().catch((e) => {
  console.error('E2E FAILED:', e.message);
  process.exit(1);
});
