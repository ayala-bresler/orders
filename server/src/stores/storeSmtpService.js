'use strict';

/**
 * Send order verses-print PDF to the store mailbox via system SMTP.
 * Stores only need store_email — no per-store HOST/PORT/password.
 * Admin DXF mail is separate and does not use this path.
 */

const { findStoreById } = require('./storeAuthService');
const { sendPdfToAddress } = require('../services/emailService');

async function sendStoreOrderPdfCopy({ storeId, pdfFilename, pdfContent, meta }) {
  if (!storeId) {
    return { skipped: true, reason: 'no_store' };
  }
  if (!pdfContent) {
    return { skipped: true, reason: 'no_pdf' };
  }

  const store = await findStoreById(storeId);
  if (!store) {
    return { skipped: true, reason: 'store_missing' };
  }

  const storeEmail = String(store.store_email || '').trim();
  if (!storeEmail) {
    return {
      skipped: true,
      reason: 'smtp_incomplete',
      error: 'לא הוגדר אימייל חנות בהזדהות.',
    };
  }

  try {
    const result = await sendPdfToAddress({
      to: storeEmail,
      pdfFilename,
      pdfContent,
      meta,
    });
    return {
      skipped: false,
      sentTo: result.sentTo,
      via: result.via,
    };
  } catch (err) {
    console.warn('[store-email] send failed:', err.message);
    return {
      skipped: true,
      reason: 'send_failed',
      error: err.message,
    };
  }
}

module.exports = {
  sendStoreOrderPdfCopy,
};
