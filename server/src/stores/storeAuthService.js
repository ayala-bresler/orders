'use strict';

const crypto = require('crypto');
const { promisify } = require('util');
const { query } = require('../db');
// AES helpers kept in aesCrypto.js for any legacy encrypted rows; no longer used here.

const scrypt = promisify(crypto.scrypt);
const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await scrypt(String(password), salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return `scrypt$${salt.toString('hex')}$${Buffer.from(derived).toString('hex')}`;
}

async function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  if (!salt.length || !expected.length) return false;
  const derived = await scrypt(String(password), salt, expected.length, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  const got = Buffer.from(derived);
  if (got.length !== expected.length) return false;
  return crypto.timingSafeEqual(expected, got);
}

function publicStoreRow(row) {
  if (!row) return null;
  const storeEmail = row.store_email || null;
  return {
    storeId: row.store_id,
    storeName: row.store_name,
    percentage: row.percentage != null ? Number(row.percentage) : null,
    storeEmail,
    needsPasswordSetup: !row.password_hash,
    needsEmailSetup: !storeEmail,
  };
}

async function findStoreByName(storeName) {
  const name = String(storeName || '').trim();
  if (!name) return null;
  const { rows } = await query(
    `SELECT * FROM stores WHERE store_name = $1 LIMIT 1`,
    [name]
  );
  return rows[0] || null;
}

async function findStoreByActivationCode(code) {
  const activation = String(code || '').trim();
  if (!activation) return null;
  const { rows } = await query(
    `SELECT * FROM stores WHERE activation_code = $1 LIMIT 1`,
    [activation]
  );
  return rows[0] || null;
}

async function findStoreById(storeId) {
  const { rows } = await query(`SELECT * FROM stores WHERE store_id = $1`, [
    Number(storeId),
  ]);
  return rows[0] || null;
}

function badCredentials() {
  const e = new Error('שם חנות או סיסמה שגויים.');
  e.status = 401;
  return e;
}

/**
 * Unified entry: store name + password.
 * - Permanent password match → login
 * - Admin activation_code match (and no permanent password yet) → setup_password
 */
async function resolveStoreEntry({ storeName, password }) {
  const store = await findStoreByName(storeName);
  if (!store) throw badCredentials();

  const pass = String(password || '');
  if (!pass) throw badCredentials();

  if (store.password_hash) {
    const ok = await verifyPassword(pass, store.password_hash);
    if (!ok) throw badCredentials();
    return { action: 'login', store };
  }

  const code = String(store.activation_code || '').trim();
  if (code && pass === code) {
    return { action: 'setup_password', store };
  }

  throw badCredentials();
}

/**
 * First visit: verify admin activation code for store name, set permanent password.
 * Clears activation_code after success (one-time setup).
 */
async function activateStore({ activationCode, password, storeName, storeEmail }) {
  const code = String(activationCode || '').trim();
  const pass = String(password || '');
  const name = String(storeName || '').trim();
  const email = String(storeEmail || '').trim() || null;

  if (!name) {
    const e = new Error('נא להזין שם חנות.');
    e.status = 400;
    throw e;
  }
  if (!code) {
    const e = new Error('נא להזין את סיסמת המנהל.');
    e.status = 400;
    throw e;
  }
  if (pass.length < 6) {
    const e = new Error('הסיסמה חייבת להכיל לפחות 6 תווים.');
    e.status = 400;
    throw e;
  }
  if (!email || !email.includes('@')) {
    const e = new Error('נא להזין כתובת אימייל תקינה של החנות.');
    e.status = 400;
    throw e;
  }

  const store = await findStoreByName(name);
  if (!store) throw badCredentials();
  if (store.password_hash) {
    const e = new Error('החנות כבר הגדירה סיסמה. יש להתחבר עם שם החנות והסיסמה.');
    e.status = 409;
    throw e;
  }
  if (!store.activation_code || String(store.activation_code).trim() !== code) {
    throw badCredentials();
  }

  const passwordHash = await hashPassword(pass);
  const { rows } = await query(
    `UPDATE stores
        SET password_hash = $2,
            activation_code = NULL,
            store_email = $3,
            smtp_host = NULL,
            smtp_port = NULL,
            smtp_user = NULL,
            smtp_pass_encrypted = NULL
      WHERE store_id = $1
        AND password_hash IS NULL
        AND activation_code IS NOT NULL
      RETURNING *`,
    [store.store_id, passwordHash, email]
  );
  if (!rows[0]) {
    const e = new Error('לא ניתן להגדיר סיסמה — ייתכן שההפעלה כבר בוצעה.');
    e.status = 409;
    throw e;
  }
  return rows[0];
}

