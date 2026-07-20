'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { pool } = require('../src/db');

async function main() {
  for (const t of ['models', 'sizes']) {
    const { rows } = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
      [t]
    );
    console.log(`${t}:`, rows.map((r) => r.column_name).join(', ') || '(missing)');
  }
  const { rows } = await pool.query('SELECT * FROM models ORDER BY 1 LIMIT 8');
  console.log('sample models:', JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch(async (e) => {
  console.error(e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
