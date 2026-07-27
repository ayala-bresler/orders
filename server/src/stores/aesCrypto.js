'use strict';

/**
 * AES-256-GCM helpers for encrypting store SMTP passwords at rest.
 * Key: STORE_SMTP_SECRET (preferred) or SESSION_SECRET / PGPASSWORD fallback.
 */

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey() {
  const secret =
    process.env.STORE_SMTP_SECRET ||
    process.env.SESSION_SECRET ||
    process.env.PGPASSWORD ||
    'hetz-haim-dev-smtp-secret-change-me';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * @param {string} plaintext
 * @returns {string} base64url(iv || tag || ciphertext)
 */
function encryptAes256(plaintext) {
  if (plaintext == null || plaintext === '') return null;
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64url');
}

/**
 * @param {string|null} payload
 * @returns {string|null}
 */
function decryptAes256(payload) {
  if (!payload) return null;
  const buf = Buffer.from(String(payload), 'base64url');
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    const err = new Error('מפתח SMTP מוצפן אינו תקין.');
    err.status = 500;
    throw err;
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

module.exports = {
  encryptAes256,
  decryptAes256,
};
