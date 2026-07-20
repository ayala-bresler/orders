'use strict';

const fs = require('fs');
const path = require('path');

const MODEL_IMAGES_DIR =
  process.env.MODEL_IMAGES_DIR ||
  'Z:\\תיק מוצר\\documents\\images\\dept4\\model';

const EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

function sanitizeShortSku(shortSku) {
  return String(shortSku || '')
    .trim()
    .replace(/[^0-9A-Za-z\-]/g, '');
}

/** Resolve image file for a short SKU such as 4-03. */
function resolveModelImagePath(shortSku) {
  const safe = sanitizeShortSku(shortSku);
  if (!safe) return null;
  for (const ext of EXTENSIONS) {
    const filePath = path.join(MODEL_IMAGES_DIR, `${safe}${ext}`);
    if (fs.existsSync(filePath)) return filePath;
  }
  return null;
}

function modelImageExists(shortSku) {
  return Boolean(resolveModelImagePath(shortSku));
}

module.exports = {
  MODEL_IMAGES_DIR,
  resolveModelImagePath,
  modelImageExists,
  sanitizeShortSku,
};
