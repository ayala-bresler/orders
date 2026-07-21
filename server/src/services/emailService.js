'use strict';

const nodemailer = require('nodemailer');

function getConfig() {
  const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
  return {
    host: (process.env.SMTP_HOST || '').trim(),
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: (process.env.SMTP_USER || '').trim(),
    pass,
    from: (process.env.SMTP_FROM || process.env.SMTP_USER || '').trim(),
    recipient: (process.env.DXF_RECIPIENT_EMAIL || '').trim(),
  };
}

function isGmail(cfg) {
  return cfg.host.includes('gmail.com') || cfg.user.endsWith('@gmail.com');
}

function createTransport(cfg) {
  if (!cfg.host || !cfg.user || !cfg.pass) {
    const err = new Error(
      'הגדרות SMTP חסרות. הוסיפו SMTP_HOST, SMTP_USER, SMTP_PASS בקובץ server/.env'
    );
    err.status = 503;
    throw err;
  }

  /** Force IPv4 — avoids IPv6/ENETUNREACH issues on some hosts (Railway, etc.). */
  const ipv4Only = { family: 4 };

  if (isGmail(cfg)) {
    return nodemailer.createTransport({
      service: 'gmail',
      ...ipv4Only,
      auth: { user: cfg.user, pass: cfg.pass },
    });
  }

  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    requireTLS: !cfg.secure,
    ...ipv4Only,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

function authError(err) {
  if (err && (err.code === 'EAUTH' || String(err.message).includes('535'))) {
    const e = new Error(
      'Gmail דחה את ההתחברות. ודאו App Password חדש (16 תווים) ואז הפעילו מחדש את השרת. ' +
        'https://support.google.com/mail/?p=BadCredentials'
    );
    e.status = 503;
    return e;
  }
  return err;
}

function buildEmailText(meta = {}) {
  const lines = [];
  if (meta.modelName) lines.push(`דגם: ${meta.modelName}`);
  if (meta.accessoryLine) lines.push(meta.accessoryLine);
  if (meta.orderId != null) lines.push(`הזמנה: ${meta.orderId}`);
  if (meta.customerName) lines.push(`לקוח: ${meta.customerName}`);
  return lines.join('\n');
}

function buildEmailSubject(meta = {}) {
  const parts = [];
  if (meta.orderId != null) parts.push(`הזמנה ${meta.orderId}`);
  if (meta.modelName) parts.push(meta.modelName);
  return parts.length ? parts.join(' · ') : 'ייצוא הזמנה';
}

/**
 * Send quarter DXF exports (and optional PDF) to the configured mailbox.
 */
async function sendDxfEmail(opts) {
  const cfg = getConfig();
  if (!cfg.recipient) {
    const err = new Error(
      'לא הוגדר כתובת מייל לקבלת DXF. הוסיפו DXF_RECIPIENT_EMAIL בקובץ server/.env'
    );
    err.status = 503;
    throw err;
  }

  const transport = createTransport(cfg);
  const {
    quarterFiles = [],
    pdfFilename,
    pdfContent,
    meta = {},
  } = opts;

  const attachments = quarterFiles.map((file) => ({
    filename: file.filename,
    content: file.content,
    contentType: 'application/dxf',
  }));

  if (pdfContent && pdfFilename) {
    attachments.push({
      filename: pdfFilename,
      content: Buffer.isBuffer(pdfContent) ? pdfContent : Buffer.from(pdfContent),
      contentType: 'application/pdf',
    });
  }

  try {
    await transport.sendMail({
      from: cfg.from,
      to: cfg.recipient,
      subject: buildEmailSubject(meta),
      text: buildEmailText(meta),
      attachments,
    });
  } catch (err) {
    const wrapped = authError(err);
    if (!wrapped.status) wrapped.status = 503;
    if (wrapped === err) {
      const e = new Error(`שליחת מייל נכשלה: ${err.message || 'שגיאת SMTP'}`);
      e.status = 503;
      throw e;
    }
    throw wrapped;
  }

  return { sentTo: cfg.recipient, attachmentCount: attachments.length };
}

async function verifySmtp() {
  const cfg = getConfig();
  const transport = createTransport(cfg);
  await transport.verify();
  return { ok: true, user: cfg.user };
}

module.exports = {
  sendDxfEmail,
  verifySmtp,
  getConfig,
  buildEmailText,
  buildEmailSubject,
};
