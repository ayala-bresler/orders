'use strict';

/**
 * Single-page PDF of the verses plate (baked SVG), for the store mailbox.
 * Portrait A4 — fits the plate to one page (no baked logo rectangle).
 */

const { PDFDocument } = require('pdf-lib');
const { Resvg } = require('@resvg/resvg-js');
const svgService = require('../services/svgService');
const templateResolver = require('../services/templateResolver');

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN = 18; // ~6.3mm

function ensureSvgXml(svgString) {
  let s = String(svgString || '').trim();
  if (!s) throw new Error('אין SVG להדפסת פסוקים.');
  if (!s.includes('xmlns=')) {
    s = s.replace(
      /<svg\b/i,
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"'
    );
  }
  return s;
}

function rasterizeSvg(svgString, widthPx) {
  const resvg = new Resvg(ensureSvgXml(svgString), {
    fitTo: { mode: 'width', value: Math.max(400, Math.round(widthPx)) },
    background: 'white',
  });
  return resvg.render().asPng();
}

/**
 * Build a one-page A4 portrait PDF with the baked verses SVG.
 * @returns {Promise<{ pdfBytes: Uint8Array }>}
 */
async function exportVersesPrintPdf(orderId, orderItemId, deps = {}) {
  const getVerses = deps.getOrderItemVerses;
  if (typeof getVerses !== 'function') {
    const err = new Error('חסר getOrderItemVerses לייצוא PDF פסוקים.');
    err.status = 500;
    throw err;
  }

  const found = await getVerses(orderId, orderItemId);
  if (!found) {
    const err = new Error('Order item not found.');
    err.status = 404;
    throw err;
  }

  const templateContext = await templateResolver.resolveTemplate({
    orderId,
    orderItemId,
  });
  const bakedSvg = svgService.renderPreviewSvg(
    found.values || {},
    found.fontScales || {},
    templateContext,
    { bake: true }
  );

  const contentWidth = A4_WIDTH - MARGIN * 2;
  const pngBytes = rasterizeSvg(bakedSvg, contentWidth * 2.5);

  const doc = await PDFDocument.create();
  const page = doc.addPage([A4_WIDTH, A4_HEIGHT]);
  const png = await doc.embedPng(pngBytes);

  const yTop = A4_HEIGHT - MARGIN;
  const maxH = yTop - MARGIN;
  const scale = Math.min(contentWidth / png.width, maxH / png.height);
  const dw = png.width * scale;
  const dh = png.height * scale;
  page.drawImage(png, {
    x: (A4_WIDTH - dw) / 2,
    y: yTop - dh,
    width: dw,
    height: dh,
  });

  const pdfBytes = await doc.save();
  return { pdfBytes };
}

module.exports = {
  exportVersesPrintPdf,
};
