'use strict';

const fs = require('fs');
const path = require('path');
const { PDFDocument, TextAlignment } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const { query } = require('../db');
const { resolveModelCode } = require('../utils/modelSku');
const { formatHebrewDate } = require('../utils/dates');
const { detectTextDir, preparePdfAppearanceText } = require('../utils/textDirection');
const svgService = require('../services/svgService');

const TEMPLATE_PATH =
  process.env.ORDER_PDF_TEMPLATE_PATH ||
  path.resolve(__dirname, '..', '..', 'templates', 'order-form.pdf');

const HEBREW_FONT_PATH =
  process.env.ORDER_PDF_FONT_PATH ||
  path.resolve(__dirname, '..', '..', 'fonts', 'NotoSansHebrew.ttf');

const STORAGE_DIR =
  process.env.STORAGE_DIR ||
  path.resolve(__dirname, '..', '..', '..', 'saved', 'orders');

/** AcroForm field names in the master order PDF template. */
const PDF_FIELD_MAP = {
  customerName: 'Text Field 1',
  phone: 'Text Field 35',
  model: 'Text Field 7',
  plateDiameter: 'Text Field 10',
  parchmentDiameter: 'Text Field 3',
  stones: 'Text Field 11',
  parchmentHeight: 'Text Field 9',
  // Left accessories column (top → bottom): כתר, כתר-רימונים, רימונים, מעיל, טס, יד
  crown: 'Text Field 36',
  crownCheck: 'Check Box 1',
  crownRimmonim: 'Text Field 37',
  crownRimmonimCheck: 'Check Box 4',
  rimmonim: 'Text Field 38',
  rimmonimCheck: 'Check Box 5',
  coat: 'Text Field 39',
  coatCheck: 'Check Box 6',
  breastplate: 'Text Field 40',
  breastplateCheck: 'Check Box 7',
  pointer: 'Text Field 41',
  pointerCheck: 'Check Box 8',
  deliveryDate: 'Text Field 33',
  orderDate: 'Text Field 32',
  parochetHeight: 'Text Field 34',
  verses: {
    // ימין למעלה — שורה 1 = עליון, שורה 2 = תחתון
    top_right: ['Text Field 12', 'Text Field 14'],
    // שמאל למעלה
    top_left: ['Text Field 44', 'Text Field 45'],
    // ימין למטה
    bottom_right: ['Text Field 46', 'Text Field 47'],
    // שמאל למטה
    bottom_left: ['Text Field 48', 'Text Field 49'],
  },
  notes: [
    'Text Field 21',
    'Text Field 22',
    'Text Field 23',
    'Text Field 24',
    'Text Field 25',
    'Text Field 26',
  ],
};

const CORNER_KEYS = ['top_right', 'top_left', 'bottom_right', 'bottom_left'];

function fmtNum(val) {
  if (val == null || val === '') return '';
  const n = Number(val);
  return Number.isFinite(n) ? String(n) : String(val);
}

function fmtDate(val, opts) {
  return formatHebrewDate(val, opts);
}

function applyFieldDirection(field, text, forceDir) {
  const dir = forceDir || detectTextDir(text);
  try {
    // Hebrew / mixed RTL fields: right-aligned. Numbers / English: left-aligned.
    field.setAlignment(dir === 'ltr' ? TextAlignment.Left : TextAlignment.Right);
  } catch {
    /* alignment unsupported */
  }
  return dir;
}

function setText(form, fieldName, value, font, { forceDir } = {}) {
  if (!fieldName) return;
  const text = value == null ? '' : String(value);
  try {
    const field = form.getTextField(fieldName);
    applyFieldDirection(field, text, forceDir);
    field.setText(preparePdfAppearanceText(text, { forceDir }));
    if (font) field.updateAppearances(font);
  } catch {
    /* field missing in template */
  }
}

/** Truncate a single-line notes value so it fits the AcroForm widget at `fontSize`. */
function fitTextToFieldWidth(text, font, fontSize, maxWidth) {
  const raw = String(text || '');
  if (!raw || !font || !(maxWidth > 0)) return raw;
  if (font.widthOfTextAtSize(raw, fontSize) <= maxWidth) return raw;
  let out = '';
  for (const ch of Array.from(raw)) {
    const next = out + ch;
    if (font.widthOfTextAtSize(next, fontSize) > maxWidth) break;
    out = next;
  }
  return out;
}

function setNotesLine(form, fieldName, value, font, fontSize = 12) {
  if (!fieldName) return;
  try {
    const field = form.getTextField(fieldName);
    const widget = field.acroField.getWidgets()[0];
    const width = widget ? widget.getRectangle().width : 0;
    // Match client clamp margin (~12pt) so exported PDF never shows clipped glyphs.
    const maxWidth = Math.max(0, width - 12);
    const fitted = fitTextToFieldWidth(value, font, fontSize, maxWidth);
    applyFieldDirection(field, fitted);
    field.setText(preparePdfAppearanceText(fitted));
    if (font) field.updateAppearances(font);
  } catch {
    /* field missing in template */
  }
}

