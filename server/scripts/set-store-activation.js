'use strict';

/**
 * Assign (or refresh) a one-time activation_code on an existing store.
 * Usage:
 *   node server/scripts/set-store-activation.js <store_id|store_name> ACTIVATION_CODE
 */

require('dotenv').config();
const { pool, query } = require('../src/db');

async function main() {
  const key = String(process.argv[2] || '').trim();
  const activationCode = String(process.argv[3] || '').trim();
  if (!key || !activationCode) {
    console.error(
      'Usage: node server/scripts/set-store-activation.js <store_id|store_name> <activation_code>'
    );
    process.exit(1);
  }

  const asId = Number(key);
  const { rows } = await query(
    Number.isFinite(asId) && String(asId) === key
      ? `UPDATE stores
            SET activation_code = $2,
                password_hash = NULL
          WHERE store_id = $1
          RETURNING store_id, store_name, activation_code`
      : `UPDATE stores
            SET activation_code = $2,
                password_hash = NULL
          WHERE store_name = $1
          RETURNING store_id, store_name, activation_code`,
    [Number.isFinite(asId) && String(asId) === key ? asId : key, activationCode]
  );

  if (!rows[0]) {
    console.error('[set-store-activation] store not found:', key);
    process.exit(1);
  }

  console.log('[set-store-activation] updated:', rows[0]);
  await pool.end();
}

main().catch(async (err) => {
  console.error('[set-store-activation] failed:', err.message);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
