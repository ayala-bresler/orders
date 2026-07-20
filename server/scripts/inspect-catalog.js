'use strict';

/** Quick read-only inspection of the real catalog data (no writes). */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { pool } = require('../src/db');

async function main() {
  const cat = await pool.query(
    'SELECT category_id, category_name FROM categories WHERE category_id = 4'
  );
  console.log('category 4:', JSON.stringify(cat.rows));

  const types = await pool.query(
    'SELECT product_type_code, type_name FROM product_types ORDER BY product_type_code'
  );
  console.log('product_types:', JSON.stringify(types.rows));

  const p = await pool.query(
    'SELECT count(*)::int AS n FROM products WHERE category_id = 4'
  );
  console.log('products in category 4:', p.rows[0].n);

  const ec = await pool.query(
    `SELECT count(*)::int AS n
       FROM products p
      WHERE p.category_id = 4
        AND EXISTS (SELECT 1 FROM product_variants v
                      JOIN product_types t ON t.product_type_code = v.product_type_code
                     WHERE v.product_code = p.product_code AND t.type_name = 'עץ חיים')`
  );
  console.log('category-4 products supporting verses (עץ חיים):', ec.rows[0].n);

  const catalogService = require('../src/services/catalogService');
  const products = await catalogService.listProducts();
  console.log('\ncatalogService.listProducts():');
  products.forEach((p) =>
    console.log('  ', p.product_code, '|', p.product_name, '| verses:', p.supports_verses)
  );

  await pool.end();
}

main().catch(async (e) => {
  console.error('ERR', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
