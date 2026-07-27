'use strict';

/**
 * Store activation, login, email, and "my customers" APIs.
 * Mounted at /api/stores — separate from existing customer session auth.
 */

const express = require('express');
const customerService = require('../services/customerService');
const { withSession } = require('../services/sessionService');
const {
  resolveStoreEntry,
  activateStore,
  loginStore,
  createStoreSession,
  revokeStoreSession,
  updateStoreEmail,
  publicStoreRow,
  listStoreCustomers,
  selectStoreCustomer,
} = require('./storeAuthService');
const {
  attachStoreSession,
  requireStoreSession,
  issueStoreCookie,
  clearStoreCookie,
} = require('./storeSessionMiddleware');
const { readStoreSessionToken } = require('./storeCookies');

const router = express.Router();
/** Store session APIs */

router.get('/me', attachStoreSession, (req, res) => {
  if (!req.store) {
    return res.status(401).json({
      error: 'לא מחוברים כחנות.',
      code: 'STORE_SESSION_MISSING',
      authenticated: false,
    });
  }
  res.json({ authenticated: true, store: req.store });
});

/**
 * Unified store entry: name + password.
 * Email is optional here — collected once after login when missing.
 */
router.post('/entry', async (req, res, next) => {
  try {
    const body = req.body || {};
    const result = await resolveStoreEntry(body);
    if (result.action === 'setup_password') {
      return res.json({
        ok: true,
        needsPasswordSetup: true,
        storeName: result.store.store_name,
        storeId: result.store.store_id,
        storeEmail: result.store.store_email || null,
      });
    }

    let store = result.store;
    const email = String(body.storeEmail || body.store_email || '').trim();
    if (email) {
      store = await updateStoreEmail(store.store_id, { storeEmail: email });
    }

    const token = await createStoreSession(store.store_id);
    issueStoreCookie(res, token, req);
    const pub = publicStoreRow(store);
    res.json({
      ok: true,
      needsPasswordSetup: false,
      needsEmailSetup: Boolean(pub.needsEmailSetup),
      store: pub,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/activate', async (req, res, next) => {
  try {
    const store = await activateStore(req.body || {});
    const token = await createStoreSession(store.store_id);
    issueStoreCookie(res, token, req);
    const pub = publicStoreRow(store);
    res.json({
      ok: true,
      needsEmailSetup: Boolean(pub.needsEmailSetup),
      store: pub,
    });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const body = req.body || {};
    let store = await loginStore(body);
    const email = String(body.storeEmail || body.store_email || '').trim();
    if (email) {
      store = await updateStoreEmail(store.store_id, { storeEmail: email });
    }
    const token = await createStoreSession(store.store_id);
    issueStoreCookie(res, token, req);
    res.json({
      ok: true,
      store: publicStoreRow(store),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    const token = readStoreSessionToken(req);
    await revokeStoreSession(token);
    clearStoreCookie(res, req);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.put('/email', requireStoreSession, async (req, res, next) => {
  try {
    const updated = await updateStoreEmail(req.store.storeId, req.body || {});
    res.json({ ok: true, store: publicStoreRow(updated) });
  } catch (err) {
    next(err);
  }
});

/** Legacy alias — email only (clears SMTP fields). */
router.put('/smtp', requireStoreSession, async (req, res, next) => {
  try {
    const updated = await updateStoreEmail(req.store.storeId, req.body || {});
    res.json({ ok: true, store: publicStoreRow(updated) });
  } catch (err) {
    next(err);
  }
});

router.get('/customers', requireStoreSession, async (req, res, next) => {
  try {
    const customers = await listStoreCustomers(req.store.storeId);
    res.json({ customers });
  } catch (err) {
    next(err);
  }
});

router.post('/select-customer', requireStoreSession, async (req, res, next) => {
  try {
    const customerId = Number(req.body?.customerId || req.body?.customer_id);
    if (!Number.isFinite(customerId)) {
      const e = new Error('חסר מזהה לקוח.');
      e.status = 400;
      throw e;
    }
    const customer = await selectStoreCustomer(req.store.storeId, customerId);
    const result = await customerService.identify({
      phone: customer.phone,
      email: customer.email || undefined,
    });
    res.json(withSession(result));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
