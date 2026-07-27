'use strict';

/**
 * Apply store auth/SMTP migration (001) without restarting the app server.
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

const MIGRATION_PATH = path.resolve(
  __dirname,
  '..',
  'db',
  'migrations',
  '001_store_auth_and_smtp.sql'
);

async function main() {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  console.log(`[migrate] applying: ${MIGRATION_PATH}`);
  await pool.query(sql);
  console.log('[migrate] store auth/SMTP migration applied successfully.');
  await pool.end();
}

main().catch((err) => {
  console.error('[migrate] failed:', err.message);
  process.exit(1);
});
