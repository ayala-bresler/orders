'use strict';

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');
const { query } = require('../db');
const { resolveModelCode } = require('../utils/modelSku');
const { formatHebrewDate } = require('../utils/dates');
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
  model: 'Text Field 7',
  plateDiameter: 'Text Field 10',
  parchmentDiameter: 'Text Field 3',
  stones: 'Text Field 11',
  parchmentHeight: 'Text Field 9',
  crown: 'Text Field 30',
  crownCheck: 'Check Box 1',
  breastplate: 'Text Field 29',
  breastplateCheck: 'Check Box 2',
  pointer: 'Text Field 28',
  pointerCheck: 'Check Box 3',
  deliveryDate: 'Text Field 33',
  orderDate: 'Text Field 32',
  parochetHeight: 'Text Field 34',
  verses: {
    // ימין למעלה — שורה 1 = עליון, שורה 2 = תחתון
    top_right: ['Text Field 12', 'Text Field 14'],
    // שמאל למעלה
    top_left: ['Text Field 15', 'Text Field 16'],
    // ימין למטה
    bottom_right: ['Text Field 17', 'Text Field 19'],
    // שמאל למטה
    bottom_left: ['Text Field 18', 'Text Field 20'],
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

function setText(form, fieldName, value, font) {
  if (!fieldName) return;
  const text = value == null ? '' : String(value);
  try {
    const field = form.getTextField(fieldName);
    field.setText(text);
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

function buildPdfPayload({ customerName, order, item, values, modelNameByCode }) {
  const resolveModelName = (code) => modelNameOnly(code, modelNameByCode);

  const stonesParts = [];
  if (item.stones_color) stonesParts.push(item.stones_color);
  if (item.has_stones) stonesParts.push('כן');

  const notesLines = String(order.order_notes || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, PDF_FIELD_MAP.notes.length);

  const payload = {
    customerName: customerName || '',
    model: resolveModelName(item.model),
    plateDiameter: fmtNum(item.plate_diameter),
    parchmentDiameter: fmtNum(item.parchment_diameter),
    stones: stonesParts.join(' '),
    parchmentHeight: fmtNum(item.parchment_height),
    crown: item.has_crown ? resolveModelName(item.crown_model || item.model) : '',
    crownCheck: Boolean(item.has_crown),
    breastplate: item.has_breastplate ? resolveModelName(item.breastplate_model || item.model) : '',
    breastplateCheck: Boolean(item.has_breastplate),
    pointer: item.has_pointer ? resolveModelName(item.pointer_model || item.model) : '',
    pointerCheck: Boolean(item.has_pointer),
    deliveryDate: fmtDate(order.estimated_delivery_date),
    orderDate: fmtDate(order.order_date),
    parochetHeight: fmtNum(item.parochet_height),
    verses: {},
    notes: notesLines,
  };

  for (const corner of CORNER_KEYS) {
    payload.verses[corner] = [
      verseLine(values, corner, 0),
      verseLine(values, corner, 1),
    ];
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
  setText(form, PDF_FIELD_MAP.model, payload.model, hebrewFont);
  setText(form, PDF_FIELD_MAP.plateDiameter, payload.plateDiameter, hebrewFont);
  setText(form, PDF_FIELD_MAP.parchmentDiameter, payload.parchmentDiameter, hebrewFont);
  setText(form, PDF_FIELD_MAP.stones, payload.stones, hebrewFont);
  setText(form, PDF_FIELD_MAP.parchmentHeight, payload.parchmentHeight, hebrewFont);
  setText(form, PDF_FIELD_MAP.crown, payload.crown, hebrewFont);
  setCheck(form, PDF_FIELD_MAP.crownCheck, payload.crownCheck);
  setText(form, PDF_FIELD_MAP.breastplate, payload.breastplate, hebrewFont);
  setCheck(form, PDF_FIELD_MAP.breastplateCheck, payload.breastplateCheck);
  setText(form, PDF_FIELD_MAP.pointer, payload.pointer, hebrewFont);
  setCheck(form, PDF_FIELD_MAP.pointerCheck, payload.pointerCheck);
  setText(form, PDF_FIELD_MAP.deliveryDate, payload.deliveryDate, hebrewFont);
  setText(form, PDF_FIELD_MAP.orderDate, payload.orderDate, hebrewFont);
  setText(form, PDF_FIELD_MAP.parochetHeight, payload.parochetHeight, hebrewFont);

  for (const corner of CORNER_KEYS) {
    const fieldNames = PDF_FIELD_MAP.verses[corner];
    const lines = payload.verses[corner] || [];
    fieldNames.forEach((name, idx) => setText(form, name, lines[idx] || '', hebrewFont));
  }

  payload.notes.forEach((line, idx) => {
    const fieldName = PDF_FIELD_MAP.notes[idx];
    if (!fieldName) return;
    setText(form, fieldName, line || '', hebrewFont);
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

  const versesRow = await getVerses(orderId, itemId);
  const defaults = svgService.getDefaults();
  const saved = versesRow?.values || {};
  const values = { ...defaults, ...saved };

  const modelCodes = new Set();
  const { rows: modelRows } = await query(`SELECT model_code, model_name FROM models`);

  const item = { ...details.item };
  item.model = resolveModelCode(item.model, modelRows);
  if (item.crown_model) item.crown_model = resolveModelCode(item.crown_model, modelRows);
  if (item.breastplate_model) item.breastplate_model = resolveModelCode(item.breastplate_model, modelRows);
  if (item.pointer_model) item.pointer_model = resolveModelCode(item.pointer_model, modelRows);

  for (const code of [item.model, item.crown_model, item.breastplate_model, item.pointer_model]) {
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
    order: details.order,
    item,
    values,
    modelNameByCode,
  });

  const pdfBytes = await fillOrderPdf(payload);
  const filePath = pdfOutputPath(orderId, itemId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, pdfBytes);

  return { pdfBytes, filePath, payload };
}

module.exports = {
  TEMPLATE_PATH,
  PDF_FIELD_MAP,
  buildPdfPayload,
  fillOrderPdf,
  exportOrderItemPdf,
  pdfOutputPath,
};
