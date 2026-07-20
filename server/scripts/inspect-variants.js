'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { pool } = require('../src/db');

async function main() {
  const { rows } = await pool.query(
    `SELECT v.sku, v.product_code, v.product_type_code, t.type_name,
            v.model_code, v.size_code, p.product_name
       FROM product_variants v
       LEFT JOIN product_types t ON t.product_type_code = v.product_type_code
       LEFT JOIN products p ON p.product_code = v.product_code
      WHERE v.product_code IN ('97','98','99')
      ORDER BY v.product_code, v.sku`
  );
  console.log(JSON.stringify(rows, null, 2));
  await pool.end();
}

main().catch(async (e) => { console.error('ERR', e.message); try { await pool.end(); } catch {} process.exit(1); });
