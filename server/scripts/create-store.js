'use strict';

/**
 * Create a store row for admin pre-registration (activation_code + percentage).
 * Usage:
 *   node server/scripts/create-store.js "שם חנות" ACTIVATION_CODE [percentage]
 */

require('dotenv').config();
const { pool, query } = require('../src/db');

async function syncStoreIdSequence() {
  await query(
    `SELECT setval(
       pg_get_serial_sequence('stores', 'store_id'),
       COALESCE((SELECT MAX(store_id) FROM stores), 1),
       true
     )`
  );
}

async function main() {
  const storeName = String(process.argv[2] || '').trim();
  const activationCode = String(process.argv[3] || '').trim();
  const percentage = Number(process.argv[4] ?? 0);

  if (!storeName || !activationCode) {
    console.error(
      'Usage: node server/scripts/create-store.js "<store_name>" <activation_code> [percentage]'
    );
    process.exit(1);
  }

  await syncStoreIdSequence();

  const { rows } = await query(
    `INSERT INTO stores (store_name, activation_code, percentage)
     VALUES ($1, $2, $3)
     RETURNING store_id, store_name, activation_code, percentage`,
    [storeName, activationCode, Number.isFinite(percentage) ? percentage : 0]
  );

  console.log('[create-store] created:', rows[0]);
  await pool.end();
}

main().catch(async (err) => {
  console.error('[create-store] failed:', err.message);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
