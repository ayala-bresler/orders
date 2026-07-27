'use strict';

/**
 * Apply delta migration 002 (store auth) for DBs that already have base tables.
 * Synced to current pgAdmin schema.
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
  '002_store_auth_delta_existing_db.sql'
);

async function main() {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');
  console.log(`[migrate-delta] applying: ${MIGRATION_PATH}`);
  console.log(`[migrate-delta] DB: ${process.env.PGDATABASE || process.env.DATABASE_URL || '(default)'}`);
  await pool.query(sql);
  console.log('[migrate-delta] applied successfully.');
  await pool.end();
}

main().catch((err) => {
  console.error('[migrate-delta] failed:', err.message);
  process.exit(1);
});
