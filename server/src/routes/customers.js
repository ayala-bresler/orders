'use strict';

/**
 * Customer identification + session issue.
 *  POST /api/customers/identify
 *  POST /api/customers/identify/confirm
 */

const express = require('express');
const customerService = require('../services/customerService');
const { withSession } = require('../services/sessionService');

const router = express.Router();

router.post('/identify', async (req, res, next) => {
  try {
    const result = await customerService.identify(req.body || {});
    res.json(withSession(result));
  } catch (err) {
    next(err);
  }
});

router.post('/identify/confirm', async (req, res, next) => {
  try {
    const result = await customerService.confirmNewCustomer(req.body || {});
    res.json(withSession(result));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