function setCheck(form, fieldName, checked) {
  if (!fieldName) return;
  try {
    const box = form.getCheckBox(fieldName);
    if (checked) box.check();
    else box.uncheck();
  } catch {
    /* field missing */
  }
}

function verseLine(values, corner, lineIndex) {
  // PDF: first line = עליון (inner / text_1), second = תחתון (outer / text_2).
  // Same mapping as the side form, preview, and DB columns.
  const suffix = lineIndex === 0 ? '1' : '2';
  const key = `${corner}_${suffix}`;
  return values[key] || '';
}

function modelNameOnly(modelCode, modelNameByCode) {
  if (!modelCode) return '';
  return modelNameByCode[modelCode] || '';
}

function buildPdfPayload({ customerName, customerPhone, order, item, values, modelNameByCode }) {
  const resolveModelName = (code) => modelNameOnly(code, modelNameByCode);
  const hasMainModel = Boolean(String(item?.model || '').trim());

  const stonesParts = [];
  if (item.stones_color) stonesParts.push(item.stones_color);
  if (item.has_stones) stonesParts.push('כן');

  const notesLines = String(item.customer_notes || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, PDF_FIELD_MAP.notes.length);

  const accessory = (hasKey, modelKey) => ({
    name: item[hasKey] ? resolveModelName(item[modelKey] || item.model) : '',
    check: Boolean(item[hasKey]),
  });

  const crown = accessory('has_crown', 'crown_model');
  const crownRimmonim = accessory('has_crown_rimmonim', 'crown_rimmonim_model');
  const rimmonim = accessory('has_rimmonim', 'rimmonim_model');
  const coat = accessory('has_coat', 'coat_model');
  const breastplate = accessory('has_breastplate', 'breastplate_model');
  const pointer = accessory('has_pointer', 'pointer_model');

  const payload = {
    customerName: customerName || '',
    phone: String(customerPhone || '').trim(),
    model: resolveModelName(item.model),
    // Plate diameter applies to עץ חיים and to כתר-only (and other accessory) orders.
    plateDiameter: fmtNum(item.plate_diameter),
    parchmentDiameter: hasMainModel ? fmtNum(item.parchment_diameter) : '',
    stones: stonesParts.join(' '),
    parchmentHeight: hasMainModel ? fmtNum(item.parchment_height) : '',
    crown: crown.name,
    crownCheck: crown.check,
    crownRimmonim: crownRimmonim.name,
    crownRimmonimCheck: crownRimmonim.check,
    rimmonim: rimmonim.name,
    rimmonimCheck: rimmonim.check,
    coat: coat.name,
    coatCheck: coat.check,
    breastplate: breastplate.name,
    breastplateCheck: breastplate.check,
    pointer: pointer.name,
    pointerCheck: pointer.check,
    deliveryDate: fmtDate(order.estimated_delivery_date),
    orderDate: fmtDate(order.order_date),
    parochetHeight: hasMainModel ? fmtNum(item.parochet_height) : '',
    verses: {},
    notes: notesLines,
  };

  // No עץ חיים → leave verse fields empty (no template defaults).
  for (const corner of CORNER_KEYS) {
    payload.verses[corner] = hasMainModel
      ? [verseLine(values, corner, 0), verseLine(values, corner, 1)]
      : ['', ''];
  }

  return payload;
}

