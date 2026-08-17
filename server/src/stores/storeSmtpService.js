'use strict';

/**
 * Send order PDF(s) to the store mailbox via system SMTP.
 * Typical cases:
 *   - With verses: order-form PDF + verses-print PDF
 *   - Without עץ חיים / no DXF path: order-form PDF only
 * Stores only need store_email — no per-store HOST/PORT/password.
 * Admin mail is separate and does not use this path.
 */

const { findStoreById } = require('./storeAuthService');
const { sendPdfToAddress } = require('../services/emailService');

/**
 * @param {{
 *   storeId: number|string|null,
 *   pdfFiles?: { filename: string, content: Buffer|Uint8Array|string }[],
 *   pdfFilename?: string,
 *   pdfContent?: Buffer|Uint8Array|string|null,
 *   meta?: object,
 * }} opts
 */
async function sendStoreOrderPdfCopy({
  storeId,
  pdfFiles,
  pdfFilename,
  pdfContent,
  meta,
}) {
  if (!storeId) {
    return { skipped: true, reason: 'no_store' };
  }

  const files = Array.isArray(pdfFiles)
    ? pdfFiles.filter((f) => f && f.content)
    : pdfContent
      ? [{ filename: pdfFilename, content: pdfContent }]
      : [];

  if (!files.length) {
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
      pdfFiles: files,
      meta,
    });
    return {
      skipped: false,
      sentTo: result.sentTo,
      via: result.via,
      attachmentCount: result.attachmentCount || files.length,
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
