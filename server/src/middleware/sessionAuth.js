'use strict';

const {
  verifySessionToken,
  createSessionToken,
  revokeSessionToken,
} = require('../services/sessionService');

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7).trim();
  const alt = req.headers['x-session-token'];
  if (alt) return String(alt).trim();
  // Allow query token for <img src> / font loads that cannot set headers
  if (req.query?.access_token) return String(req.query.access_token).trim();
  return '';
}

/**
 * Require a valid (non-expired) session token.
 * On success sets req.session = payload and optionally issues sliding refresh hints.
 */
function requireSession(req, res, next) {
  try {
    const token = extractToken(req);
    const payload = verifySessionToken(token);
    req.session = payload;
    req.sessionToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

/** POST /api/session/refresh — extend expiry while still valid. */
function refreshHandler(req, res, next) {
  try {
    const token = extractToken(req);
    const payload = verifySessionToken(token);
    const nextSession = createSessionToken({
      customerId: payload.cid,
      orderId: payload.oid,
    });
    res.json({
      sessionToken: nextSession.token,
      sessionExpiresAt: nextSession.expiresAt,
      sessionExpiresInMs: nextSession.expiresInMs,
      sessionMaxAgeMs: nextSession.maxAgeMs,
    });
  } catch (err) {
    next(err);
  }
}

/** POST /api/session/logout — revoke current token. */
function logoutHandler(req, res, next) {
  try {
    const token = extractToken(req);
    if (token) revokeSessionToken(token);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  extractToken,
  requireSession,
  refreshHandler,
  logoutHandler,
};