async function fillOrderPdf(payload) {
  if (!fs.existsSync(TEMPLATE_PATH)) {
    const err = new Error(`תבנית PDF לא נמצאה: ${TEMPLATE_PATH}`);
    err.status = 500;
    throw err;
  }
  if (!fs.existsSync(HEBREW_FONT_PATH)) {
    const err = new Error(`גופן עברי ל-PDF לא נמצא: ${HEBREW_FONT_PATH}`);
    err.status = 500;
    throw err;
  }

  const bytes = fs.readFileSync(TEMPLATE_PATH);
  const doc = await PDFDocument.load(bytes);
  doc.registerFontkit(fontkit);
  const hebrewFont = await doc.embedFont(fs.readFileSync(HEBREW_FONT_PATH));
  const form = doc.getForm();
  form.updateFieldAppearances(hebrewFont);

  setText(form, PDF_FIELD_MAP.customerName, payload.customerName, hebrewFont);
  setText(form, PDF_FIELD_MAP.phone, payload.phone, hebrewFont, { forceDir: 'ltr' });
  setText(form, PDF_FIELD_MAP.model, payload.model, hebrewFont);
  setText(form, PDF_FIELD_MAP.plateDiameter, payload.plateDiameter, hebrewFont, { forceDir: 'ltr' });
  setText(form, PDF_FIELD_MAP.parchmentDiameter, payload.parchmentDiameter, hebrewFont, { forceDir: 'ltr' });
  setText(form, PDF_FIELD_MAP.stones, payload.stones, hebrewFont);
  setText(form, PDF_FIELD_MAP.parchmentHeight, payload.parchmentHeight, hebrewFont, { forceDir: 'ltr' });

  setText(form, PDF_FIELD_MAP.crown, payload.crown, hebrewFont);
  setCheck(form, PDF_FIELD_MAP.crownCheck, payload.crownCheck);
  setText(form, PDF_FIELD_MAP.crownRimmonim, payload.crownRimmonim, hebrewFont);
  setCheck(form, PDF_FIELD_MAP.crownRimmonimCheck, payload.crownRimmonimCheck);
  setText(form, PDF_FIELD_MAP.rimmonim, payload.rimmonim, hebrewFont);
  setCheck(form, PDF_FIELD_MAP.rimmonimCheck, payload.rimmonimCheck);
  setText(form, PDF_FIELD_MAP.coat, payload.coat, hebrewFont);
  setCheck(form, PDF_FIELD_MAP.coatCheck, payload.coatCheck);
  setText(form, PDF_FIELD_MAP.breastplate, payload.breastplate, hebrewFont);
  setCheck(form, PDF_FIELD_MAP.breastplateCheck, payload.breastplateCheck);
  setText(form, PDF_FIELD_MAP.pointer, payload.pointer, hebrewFont);
  setCheck(form, PDF_FIELD_MAP.pointerCheck, payload.pointerCheck);

  setText(form, PDF_FIELD_MAP.deliveryDate, payload.deliveryDate, hebrewFont, { forceDir: 'ltr' });
  setText(form, PDF_FIELD_MAP.orderDate, payload.orderDate, hebrewFont, { forceDir: 'ltr' });
  setText(form, PDF_FIELD_MAP.parochetHeight, payload.parochetHeight, hebrewFont, { forceDir: 'ltr' });

  // Verses are always Hebrew — force RTL (logical order + right align).
  for (const corner of CORNER_KEYS) {
    const fieldNames = PDF_FIELD_MAP.verses[corner];
    const lines = payload.verses[corner] || [];
    fieldNames.forEach((name, idx) =>
      setText(form, name, lines[idx] || '', hebrewFont, { forceDir: 'rtl' })
    );
  }

  payload.notes.forEach((line, idx) => {
    const fieldName = PDF_FIELD_MAP.notes[idx];
    if (!fieldName) return;
    setNotesLine(form, fieldName, line || '', hebrewFont, 12);
  });

  form.flatten();
  return Buffer.from(await doc.save());
}

function pdfOutputPath(orderId, itemId) {
  return path.join(STORAGE_DIR, String(orderId), `item-${itemId}.pdf`);
}

/**
 * Build a filled order PDF from DB state and persist to disk.
 */
async function exportOrderItemPdf(orderId, itemId, deps = {}) {
  const getDetails = deps.getOrderItemDetails;
  const getVerses = deps.getOrderItemVerses;
  if (!getDetails || !getVerses) {
    const err = new Error('exportOrderItemPdf requires getOrderItemDetails and getOrderItemVerses');
    err.status = 500;
    throw err;
  }

  const details = await getDetails(orderId, itemId);
  if (!details) {
    const err = new Error('Order item not found.');
    err.status = 404;
    throw err;
  }

  // Order-form PDF must work without verses (no עץ חיים / size that skips verses).
  const defaults = svgService.getDefaults();
  let values = { ...defaults };
  try {
    const versesRow = await getVerses(orderId, itemId);
    const saved = versesRow?.values || {};
    values = { ...defaults, ...saved };
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (!/אינה תומכת בעריכת פסוקים/.test(msg)) {
      throw err;
    }
  }

  const modelCodes = new Set();
  const { rows: modelRows } = await query(`SELECT model_code, model_name FROM models`);

  const item = { ...details.item };
  item.model = resolveModelCode(item.model, modelRows);
  for (const key of [
    'crown_model',
    'crown_rimmonim_model',
    'rimmonim_model',
    'coat_model',
    'breastplate_model',
    'pointer_model',
  ]) {
    if (item[key]) item[key] = resolveModelCode(item[key], modelRows);
  }

  for (const code of [
    item.model,
    item.crown_model,
    item.crown_rimmonim_model,
    item.rimmonim_model,
    item.coat_model,
    item.breastplate_model,
    item.pointer_model,
  ]) {
    if (code) modelCodes.add(code);
  }

  const modelNameByCode = {};
  for (const row of modelRows) {
    if (modelCodes.has(row.model_code)) {
      modelNameByCode[row.model_code] = row.model_name;
    }
  }

  const payload = buildPdfPayload({
    customerName: details.customerName,
    customerPhone: details.customerPhone,
    order: details.order,
    item,
    values,
    modelNameByCode,
  });

  const pdfBytes = await fillOrderPdf(payload);
  // In-memory only — email attaches bytes; nothing written under STORAGE_DIR.
  return { pdfBytes, filePath: null, payload };
}

module.exports = {
  TEMPLATE_PATH,
  PDF_FIELD_MAP,
  buildPdfPayload,
  fillOrderPdf,
  exportOrderItemPdf,
  pdfOutputPath,
};
