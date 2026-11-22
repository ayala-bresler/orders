'use strict';

/**
 * Happy note when a line (or an empty order) becomes finished or sent.
 * Sent to the system admin and to the store mailbox.
 * Missing store session or a missing store address is silent.
 */

const { findStoreById } = require('../stores/storeAuthService');
const { getConfig, sendTextEmail } = require('./emailService');
const { workflowStatusSentence } = require('../utils/orderStatus');

async function sendWorkflowStatusNotice({ status, phone, customerName, storeId }) {
  const sentence = workflowStatusSentence({ phone, customerName, status });
  const warnings = [];

  const cfg = getConfig();
  const adminTo = String(cfg.recipient || '').trim();
  const storeTask = (async () => {
    if (!storeId) return;
    const store = await findStoreById(storeId);
    const storeEmail = String(store?.store_email || '').trim();
    if (!storeEmail) return;
    try {
      await sendTextEmail({ to: storeEmail, subject: sentence, text: sentence });
    } catch (err) {
      warnings.push(`מייל לחנות לא נשלח: ${err.message}`);
    }
  })();

  const adminTask = (async () => {
    if (!adminTo) {
      warnings.push('מייל למנהל לא נשלח: לא הוגדרה כתובת מייל למנהל המערכת.');
      return;
    }
    try {
      await sendTextEmail({ to: adminTo, subject: sentence, text: sentence });
    } catch (err) {
      warnings.push(`מייל למנהל לא נשלח: ${err.message}`);
    }
  })();

  await Promise.all([adminTask, storeTask]);
  return warnings;
}

module.exports = {
  sendWorkflowStatusNotice,
};
