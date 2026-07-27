'use strict';

const {
  readStoreSessionToken,
  setStoreSessionCookie,
  clearStoreSessionCookie,
} = require('./storeCookies');
const {
  resolveStoreSession,
  publicStoreRow,
} = require('./storeAuthService');

/**
 * Optional: attach req.store when a valid store session cookie exists.
 */
async function attachStoreSession(req, res, next) {
  try {
    const token = readStoreSessionToken(req);
    if (!token) {
      req.store = null;
      req.storeSessionToken = null;
      return next();
    }
    const row = await resolveStoreSession(token);
    if (!row) {
      req.store = null;
      req.storeSessionToken = null;
      return next();
    }
    req.store = publicStoreRow(row);
    req.storeRow = row;
    req.storeSessionToken = token;
    next();
  } catch (err) {
    next(err);
  }
}

/** Require an authenticated store cookie session. */
async function requireStoreSession(req, res, next) {
  try {
    await new Promise((resolve, reject) => {
      attachStoreSession(req, res, (err) => (err ? reject(err) : resolve()));
    });
    if (!req.store?.storeId) {
      const e = new Error('נדרשת התחברות חנות.');
      e.status = 401;
      e.code = 'STORE_SESSION_MISSING';
      throw e;
    }
    next();
  } catch (err) {
    next(err);
  }
}

function issueStoreCookie(res, token, req) {
  setStoreSessionCookie(res, token, req);
}

function clearStoreCookie(res, req) {
  clearStoreSessionCookie(res, req);
}

module.exports = {
  attachStoreSession,
  requireStoreSession,
  issueStoreCookie,
  clearStoreCookie,
};
