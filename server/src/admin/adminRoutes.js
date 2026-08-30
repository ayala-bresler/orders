'use strict';

/**
 * System admin APIs: browse all stores / all customers.
 */

const express = require('express');
const { query } = require('../db');
const customerService = require('../services/customerService');
const { withSession } = require('../services/sessionService');
const {
  credentialsMatchAdmin,
  isAdminConfigured,
  getAdminLoginName,
  attachAdminSession,
  requireAdminSession,
  issueAdminCookie,
  clearAdminCookie,
} = require('./adminAuth');

const router = express.Router();

router.get('/me', attachAdminSession, (req, res) => {
  if (!req.admin) {
    return res.status(401).json({
      authenticated: false,
      configured: isAdminConfigured(),
      loginName: getAdminLoginName(),
    });
  }
  res.json({
    authenticated: true,
    admin: { role: 'admin', displayName: 'מנהל מערכת' },
    loginName: getAdminLoginName(),
  });
});

router.post('/login', (req, res, next) => {
  try {
    if (!isAdminConfigured()) {
      const e = new Error(
        'כניסת מנהל אינה מוגדרת. הוסיפו ADMIN_SECRET בקובץ server/.env'
      );
      e.status = 503;
      throw e;
    }
    if (!credentialsMatchAdmin(req.body || {})) {
      const e = new Error('שם משתמש או סיסמת מנהל שגויים.');
      e.status = 401;
      throw e;
    }
    issueAdminCookie(res, req);
    res.json({
      ok: true,
      admin: { role: 'admin', displayName: 'מנהל מערכת' },
    });
  } catch (err) {
    next(err);
  }
});

router.post('/logout', (req, res) => {
  clearAdminCookie(res, req);
  res.json({ ok: true });
});

