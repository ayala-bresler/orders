'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { pool } = require('../src/db');
const orderService = require('../src/services/orderService');
const { exportOrderItemPdf } = require('../src/export/pdfExportService');

async function main() {
  const orderId = Number(process.argv[2] || 1);
  const itemId = Number(process.argv[3] || 1);
  const result = await exportOrderItemPdf(orderId, itemId, {
    getOrderItemDetails: orderService.getOrderItemDetails,
    getOrderItemVerses: orderService.getOrderItemVerses,
  });
  console.log('PDF written:', result.filePath);
  await pool.end();
}

main().catch(async (e) => {
  console.error('ERR', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
