'use strict';

const fs = require('fs');
const path = require('path');

/** Bundled images for deploy (Railway). Override with MODEL_IMAGES_DIR. */
const BUNDLED_MODEL_IMAGES_DIR = path.join(
  __dirname,
  '..',
  '..',
  'assets',
  'model-images'
);

const LEGACY_LOCAL_DIR = 'Z:\\תיק מוצר\\documents\\images\\dept4\\model';

function resolveImagesDir() {
  if (process.env.MODEL_IMAGES_DIR) {
    return process.env.MODEL_IMAGES_DIR;
  }
  if (fs.existsSync(BUNDLED_MODEL_IMAGES_DIR)) {
    return BUNDLED_MODEL_IMAGES_DIR;
  }
  return LEGACY_LOCAL_DIR;
}

const MODEL_IMAGES_DIR = resolveImagesDir();

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
  BUNDLED_MODEL_IMAGES_DIR,
  resolveModelImagePath,
  modelImageExists,
  sanitizeShortSku,
};
