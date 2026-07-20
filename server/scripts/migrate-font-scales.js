'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { pool } = require('../src/db');

async function main() {
  await pool.query(
    'ALTER TABLE order_items ADD COLUMN IF NOT EXISTS verse_font_scales JSONB'
  );
  const { rows } = await pool.query(
    `SELECT column_name FROM information_schema.columns
      WHERE table_schema='public' AND table_name='order_items'
        AND column_name = 'verse_font_scales'`
  );
  console.log('verse_font_scales present:', rows.length > 0);
  await pool.end();
}

main().catch(async (e) => {
  console.error('migration failed:', e.message);
  try { await pool.end(); } catch {}
  process.exit(1);
});
