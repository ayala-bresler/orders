'use strict';

/**
 * Email delivery for DXF/PDF exports via SMTP (Nodemailer).
 * Optional fallback: RESEND_API_KEY (HTTPS) when SMTP is not configured.
 *
 * Note: Railway Free/Hobby may block outbound SMTP (25/465/587).
 * @see https://docs.railway.com/networking/outbound-networking
 */

const dns = require('dns');
const net = require('net');
const { promisify } = require('util');
const nodemailer = require('nodemailer');

const resolve4 = promisify(dns.resolve4);

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  /* older Node */
}

function getConfig() {
  const pass = (process.env.SMTP_PASS || '').replace(/\s+/g, '');
  return {
    host: (process.env.SMTP_HOST || '').trim(),
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === 'true',
    user: (process.env.SMTP_USER || '').trim(),
    pass,
    from: (
      process.env.SMTP_FROM ||
      process.env.RESEND_FROM ||
      process.env.SMTP_USER ||
      ''
    ).trim(),
    recipient: (process.env.DXF_RECIPIENT_EMAIL || '').trim(),
    resendApiKey: (process.env.RESEND_API_KEY || '').trim(),
  };
}

function hasSmtp(cfg) {
  return Boolean(cfg.host && cfg.user && cfg.pass);
}

function isGmail(cfg) {
  return cfg.host.includes('gmail.com') || cfg.user.endsWith('@gmail.com');
}

async function resolveSmtpHost(hostname) {
  if (!hostname) {
    const err = new Error('SMTP_HOST חסר.');
    err.status = 503;
    throw err;
  }
  if (net.isIP(hostname) === 4) {
    return { connectHost: hostname, servername: undefined };
  }
  if (net.isIP(hostname) === 6) {
    const err = new Error('SMTP_HOST הוא IPv6 — יש להשתמש ב-hostname או בכתובת IPv4.');
    err.status = 503;
    throw err;
  }
  try {
    const addresses = await resolve4(hostname);
    if (!addresses.length) {
      const err = new Error(`לא נמצאה כתובת IPv4 עבור ${hostname}`);
      err.status = 503;
      throw err;
    }
    return { connectHost: addresses[0], servername: hostname };
  } catch (err) {
    if (err.status) throw err;
    const e = new Error(`רזולוציית IPv4 נכשלה עבור ${hostname}: ${err.message}`);
    e.status = 503;
    throw e;
  }
}

async function createTransport(cfg) {
  if (!hasSmtp(cfg)) {
    const err = new Error(
      'הגדרות SMTP חסרות. הגדירו SMTP_HOST, SMTP_USER, SMTP_PASS ' +
        '(או RESEND_API_KEY + RESEND_FROM כחלופה).'
    );
    err.status = 503;
    throw err;
  }

  const hostname =
    isGmail(cfg) && !/gmail\.com$/i.test(cfg.host) ? 'smtp.gmail.com' : cfg.host;
  const { connectHost, servername } = await resolveSmtpHost(hostname);

  const port = Number(cfg.port) || 587;
  const secure = cfg.secure || port === 465;

  return nodemailer.createTransport({
    host: connectHost,
    port,
    secure,
    requireTLS: !secure,
    tls: servername ? { servername } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}

function toBase64(content) {
  if (Buffer.isBuffer(content)) return content.toString('base64');
  return Buffer.from(content).toString('base64');
}

/**
 * Send via Resend HTTPS API (optional fallback).
 * https://resend.com/docs/api-reference/emails/send-email
 */
async function sendViaResend(cfg, { from, to, subject, text, attachments }) {
  if (!cfg.resendApiKey) {
    const err = new Error('RESEND_API_KEY חסר.');
    err.status = 503;
    throw err;
  }
  if (!from) {
    const err = new Error(
      'חסרה כתובת שולח. הגדירו RESEND_FROM או SMTP_FROM (דומיין מאומת ב-Resend, ' +
        'או לבדיקה: onboarding@resend.dev).'
    );
    err.status = 503;
    throw err;
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
      attachments: (attachments || []).map((a) => ({
        filename: a.filename,
        content: toBase64(a.content),
      })),
    }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = data.message || data.error || `Resend HTTP ${res.status}`;
    const err = new Error(`שליחת מייל דרך Resend נכשלה: ${detail}`);
    err.status = 503;
    throw err;
  }
  return data;
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

function smtpTimeoutError(err) {
  const msg = String(err && err.message ? err.message : err);
  const code = err && err.code;
  const isTimeout =
    code === 'ETIMEDOUT' ||
    code === 'ESOCKET' ||
    /timeout|timed out|connection timeout/i.test(msg);
  if (!isTimeout) return null;

  const e = new Error(
    'שליחת מייל נכשלה: Connection timeout. ' +
      'בדקו SMTP_HOST/PORT והרשת. ב-Railway Free/Hobby פורטי SMTP לעיתים חסומים — ' +
      'שדרוג ל-Pro או שימוש ב-RESEND_API_KEY. ' +
      'https://docs.railway.com/networking/outbound-networking'
  );
  e.status = 503;
  return e;
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

function buildAttachments(opts) {
  const {
    quarterFiles = [],
    pdfFilename,
    pdfContent,
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
  return attachments;
}

/**
 * Send quarter DXF exports (and optional PDF) to the configured mailbox.
 * Prefers SMTP when configured; otherwise Resend if RESEND_API_KEY is set.
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

  const attachments = buildAttachments(opts);
  const mail = {
    from: cfg.from,
    to: cfg.recipient,
    subject: buildEmailSubject(opts.meta || {}),
    text: buildEmailText(opts.meta || {}),
    attachments,
  };

  if (hasSmtp(cfg)) {
    try {
      const transport = await createTransport(cfg);
      await transport.sendMail(mail);
    } catch (err) {
      const timeoutErr = smtpTimeoutError(err);
      if (timeoutErr) throw timeoutErr;

      const wrapped = authError(err);
      if (!wrapped.status) wrapped.status = 503;
      if (wrapped === err) {
        const e = new Error(`שליחת מייל נכשלה: ${err.message || 'שגיאת SMTP'}`);
        e.status = 503;
        throw e;
      }
      throw wrapped;
    }
    return { sentTo: cfg.recipient, attachmentCount: attachments.length, via: 'smtp' };
  }

  if (cfg.resendApiKey) {
    await sendViaResend(cfg, mail);
    return { sentTo: cfg.recipient, attachmentCount: attachments.length, via: 'resend' };
  }

  const err = new Error(
    'הגדרות שליחת מייל חסרות. הגדירו SMTP_HOST, SMTP_USER, SMTP_PASS ' +
      '(או RESEND_API_KEY + RESEND_FROM).'
  );
  err.status = 503;
  throw err;
}

async function verifySmtp() {
  const cfg = getConfig();
  if (hasSmtp(cfg)) {
    const transport = await createTransport(cfg);
    await transport.verify();
    return { ok: true, user: cfg.user, via: 'smtp' };
  }
  if (cfg.resendApiKey) {
    return { ok: true, via: 'resend' };
  }
  const err = new Error(
    'הגדרות שליחת מייל חסרות. הגדירו SMTP_HOST, SMTP_USER, SMTP_PASS.'
  );
  err.status = 503;
  throw err;
}

module.exports = {
  sendDxfEmail,
  verifySmtp,
  getConfig,
  buildEmailText,
  buildEmailSubject,
};
