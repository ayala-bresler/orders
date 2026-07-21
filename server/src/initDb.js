'use strict';

/**
 * Apply server/db/schema.sql to the configured PostgreSQL database.
 * Safe to re-run: schema uses CREATE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
 */

const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

const SCHEMA_PATH = path.resolve(__dirname, '..', 'db', 'schema.sql');

async function initDb() {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  console.log(`[init] applying schema: ${SCHEMA_PATH}`);
  await pool.query(sql);
  console.log('[init] schema applied successfully.');
}

module.exports = { initDb, SCHEMA_PATH };
