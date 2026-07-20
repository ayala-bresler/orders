'use strict';

/** Apply server/db/schema.sql to the configured database. */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function main() {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '..', 'db', 'schema.sql'),
    'utf8'
  );
  await pool.query(sql);
  console.log('[db:schema] schema applied successfully.');
  await pool.end();
}

main().catch((err) => {
  console.error('[db:schema] failed:', err.message);
  process.exit(1);
});
