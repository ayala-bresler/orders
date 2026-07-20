'use strict';

/**
 * Focused, idempotent migration: add the two SVG-snapshot columns used by the
 * personalization module to the existing order_items table. Purely additive —
 * touches no existing columns or data.
 */

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { pool } = require('../src/db');

async function main() {
  await pool.query('ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customized_svg TEXT');
  await pool.query('ALTER TABLE order_items ADD COLUMN IF NOT EXISTS customized_svg_path TEXT');

  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='order_items'
        AND column_name IN ('customized_svg','customized_svg_path')
      ORDER BY column_name`
  );
  console.log('snapshot columns present:', rows.map((r) => r.column_name).join(', '));
  await pool.end();
}

main().catch(async (e) => {
  console.error('migration failed:', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
