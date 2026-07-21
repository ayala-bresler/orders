'use strict';

/** Apply server/db/schema.sql to the configured database (no server start). */

require('dotenv').config();
const { pool } = require('../src/db');
const { initDb } = require('../src/initDb');

async function main() {
  await initDb();
  await pool.end();
}

main().catch((err) => {
  console.error('[db:schema] failed:', err.message);
  process.exit(1);
});
