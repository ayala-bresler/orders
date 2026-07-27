'use strict';

/**
 * System admin auth (ADMIN_SECRET) — separate from store sessions.
 */

const crypto = require('crypto');
const {
  readAdminSessionToken,
  setAdminSessionCookie,
  clearAdminSessionCookie,
} = require('./adminCookies');

function getAdminSecret() {
  return String(process.env.ADMIN_SECRET || '').trim();
}

function getAdminLoginName() {
  return String(process.env.ADMIN_LOGIN_NAME || 'מנהל').trim() || 'מנהל';
}

function isAdminConfigured() {
  return Boolean(getAdminSecret());
}

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
  const secret = getAdminSecret();
  if (!secret) return '';
  return b64url(
    crypto.createHmac('sha256', secret).update(payloadPart).digest()
  );
}

function createAdminToken() {
  const payload = {
    v: 1,
    role: 'admin',
    jti: crypto.randomBytes(16).toString('hex'),
    iat: Math.floor(Date.now() / 1000),
  };
  const payloadPart = b64url(JSON.stringify(payload));
  return `${payloadPart}.${sign(payloadPart)}`;
}

function verifyAdminToken(token) {
  if (!getAdminSecret()) return null;
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadPart, sig] = parts;
  const expected = sign(payloadPart);
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  try {
    const payload = JSON.parse(fromB64url(payloadPart).toString('utf8'));
    if (payload?.role !== 'admin' || payload?.v !== 1) return null;
    return payload;
  } catch {
    return null;
  }
}

function credentialsMatchAdmin({ storeName, password }) {
  const secret = getAdminSecret();
  if (!secret) return false;
  const name = String(storeName || '').trim();
  const pass = String(password || '');
  return name === getAdminLoginName() && pass === secret;
}

function attachAdminSession(req, res, next) {
  try {
    const token = readAdminSessionToken(req);
    const payload = verifyAdminToken(token);
    req.admin = payload ? { role: 'admin' } : null;
    req.adminSessionToken = payload ? token : null;
    next();
  } catch (err) {
    next(err);
  }
}

function requireAdminSession(req, res, next) {
  attachAdminSession(req, res, (err) => {
    if (err) return next(err);
    if (!req.admin) {
      const e = new Error('נדרשת התחברות מנהל מערכת.');
      e.status = 401;
      e.code = 'ADMIN_SESSION_MISSING';
      return next(e);
    }
    next();
  });
}

function issueAdminCookie(res, req) {
  const token = createAdminToken();
  setAdminSessionCookie(res, token, req);
  return token;
}

function clearAdminCookie(res, req) {
  clearAdminSessionCookie(res, req);
}

module.exports = {
  getAdminSecret,
  getAdminLoginName,
  isAdminConfigured,
  credentialsMatchAdmin,
  attachAdminSession,
  requireAdminSession,
  issueAdminCookie,
  clearAdminCookie,
  verifyAdminToken,
};
