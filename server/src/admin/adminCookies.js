'use strict';

/**
 * HTTP-Only cookie for system admin session.
 */

const COOKIE_NAME = process.env.ADMIN_SESSION_COOKIE || 'admin_session';
const MAX_AGE_SEC = Number(
  process.env.ADMIN_SESSION_MAX_AGE_SEC || 30 * 24 * 60 * 60
);

function parseCookies(header) {
  const out = {};
  if (!header) return out;
  String(header)
    .split(';')
    .forEach((part) => {
      const idx = part.indexOf('=');
      if (idx < 0) return;
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      if (key) out[key] = decodeURIComponent(val);
    });
  return out;
}

function readAdminSessionToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[COOKIE_NAME] || '';
}

function shouldUseSecureCookie(req) {
  if (process.env.STORE_COOKIE_SECURE === 'true') return true;
  if (process.env.STORE_COOKIE_SECURE === 'false') return false;
  if (req.secure) return true;
  const proto = String(req.headers['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim();
  if (proto === 'https') return true;
  return process.env.NODE_ENV === 'production';
}

function setAdminSessionCookie(res, token, req) {
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${MAX_AGE_SEC}`,
  ];
  if (shouldUseSecureCookie(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

function clearAdminSessionCookie(res, req) {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
  ];
  if (shouldUseSecureCookie(req)) parts.push('Secure');
  res.append('Set-Cookie', parts.join('; '));
}

module.exports = {
  COOKIE_NAME,
  readAdminSessionToken,
  setAdminSessionCookie,
  clearAdminSessionCookie,
};
