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
async function sendViaResend(cfg, { from, to, subject, text, html, attachments }) {
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

  const payload = {
    from,
    to: [to],
    subject,
    text,
    attachments: (attachments || []).map((a) => ({
      filename: a.filename,
      content: toBase64(a.content),
    })),
  };
  if (html) payload.html = html;

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.resendApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
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

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatPlateSize(meta = {}) {
  const raw = meta.plateSize ?? meta.plateDiameter ?? meta.sizeLabel;
  if (raw == null || raw === '') return '';
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return String(n);
  return String(raw).trim();
}

/** Always at least 5 regular spaces between name↔phone and model↔מידה. */
const EMAIL_FIELD_MIN_GAP = 5;
const EMAIL_NBSP_GAP = '&nbsp;'.repeat(EMAIL_FIELD_MIN_GAP);

/**
 * Pad two label/value pairs so the trailing values end on the same column
 * (at least EMAIL_FIELD_MIN_GAP regular spaces in the middle).
 */
function alignTrailingFields(left1, right1, left2, right2, minGap = EMAIL_FIELD_MIN_GAP) {
  const l1 = String(left1 || '');
  const r1 = String(right1 || '');
  const l2 = String(left2 || '');
  const r2 = String(right2 || '');
  const gapFloor = Math.max(5, minGap);
  const total = Math.max(
    l1.length + gapFloor + r1.length,
    l2.length + gapFloor + r2.length
  );
  const gap1 = Math.max(gapFloor, total - l1.length - r1.length);
  const gap2 = Math.max(gapFloor, total - l2.length - r2.length);
  return [
    `${l1}${' '.repeat(gap1)}${r1}`,
    `${l2}${' '.repeat(gap2)}${r2}`,
  ];
}

/** Keep phone / size digits in logical LTR order inside an RTL line. */
function ltrIsolate(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  return `\u2066${s}\u2069`;
}

/** Force a plain-text line to render right-to-left in email clients. */
function rtlPlainLine(line) {
  const s = String(line || '');
  if (!s) return '\u200F';
  return `\u202B${s}\u202C`;
}

function buildEmailDetailLines(meta = {}) {
  const name = String(meta.customerName || '').trim();
  const phone = String(meta.customerPhone || '').trim();
  const model = String(meta.modelName || '').trim();
  const size = formatPlateSize(meta);
  const accessories = String(meta.accessoryLine || '').trim();
  const lines = [];

  lines.push('פרטי הזמנה:');

  const nameLeft = name ? `שם: ${name}` : phone ? 'שם:' : '';
  const nameRight = phone ? ltrIsolate(phone) : '';
  const modelLeft = model ? `דגם: ${model}` : size ? 'דגם:' : '';
  const modelRight = size ? `מידה: ${ltrIsolate(size)}` : '';

  if (nameLeft && nameRight && modelLeft && modelRight) {
    lines.push(...alignTrailingFields(nameLeft, nameRight, modelLeft, modelRight));
  } else {
    if (nameLeft || nameRight) {
      if (nameLeft && nameRight) {
        lines.push(
          `${nameLeft}${' '.repeat(EMAIL_FIELD_MIN_GAP)}${nameRight}`
        );
      } else {
        lines.push(nameLeft || `שם: ${nameRight}`);
      }
    }
    if (modelLeft || modelRight) {
      if (modelLeft && modelRight) {
        lines.push(
          `${modelLeft}${' '.repeat(EMAIL_FIELD_MIN_GAP)}${modelRight}`
        );
      } else {
        lines.push(modelLeft || modelRight);
      }
    }
  }

  if (accessories) lines.push(`אביזרים: ${accessories}`);
  return lines;
}

/** Plain-text body for order emails — RTL embedding on every line. */
function buildEmailText(meta = {}) {
  const lines = [];

  if (meta.isResend) {
    lines.push('הזמנה חוזרת ממערכת ההזמנות.');
  } else if (meta.kind === 'store-order-copy') {
    lines.push('עותק הזמנה לחנות — מצורפים קבצי PDF.');
  } else if (meta.kind === 'verses-print') {
    lines.push('דף פסוקים להזמנה — מצורף PDF.');
  } else {
    lines.push('התקבלה הזמנה חדשה ממערכת ההזמנות — מצורף דף ההזמנה (PDF).');
  }

  lines.push('');
  lines.push(...buildEmailDetailLines(meta));
  lines.push('');
  lines.push('נא לבדוק את הקבצים המצורפים.');
  return lines.map(rtlPlainLine).join('\n');
}

/**
 * HTML body — explicit RTL; trailing phone/size aligned in a compact table.
 */
function buildEmailHtml(meta = {}) {
  const intro = (() => {
    if (meta.isResend) return 'הזמנה חוזרת ממערכת ההזמנות.';
    if (meta.kind === 'store-order-copy') return 'עותק הזמנה לחנות — מצורפים קבצי PDF.';
    if (meta.kind === 'verses-print') return 'דף פסוקים להזמנה — מצורף PDF.';
    return 'התקבלה הזמנה חדשה ממערכת ההזמנות — מצורף דף ההזמנה (PDF).';
  })();

  const name = String(meta.customerName || '').trim();
  const phone = String(meta.customerPhone || '').trim();
  const model = String(meta.modelName || '').trim();
  const size = formatPlateSize(meta);
  const accessories = String(meta.accessoryLine || '').trim();

  const rows = [];
  if (name || phone) {
    rows.push(`<tr>
        <td style="padding:2px 0;text-align:right;vertical-align:baseline;white-space:nowrap;">${
          name ? `<strong>שם:</strong> ${escapeHtml(name)}` : '<strong>שם:</strong>'
        }</td>
        <td aria-hidden="true" style="padding:2px 0;width:5ch;white-space:pre;">${EMAIL_NBSP_GAP}</td>
        <td style="padding:2px 0;text-align:left;vertical-align:baseline;white-space:nowrap;" dir="ltr">${
          escapeHtml(phone)
        }</td>
      </tr>`);
  }
  if (model || size) {
    rows.push(`<tr>
        <td style="padding:2px 0;text-align:right;vertical-align:baseline;white-space:nowrap;">${
          model ? `<strong>דגם:</strong> ${escapeHtml(model)}` : '<strong>דגם:</strong>'
        }</td>
        <td aria-hidden="true" style="padding:2px 0;width:5ch;white-space:pre;">${EMAIL_NBSP_GAP}</td>
        <td style="padding:2px 0;text-align:left;vertical-align:baseline;white-space:nowrap;">${
          size
            ? `<strong>מידה:</strong> <span dir="ltr" style="unicode-bidi:isolate;">${escapeHtml(size)}</span>`
            : ''
        }</td>
      </tr>`);
  }

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body dir="rtl" style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.55;color:#222;direction:rtl;text-align:right;unicode-bidi:embed;">
  <div dir="rtl" style="direction:rtl;text-align:right;">
    <p style="margin:0 0 14px;font-size:16px;direction:rtl;text-align:right;">${escapeHtml(intro)}</p>
    <div style="font-size:17px;direction:rtl;text-align:right;">
      <div style="font-weight:700;font-size:18px;margin-bottom:8px;">פרטי הזמנה:</div>
      ${
        rows.length
          ? `<table dir="rtl" cellpadding="0" cellspacing="0" style="border-collapse:collapse;direction:rtl;">
      ${rows.join('\n      ')}
    </table>`
          : ''
      }
      ${
        accessories
          ? `<div dir="rtl" style="margin-top:6px;"><strong>אביזרים:</strong> ${escapeHtml(accessories)}</div>`
          : ''
      }
    </div>
    <p style="margin:16px 0 0;font-size:16px;direction:rtl;text-align:right;">נא לבדוק את הקבצים המצורפים.</p>
  </div>
</body>
</html>`;
}

function buildEmailSubject(meta = {}) {
  const name = String(meta.customerName || '').trim();
  const phone = String(meta.customerPhone || '').trim();
  const who = [name, phone].filter(Boolean).join(' ').trim();

  // Admin / store: subject is the customer identity; resends are marked explicitly.
  if (who) {
    if (meta.isResend) return `הזמנה חוזרת מ- ${who}`;
    return who;
  }

  const parts = [];
  if (meta.isResend) parts.push('הזמנה חוזרת');
  if (meta.kind === 'verses-print') parts.push('דף פסוקים');
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
  const mailMeta = opts.meta || {};
  const mail = {
    from: cfg.from,
    to: cfg.recipient,
    subject: buildEmailSubject(mailMeta),
    text: buildEmailText(mailMeta),
    html: buildEmailHtml(mailMeta),
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

/**
 * Send PDF attachment(s) to an arbitrary address using the system SMTP/Resend.
 * Used for the store copy: order-form PDF + verses-print PDF.
 *
 * Accepts either:
 *   - pdfFiles: [{ filename, content }, ...]
 *   - or legacy single: pdfFilename + pdfContent
 */
async function sendPdfToAddress({ to, pdfFilename, pdfContent, pdfFiles, meta }) {
  const cfg = getConfig();
  const recipient = String(to || '').trim();
  if (!recipient) {
    const err = new Error('חסרה כתובת נמען לשליחת PDF.');
    err.status = 400;
    throw err;
  }

  const files = Array.isArray(pdfFiles)
    ? pdfFiles.filter((f) => f && f.content)
    : pdfContent
      ? [{ filename: pdfFilename, content: pdfContent }]
      : [];

  if (!files.length) {
    const err = new Error('אין תוכן PDF לשליחה.');
    err.status = 400;
    throw err;
  }

  const attachments = files.map((file, idx) => ({
    filename: file.filename || `order-${idx + 1}.pdf`,
    content: Buffer.isBuffer(file.content)
      ? file.content
      : Buffer.from(file.content),
    contentType: 'application/pdf',
  }));

  const mail = {
    from: cfg.from || cfg.user,
    to: recipient,
    subject: buildEmailSubject(meta || {}),
    text: buildEmailText(meta || {}),
    html: buildEmailHtml(meta || {}),
    attachments,
  };

  if (hasSmtp(cfg)) {
    const transport = await createTransport(cfg);
    await transport.sendMail(mail);
    return {
      sentTo: recipient,
      via: 'system-smtp',
      attachmentCount: attachments.length,
    };
  }
  if (cfg.resendApiKey) {
    await sendViaResend(cfg, mail);
    return {
      sentTo: recipient,
      via: 'system-resend',
      attachmentCount: attachments.length,
    };
  }
  const err = new Error(
    'הגדרות שליחת מייל מערכתיות חסרות — לא ניתן לשלוח עותק לחנות.'
  );
  err.status = 503;
  throw err;
}

module.exports = {
  sendDxfEmail,
  sendPdfToAddress,
  verifySmtp,
  getConfig,
  buildEmailText,
  buildEmailHtml,
  buildEmailSubject,
};
