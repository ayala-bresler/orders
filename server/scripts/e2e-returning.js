'use strict';

/** Verify the returning-customer path: re-identify surfaces existing items
 *  with a supports_verses flag. Self-cleaning. */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { pool } = require('../src/db');
const customerService = require('../src/services/customerService');
const catalogService = require('../src/services/catalogService');
const orderService = require('../src/services/orderService');

const TEST_PHONE = '999000111333';

async function main() {
  let customerId, orderId;
  try {
    const first = await customerService.identify({ full_name: 'לקוח חוזר', phone: TEST_PHONE });
    customerId = first.customer.customer_id;
    orderId = first.order.order_id;
    console.log('first visit -> returning:', first.returning, '| items:', first.items.length);

    const prod = (await catalogService.listProducts()).find((p) => p.supports_verses);
    await orderService.createOrderItem(orderId, { product_code: prod.product_code });

    const second = await customerService.identify({ full_name: 'לקוח חוזר', phone: TEST_PHONE });
    console.log('second visit -> returning:', second.returning, '| items:', second.items.length);
    console.log('item[0]:', JSON.stringify({
      name: second.items[0].product_name,
      supports_verses: second.items[0].supports_verses,
    }));

    const ok = second.returning && second.items.length === 1 && second.items[0].supports_verses === true;
    console.log(ok ? '\nRETURNING PATH OK' : '\nRETURNING PATH FAILED');
    if (!ok) process.exitCode = 1;
  } finally {
    if (orderId) await pool.query('DELETE FROM orders WHERE order_id = $1', [orderId]);
    if (customerId) await pool.query('DELETE FROM customers WHERE customer_id = $1', [customerId]);
    console.log('cleanup done');
    await pool.end();
  }
}

main().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
