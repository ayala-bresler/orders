'use strict';

/** Apply server/db/seed.sql (demo catalog data) to the configured database. */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

async function main() {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '..', 'db', 'seed.sql'),
    'utf8'
  );
  await pool.query(sql);
  console.log('[db:seed] seed data applied successfully.');
  await pool.end();
}

main().catch((err) => {
  console.error('[db:seed] failed:', err.message);
  process.exit(1);
});
