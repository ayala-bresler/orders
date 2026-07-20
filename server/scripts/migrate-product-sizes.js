'use strict';

/**
 * Apply product_sizes seed + copy real SVG templates from SVG_SIZES folder.
 * Usage: node server/scripts/migrate-product-sizes.js
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

const SOURCE_DIR =
  process.env.SVG_SIZES_DIR ||
  path.resolve(String.raw`C:\Users\User\Downloads\SVG_SIZES`);

const LEGACY_FILES = ['order-075.svg', 'order-080.svg', 'order-085.svg', 'order-090.svg'];

async function run() {
  await pool.query(
    'ALTER TABLE product_sizes ADD COLUMN IF NOT EXISTS supports_verses BOOLEAN NOT NULL DEFAULT TRUE'
  );

  const seedPath = path.resolve(__dirname, '..', 'db', 'seed-product-sizes.sql');
  const seedSql = fs.readFileSync(seedPath, 'utf8');
  await pool.query(seedSql);

  const templatesDir = path.resolve(__dirname, '..', 'templates', 'sizes');
  fs.mkdirSync(templatesDir, { recursive: true });

  const sourceFiles = fs.readdirSync(SOURCE_DIR).filter((name) => /\.svg$/i.test(name));
  if (!sourceFiles.length) {
    console.warn(`No SVG files found in ${SOURCE_DIR}`);
  }

  for (const name of sourceFiles.sort()) {
    const src = path.join(SOURCE_DIR, name);
    const dest = path.join(templatesDir, name);
    fs.copyFileSync(src, dest);
    console.log(`Copied template: sizes/${name}`);
  }

  for (const name of LEGACY_FILES) {
    const legacy = path.join(templatesDir, name);
    if (fs.existsSync(legacy)) {
      fs.unlinkSync(legacy);
      console.log(`Removed legacy template: sizes/${name}`);
    }
  }

  console.log('product_sizes migration complete.');
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