router.get('/stores', requireAdminSession, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT s.store_id,
              s.store_name,
              s.store_email,
              s.percentage,
              (s.password_hash IS NOT NULL) AS activated,
              COUNT(c.customer_id)::int AS customer_count
         FROM stores s
         LEFT JOIN customers c ON c.store_id = s.store_id
        GROUP BY s.store_id
        ORDER BY s.store_name ASC`
    );
    res.json({
      stores: rows.map((r) => ({
        storeId: r.store_id,
        storeName: r.store_name,
        storeEmail: r.store_email || null,
        percentage: r.percentage != null ? Number(r.percentage) : null,
        activated: Boolean(r.activated),
        customerCount: r.customer_count || 0,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/stores', requireAdminSession, async (req, res, next) => {
  try {
    const storeName = String(req.body?.storeName || req.body?.store_name || '').trim();
    const activationCode = String(
      req.body?.activationCode ||
        req.body?.activation_code ||
        req.body?.temporaryPassword ||
        req.body?.password ||
        ''
    ).trim();
    const percentageRaw = req.body?.percentage;
    const percentage =
      percentageRaw === undefined || percentageRaw === '' || percentageRaw === null
        ? 0
        : Number(percentageRaw);

    if (!storeName) {
      const e = new Error('נא להזין שם חנות.');
      e.status = 400;
      throw e;
    }
    if (!activationCode) {
      const e = new Error('נא להזין סיסמה זמנית לחנות.');
      e.status = 400;
      throw e;
    }
    if (activationCode.length < 4) {
      const e = new Error('הסיסמה הזמנית קצרה מדי (לפחות 4 תווים).');
      e.status = 400;
      throw e;
    }
    if (!Number.isFinite(percentage)) {
      const e = new Error('אחוז הנחה אינו תקין.');
      e.status = 400;
      throw e;
    }

    await query(
      `SELECT setval(
         pg_get_serial_sequence('stores', 'store_id'),
         COALESCE((SELECT MAX(store_id) FROM stores), 1),
         true
       )`
    );

    const { rows } = await query(
      `INSERT INTO stores (store_name, activation_code, percentage)
       VALUES ($1, $2, $3)
       RETURNING store_id, store_name, activation_code, percentage,
                 (password_hash IS NOT NULL) AS activated`,
      [storeName, activationCode, percentage]
    );
    const r = rows[0];
    res.status(201).json({
      ok: true,
      store: {
        storeId: r.store_id,
        storeName: r.store_name,
        storeEmail: null,
        percentage: r.percentage != null ? Number(r.percentage) : null,
        activated: Boolean(r.activated),
        customerCount: 0,
      },
    });
  } catch (err) {
    if (err && err.code === '23505') {
      const e = new Error(
        String(err.constraint || '').includes('activation')
          ? 'סיסמה זמנית זו כבר בשימוש בחנות אחרת. בחרו סיסמה אחרת.'
          : 'שם החנות כבר קיים במערכת.'
      );
      e.status = 409;
      return next(e);
    }
    next(err);
  }
});

router.get('/customers', requireAdminSession, async (req, res, next) => {
  try {
    const storeIdRaw = req.query.storeId ?? req.query.store_id;
    const storeId =
      storeIdRaw === undefined || storeIdRaw === '' || storeIdRaw === 'all'
        ? null
        : Number(storeIdRaw);

    const params = [];
    let where = '';
    if (storeId != null && Number.isFinite(storeId)) {
      params.push(storeId);
      where = `WHERE c.store_id = $1`;
    }

    const { rows } = await query(
      `SELECT c.customer_id,
              c.full_name,
              c.phone,
              c.email,
              c.address,
              c.store_id,
              c.created_at,
              s.store_name,
              o.order_id,
              COALESCE(
                NULLIF(BTRIM(m.model_name), ''),
                CASE WHEN oi.has_crown THEN NULLIF(BTRIM(cm.model_name), '') END,
                CASE WHEN oi.has_crown_rimmonim THEN NULLIF(BTRIM(crm.model_name), '') END,
                CASE WHEN oi.has_rimmonim THEN NULLIF(BTRIM(rm.model_name), '') END,
                CASE WHEN oi.has_breastplate THEN NULLIF(BTRIM(bm.model_name), '') END,
                CASE WHEN oi.has_pointer THEN NULLIF(BTRIM(pm.model_name), '') END
              ) AS model_name,
              oi.plate_diameter
         FROM customers c
         LEFT JOIN stores s ON s.store_id = c.store_id
         LEFT JOIN LATERAL (
           SELECT ord.order_id
             FROM orders ord
            WHERE ord.customer_id = c.customer_id
            ORDER BY ord.order_date DESC, ord.order_id DESC
            LIMIT 1
         ) o ON TRUE
         LEFT JOIN LATERAL (
           SELECT oi.model,
                  oi.plate_diameter,
                  oi.has_crown, oi.crown_model,
                  oi.has_crown_rimmonim, oi.crown_rimmonim_model,
                  oi.has_rimmonim, oi.rimmonim_model,
                  oi.has_breastplate, oi.breastplate_model,
                  oi.has_pointer, oi.pointer_model
             FROM order_items oi
            WHERE oi.order_id = o.order_id
            ORDER BY oi.item_id
            LIMIT 1
         ) oi ON TRUE
         LEFT JOIN models m ON m.model_code = oi.model
         LEFT JOIN models cm ON cm.model_code = oi.crown_model
         LEFT JOIN models crm ON crm.model_code = oi.crown_rimmonim_model
         LEFT JOIN models rm ON rm.model_code = oi.rimmonim_model
         LEFT JOIN models bm ON bm.model_code = oi.breastplate_model
         LEFT JOIN models pm ON pm.model_code = oi.pointer_model
         ${where}
        ORDER BY
          CASE
            WHEN c.phone ~ '^[0-9]+$' THEN LPAD(c.phone, 32, '0')
            ELSE c.phone
          END ASC,
          c.customer_id ASC`,
      params
    );
    res.json({
      customers: rows.map((r) => ({
        customer_id: r.customer_id,
        full_name: r.full_name,
        phone: r.phone,
        email: r.email,
        address: r.address,
        store_id: r.store_id,
        store_name: r.store_name || null,
        created_at: r.created_at,
        order_id: r.order_id || null,
        model_name: r.model_name || null,
        plate_diameter: r.plate_diameter != null ? Number(r.plate_diameter) : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/select-customer', requireAdminSession, async (req, res, next) => {
  try {
    const customerId = Number(req.body?.customerId || req.body?.customer_id);
    if (!Number.isFinite(customerId)) {
      const e = new Error('חסר מזהה לקוח.');
      e.status = 400;
      throw e;
    }
    const { rows } = await query(
      `SELECT customer_id, full_name, phone, email, address, store_id
         FROM customers
        WHERE customer_id = $1`,
      [customerId]
    );
    if (!rows[0]) {
      const e = new Error('הלקוח לא נמצא.');
      e.status = 404;
      throw e;
    }
    const result = await customerService.identify({
      phone: rows[0].phone,
      email: rows[0].email || undefined,
    });
    res.json(withSession(result));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
module.exports.credentialsMatchAdmin = credentialsMatchAdmin;
module.exports.isAdminConfigured = isAdminConfigured;
module.exports.getAdminLoginName = getAdminLoginName;
