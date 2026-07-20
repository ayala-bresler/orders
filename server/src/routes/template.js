'use strict';

/**
 * Template routes.
 *  GET  /api/template?orderItemId=&orderId=&sizeCode=&productTypeCode=
 *  GET  /api/template/sizes?product_type_code=01
 *  POST /api/template/preview
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const orderService = require('../services/orderService');
const svgService = require('../services/svgService');
const templateResolver = require('../services/templateResolver');
const { TEMPLATE } = require('../export/templateRegistry');

const router = express.Router();

function resolveFontPath() {
  const preferred = path.join(TEMPLATE.fontsDir, TEMPLATE.defaultFontFile);
  if (fs.existsSync(preferred)) return preferred;
  try {
    const entries = fs.readdirSync(TEMPLATE.fontsDir, { withFileTypes: true });
    const match = entries.find(
      (e) => e.isFile() && /^fbkidushpro-bold\.otf$/i.test(e.name)
    );
    if (match) return path.join(TEMPLATE.fontsDir, match.name);
  } catch {
    /* fonts dir missing */
  }
  return preferred;
}

function templateQueryFromReq(req) {
  const body = req.body || {};
  const orderId = Number(req.query.orderId ?? body.orderId);
  const orderItemId = Number(req.query.orderItemId ?? body.orderItemId);
  return {
    orderId: Number.isInteger(orderId) ? orderId : null,
    orderItemId: Number.isInteger(orderItemId) ? orderItemId : null,
    sizeCode: req.query.sizeCode || body.sizeCode || null,
    productTypeCode: req.query.productTypeCode || body.productTypeCode || null,
  };
}

router.get('/sizes', async (req, res, next) => {
  try {
    const productTypeCode =
      req.query.product_type_code ||
      req.query.productTypeCode ||
      templateResolver.DEFAULT_PRODUCT_TYPE_CODE;
    const sizes = await templateResolver.listProductSizes(productTypeCode);
    res.json({ productTypeCode, sizes });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const q = templateQueryFromReq(req);
    if (q.orderId && q.orderItemId) {
      await orderService.assertItemSupportsVerses(q.orderId, q.orderItemId);
    }
    const ctx = await templateResolver.resolveTemplate(q);
    const fields = svgService.extractEditableFields(ctx.svgRaw, ctx);
    res.json({
      svg: ctx.svgRaw,
      fields,
      maxVerseLength: svgService.MAX_VERSE_LENGTH,
      baseFontSizePx: svgService.BASE_FONT_SIZE_PX,
      maxFontSizePx: svgService.MAX_FONT_SIZE_PX,
      sizeCode: ctx.sizeCode,
      productTypeCode: ctx.productTypeCode,
      sizeName: ctx.sizeName,
      templateMeta: {
        viewBox: ctx.meta.viewBox,
        width: ctx.meta.width,
        height: ctx.meta.height,
        exportScaleFactor: ctx.exportScaleFactor,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/font', (req, res, next) => {
  try {
    const fontPath = resolveFontPath();
    if (!fs.existsSync(fontPath)) {
      res.status(404).json({ error: `Font file missing: ${TEMPLATE.defaultFontFile}` });
      return;
    }
    res.type('font/otf').send(fs.readFileSync(fontPath));
  } catch (err) {
    next(err);
  }
});

router.post('/preview', async (req, res, next) => {
  try {
    const body = req.body || {};
    const values = body.values || {};
    const fontScales = body.fontScales || {};
    const q = templateQueryFromReq(req);
    if (q.orderId && q.orderItemId) {
      await orderService.assertItemSupportsVerses(q.orderId, q.orderItemId);
    }
    const ctx = await templateResolver.resolveTemplate(q);
    // Path outlines — same ring centering as DXF export.
    const bake = body.bake !== false;
    const svg = svgService.renderPreviewSvg(values, fontScales, ctx, { bake });
    const layout = svgService.computeLayoutMetrics(values, fontScales, ctx);
    res.json({ svg, layout, templateMeta: ctx.meta, baked: bake });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
