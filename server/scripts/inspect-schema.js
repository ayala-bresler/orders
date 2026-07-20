'use strict';

/** Read-only: dump columns + PK for the tables the app writes to. */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { pool } = require('../src/db');

async function cols(table) {
  const { rows } = await pool.query(
    `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position`,
    [table]
  );
  return rows;
}

async function pk(table) {
  const { rows } = await pool.query(
    `SELECT kcu.column_name
       FROM information_schema.table_constraints tc
       JOIN information_schema.key_column_usage kcu
         ON kcu.constraint_name = tc.constraint_name
      WHERE tc.table_schema='public' AND tc.table_name=$1 AND tc.constraint_type='PRIMARY KEY'
      ORDER BY kcu.ordinal_position`,
    [table]
  );
  return rows.map((r) => r.column_name);
}

async function main() {
  for (const t of ['order_items', 'orders']) {
    console.log(`\n=== ${t} ===`);
    console.log('PK:', JSON.stringify(await pk(t)));
    const c = await cols(t);
    if (!c.length) console.log('(table does not exist)');
    c.forEach((r) => console.log(`  ${r.column_name} : ${r.data_type} ${r.is_nullable === 'NO' ? 'NOT NULL' : ''}`));
  }
  await pool.end();
}

main().catch(async (e) => {
  console.error('ERR', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