async function loginStore({ storeName, password }) {
  const result = await resolveStoreEntry({ storeName, password });
  if (result.action !== 'login') {
    throw badCredentials();
  }
  return result.store;
}

async function createStoreSession(storeId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  await query(
    `INSERT INTO store_sessions (store_id, token_hash)
     VALUES ($1, $2)`,
    [storeId, tokenHash]
  );
  return token;
}

async function resolveStoreSession(token) {
  if (!token) return null;
  const tokenHash = hashToken(token);
  const { rows } = await query(
    `SELECT s.*, ss.session_id
       FROM store_sessions ss
       JOIN stores s ON s.store_id = ss.store_id
      WHERE ss.token_hash = $1
      LIMIT 1`,
    [tokenHash]
  );
  if (!rows[0]) return null;
  await query(
    `UPDATE store_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE session_id = $1`,
    [rows[0].session_id]
  );
  return rows[0];
}

async function revokeStoreSession(token) {
  if (!token) return;
  await query(`DELETE FROM store_sessions WHERE token_hash = $1`, [
    hashToken(token),
  ]);
}

async function updateStoreEmail(storeId, input = {}) {
  const storeEmail = String(input.storeEmail || input.store_email || '').trim() || null;
  if (!storeEmail || !storeEmail.includes('@')) {
    const e = new Error('נא להזין כתובת אימייל תקינה של החנות.');
    e.status = 400;
    throw e;
  }

  const current = await findStoreById(storeId);
  if (!current) {
    const e = new Error('חנות לא נמצאה.');
    e.status = 404;
    throw e;
  }

  // Keep only store_email — clear legacy per-store SMTP credentials.
  const { rows } = await query(
    `UPDATE stores
        SET store_email = $2,
            smtp_host = NULL,
            smtp_port = NULL,
            smtp_user = NULL,
            smtp_pass_encrypted = NULL
      WHERE store_id = $1
      RETURNING *`,
    [storeId, storeEmail]
  );
  return rows[0];
}

/** @deprecated use updateStoreEmail — kept so old clients fail gracefully */
async function updateStoreSmtp(storeId, input = {}) {
  return updateStoreEmail(storeId, input);
}

async function clearAllStoreSmtpCredentials() {
  await query(
    `UPDATE stores
        SET smtp_host = NULL,
            smtp_port = NULL,
            smtp_user = NULL,
            smtp_pass_encrypted = NULL`
  );
}

async function listStoreCustomers(storeId) {
  const { rows } = await query(
    `SELECT customer_id, full_name, phone, email, address, created_at
       FROM customers
      WHERE store_id = $1
      ORDER BY full_name ASC, customer_id ASC`,
    [Number(storeId)]
  );
  return rows;
}

async function bindCustomerToStore(customerId, storeId) {
  if (!customerId || !storeId) return null;
  const { rows } = await query(
    `UPDATE customers
        SET store_id = $2
      WHERE customer_id = $1
        AND (store_id IS NULL OR store_id = $2)
      RETURNING customer_id, full_name, phone, email, address, store_id`,
    [Number(customerId), Number(storeId)]
  );
  return rows[0] || null;
}

async function selectStoreCustomer(storeId, customerId) {
  const { rows } = await query(
    `SELECT customer_id, full_name, phone, email, address, store_id
       FROM customers
      WHERE customer_id = $1 AND store_id = $2`,
    [Number(customerId), Number(storeId)]
  );
  if (!rows[0]) {
    const e = new Error('הלקוח לא נמצא ברשימת הלקוחות של החנות.');
    e.status = 404;
    throw e;
  }
  return rows[0];
}

module.exports = {
  publicStoreRow,
  resolveStoreEntry,
  activateStore,
  loginStore,
  createStoreSession,
  resolveStoreSession,
  revokeStoreSession,
  updateStoreEmail,
  updateStoreSmtp,
  clearAllStoreSmtpCredentials,
  listStoreCustomers,
  bindCustomerToStore,
  selectStoreCustomer,
  findStoreById,
};
