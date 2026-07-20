'use strict';

/**
 * Stateless signed session tokens (Cloud Run multi-instance safe).
 * Token format: base64url(payloadJson).base64url(hmacSha256)
 */

const crypto = require('crypto');

const SESSION_TTL_MS = Math.max(
  60_000,
  Number(process.env.SESSION_TTL_MS || 15 * 60 * 1000)
);

const SESSION_SECRET =
  process.env.SESSION_SECRET ||
  process.env.PGPASSWORD ||
  'hetz-haim-dev-session-secret-change-me';

/** jti → expiresAtMs — best-effort revoke on logout (per instance). */
const revoked = new Map();

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function fromB64url(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/') + pad;
  return Buffer.from(b64, 'base64');
}

function sign(payloadPart) {
  return b64url(
    crypto.createHmac('sha256', SESSION_SECRET).update(payloadPart).digest()
  );
}

function pruneRevoked(now = Date.now()) {
  for (const [id, exp] of revoked) {
    if (exp <= now) revoked.delete(id);
  }
}

function createSessionToken({ customerId, orderId, ttlMs = SESSION_TTL_MS } = {}) {
  const now = Date.now();
  const payload = {
    v: 1,
    jti: crypto.randomBytes(16).toString('hex'),
    cid: Number(customerId) || null,
    oid: Number(orderId) || null,
    iat: Math.floor(now / 1000),
    exp: Math.floor((now + ttlMs) / 1000),
  };
  const payloadPart = b64url(JSON.stringify(payload));
  const token = `${payloadPart}.${sign(payloadPart)}`;
  return {
    token,
    expiresAt: new Date(payload.exp * 1000).toISOString(),
    expiresInMs: ttlMs,
    maxAgeMs: SESSION_TTL_MS,
  };
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') {
    const err = new Error('נדרשת התחברות מחדש.');
    err.status = 401;
    err.code = 'SESSION_MISSING';
    throw err;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    const err = new Error('סשן לא תקין. יש להתחבר מחדש.');
    err.status = 401;
    err.code = 'SESSION_INVALID';
    throw err;
  }

  const [payloadPart, sig] = parts;
  const expected = sign(payloadPart);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const err = new Error('סשן לא תקין. יש להתחבר מחדש.');
    err.status = 401;
    err.code = 'SESSION_INVALID';
    throw err;
  }

  let payload;
  try {
    payload = JSON.parse(fromB64url(payloadPart).toString('utf8'));
  } catch {
    const err = new Error('סשן לא תקין. יש להתחבר מחדש.');
    err.status = 401;
    err.code = 'SESSION_INVALID';
    throw err;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload?.exp || payload.exp <= nowSec) {
    const err = new Error('פג תוקף הסשן עקב חוסר פעילות. יש להתחבר מחדש.');
    err.status = 401;
    err.code = 'SESSION_EXPIRED';
    throw err;
  }

  pruneRevoked();
  if (payload.jti && revoked.has(payload.jti)) {
    const err = new Error('הסשן בוטל. יש להתחבר מחדש.');
    err.status = 401;
    err.code = 'SESSION_REVOKED';
    throw err;
  }

  return payload;
}

function revokeSessionToken(token) {
  try {
    const payload = verifySessionToken(token);
    if (payload.jti) revoked.set(payload.jti, payload.exp * 1000);
  } catch {
    /* already invalid / expired */
  }
}

/** Attach session fields onto an identify/confirm API result. */
function withSession(result) {
  if (!result || result.needsConfirmation || !result.customer?.customer_id) {
    return result;
  }
  const session = createSessionToken({
    customerId: result.customer.customer_id,
    orderId: result.order?.order_id,
  });
  return {
    ...result,
    sessionToken: session.token,
    sessionExpiresAt: session.expiresAt,
    sessionExpiresInMs: session.expiresInMs,
    sessionMaxAgeMs: session.maxAgeMs,
  };
}

module.exports = {
  SESSION_TTL_MS,
  createSessionToken,
  verifySessionToken,
  revokeSessionToken,
  withSession,
};
