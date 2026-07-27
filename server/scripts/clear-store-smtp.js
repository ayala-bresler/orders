'use strict';

/**
 * Clear legacy per-store SMTP credentials (host/port/user/pass).
 * Stores keep only store_email; mail is sent via system SMTP.
 */

require('dotenv').config();
const { pool } = require('../src/db');
const { clearAllStoreSmtpCredentials } = require('../src/stores/storeAuthService');

async function main() {
  await clearAllStoreSmtpCredentials();
  console.log('[clear-store-smtp] cleared smtp_* columns for all stores.');
  await pool.end();
}

main().catch(async (err) => {
  console.error('[clear-store-smtp] failed:', err.message);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
