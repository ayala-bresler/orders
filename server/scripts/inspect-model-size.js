'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { pool } = require('../src/db');

async function cols(table) {
  const { rows } = await pool.query(
    `SELECT column_name, data_type FROM information_schema.columns
      WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`,
    [table]
  );
  return rows.map((r) => `${r.column_name}:${r.data_type}`);
}

async function main() {
  for (const t of ['product_types', 'sizes', 'product_variants']) {
    console.log(`\n=== ${t} columns ===`);
    const c = await cols(t);
    console.log(c.length ? c.join('\n') : '(table does not exist)');
  }

  console.log('\n=== product_types rows ===');
  console.log(JSON.stringify((await pool.query('SELECT * FROM product_types ORDER BY product_type_code')).rows, null, 2));

  const hasSizes = (await cols('sizes')).length > 0;
  if (hasSizes) {
    console.log('\n=== sizes rows (first 20) ===');
    console.log(JSON.stringify((await pool.query('SELECT * FROM sizes ORDER BY 1 LIMIT 20')).rows, null, 2));
  }

  console.log('\n=== variants for etz-chaim products ===');
  console.log(JSON.stringify((await pool.query(
    `SELECT * FROM product_variants WHERE product_code IN ('97','98','99') ORDER BY sku`
  )).rows, null, 2));

  await pool.end();
}

main().catch(async (e) => { console.error('ERR', e.message); try { await pool.end(); } catch {} process.exit(1); });
