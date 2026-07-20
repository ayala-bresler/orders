'use strict';

/**
 * Order personalization routes.
 *  GET  /api/orders/:orderId/items/:itemId/verses  -> saved verses
 *  PUT  /api/orders/:orderId/items/:itemId/verses  -> save verses (+ svg snapshot)
 *  GET  /api/orders/:orderId/items/:itemId/svg     -> serialized customized SVG
 *  GET|POST /api/orders/:orderId/items/:itemId/dxf       -> DXF download
 *  POST     /api/orders/:orderId/items/:itemId/dxf/email -> DXF by email
 */

const express = require('express');
const orderService = require('../services/orderService');
const catalogService = require('../services/catalogService');
const svgService = require('../services/svgService');
const templateResolver = require('../services/templateResolver');
const { modelSkuPrefix, shortSkuFromFull } = require('../utils/modelSku');

const router = express.Router();

function ids(req) {
  const orderId = Number(req.params.orderId);
  const itemId = Number(req.params.itemId);
  return { orderId, itemId, valid: Number.isInteger(orderId) && Number.isInteger(itemId) };
}

// Add a selected product (or model) to an order.
router.post('/:orderId/items', async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId)) {
      return res.status(400).json({ error: 'מזהה הזמנה שגוי.' });
    }

    const body = req.body || {};
    const { product_code: productCode, model_code: modelCode, quantity } = body;

    let variant = null;
    let resolvedProductCode = productCode;

    if (modelCode) {
      variant = await catalogService.getVariantByModel(modelCode);
      if (!variant) {
        return res.status(404).json({ error: 'לא נמצא מוצר לדגם שנבחר.' });
      }
      resolvedProductCode = variant.product_code;
    } else if (productCode) {
      variant = await catalogService.getPrimaryVariant(productCode);
    } else {
      return res.status(400).json({ error: 'חסר דגם או מוצר.' });
    }

    const info = await catalogService.productSupportsVerses(resolvedProductCode);
    if (!info || !info.exists) {
      return res.status(404).json({ error: 'המוצר לא נמצא.' });
    }

    const item = await orderService.createOrderItem(orderId, {
      product_code: resolvedProductCode,
      quantity,
      model: variant?.model_code || modelCode || null,
      size_code: body.size_code || '12',
      plate_diameter: body.plate_diameter ?? 12,
      product_type_code: body.product_type_code || variant?.product_type_code || '01',
    });

    const shortSku = variant?.model_code
      ? modelSkuPrefix(variant.model_code)
      : shortSkuFromFull(variant?.sku);

    res.status(201).json({
      ...item,
      supports_verses: info.supports_verses,
      short_sku: shortSku,
      model_name: variant?.model_name || null,
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/:orderId/items/:itemId', async (req, res, next) => {
  try {
    const { orderId, itemId, valid } = ids(req);
    if (!valid) return res.status(400).json({ error: 'מזהה הזמנה או פריט שגוי.' });

    const result = await orderService.deleteOrderItem(orderId, itemId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.delete('/:orderId', async (req, res, next) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId)) {
      return res.status(400).json({ error: 'מזהה הזמנה שגוי.' });
    }
    const result = await orderService.deleteOrder(orderId);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:orderId/items/:itemId/details', async (req, res, next) => {
  try {
    const { orderId, itemId, valid } = ids(req);
    if (!valid) return res.status(400).json({ error: 'Invalid order/item id.' });

    const found = await orderService.getOrderItemDetails(orderId, itemId);
    if (!found) return res.status(404).json({ error: 'Order item not found.' });

    res.json(found);
  } catch (err) {
    next(err);
  }
});

router.put('/:orderId/items/:itemId/details', async (req, res, next) => {
  try {
    const { orderId, itemId, valid } = ids(req);
    if (!valid) return res.status(400).json({ error: 'Invalid order/item id.' });

    const body = req.body || {};
    const result = await orderService.saveOrderItemDetails(orderId, itemId, {
      order: body.order,
      item: body.item,
    });
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.get('/:orderId/items/:itemId/verses', async (req, res, next) => {
  try {
    const { orderId, itemId, valid } = ids(req);
    if (!valid) return res.status(400).json({ error: 'Invalid order/item id.' });

    const found = await orderService.getOrderItemVerses(orderId, itemId);
    if (!found) return res.status(404).json({ error: 'Order item not found.' });

    // Fill any unset verse with the master default so the UI has a full set.
    const defaults = svgService.getDefaults();
    const meta = await orderService.getOrderItemMeta(orderId, itemId);
    res.json({ ...found, values: { ...defaults, ...found.values }, defaults, meta });
  } catch (err) {
    next(err);
  }
});

router.put('/:orderId/items/:itemId/verses', async (req, res, next) => {
  try {
    const { orderId, itemId, valid } = ids(req);
    if (!valid) return res.status(400).json({ error: 'Invalid order/item id.' });

    const values = (req.body && req.body.values) || {};
    const fontScales = (req.body && req.body.fontScales) || {};
    const result = await orderService.saveOrderItemVerses(orderId, itemId, values, fontScales);
    res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
});

router.get('/:orderId/items/:itemId/svg', async (req, res, next) => {
  try {
    const { orderId, itemId, valid } = ids(req);
    if (!valid) return res.status(400).json({ error: 'Invalid order/item id.' });

    const found = await orderService.getOrderItemVerses(orderId, itemId);
    if (!found) return res.status(404).json({ error: 'Order item not found.' });

    const templateContext = await templateResolver.resolveTemplate({ orderId, orderItemId: itemId });
    const svg = svgService.renderCustomizedSvg(found.values, found.fontScales || {}, templateContext);
    res.type('image/svg+xml').send(svg);
  } catch (err) {
    next(err);
  }
});

router.get('/:orderId/items/:itemId/dxf', exportDxfHandler);
router.post('/:orderId/items/:itemId/dxf', exportDxfHandler);
router.post('/:orderId/items/:itemId/dxf/email', exportDxfEmailHandler);
router.get('/:orderId/items/:itemId/pdf', exportPdfHandler);
router.post('/:orderId/items/:itemId/pdf', exportPdfHandler);
router.post('/:orderId/items/:itemId/complete', completeOrderHandler);

async function buildDxfExport(req) {
  const { orderId, itemId, valid } = ids(req);
  if (!valid) {
    const err = new Error('Invalid order/item id.');
    err.status = 400;
    throw err;
  }

  const {
    exportOrderItemDxf,
    exportCustomDxf,
    exportFromPreparedSvg,
  } = require('../export/dxfExportService');
  const body = req.body || {};

  if (body.preparedSvg && typeof body.preparedSvg === 'string') {
    const result = exportFromPreparedSvg(orderId, itemId, body.preparedSvg);
    return { orderId, itemId, result };
  }

  const hasLive =
    body.values && typeof body.values === 'object' && Object.keys(body.values).length;

  const result = hasLive
    ? await exportCustomDxf(orderId, itemId, body.values, body.fontScales || {})
    : await exportOrderItemDxf(orderId, itemId, orderService.getOrderItemVerses);

  return { orderId, itemId, result };
}

async function exportDxfHandler(req, res, next) {
  try {
    const { buildQuartersZip } = require('../export/dxfExportService');
    const { orderId, itemId, result } = await buildDxfExport(req);

    if (result.warnings.length) {
      res.setHeader('X-Export-Warnings', result.warnings.join(' | '));
    }

    const zip = buildQuartersZip(orderId, itemId, result.quarters);
    res
      .type('application/zip')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="order-${orderId}-item-${itemId}-quarters.zip"`
      )
      .send(zip);
  } catch (err) {
    next(err);
  }
}

async function exportDxfEmailHandler(req, res, next) {
  try {
    const { sendDxfEmail } = require('../services/emailService');
    const { exportOrderItemPdf } = require('../export/pdfExportService');
    const { quarterDxfFilename, sortQuartersForExport } = require('../export/dxfExportService');

    const { orderId, itemId, result } = await buildDxfExport(req);

    if (!result?.quarters?.length) {
      const err = new Error('ייצוא DXF נכשל — לא נוצרו קבצי רבעים.');
      err.status = 500;
      throw err;
    }

    const meta = await orderService.getOrderItemMeta(orderId, itemId);
    const details = await orderService.getOrderItemDetails(orderId, itemId);
    const { query } = require('../db');
    const { rows: modelRows } = await query(
      `SELECT model_code, model_name FROM models`
    );
    const modelNameByCode = Object.fromEntries(
      modelRows.map((row) => [row.model_code, row.model_name])
    );
    const item = details?.item || {};
    const { mainModelName, formatAccessoryLine } = require('../utils/orderItemDisplay');
    const modelName = mainModelName(
      { ...item, model_name: meta?.model_name, product_name: meta?.product_name },
      modelNameByCode
    );
    const accessoryLine = formatAccessoryLine(item, modelNameByCode);

    let pdfResult = null;
    let pdfWarning = null;
    try {
      pdfResult = await exportOrderItemPdf(orderId, itemId, {
        getOrderItemDetails: orderService.getOrderItemDetails,
        getOrderItemVerses: orderService.getOrderItemVerses,
      });
    } catch (pdfErr) {
      pdfWarning = pdfErr.message;
      console.warn('[pdf] export during email failed:', pdfErr.message);
    }

    const quarterFiles = sortQuartersForExport(result.quarters).map((q) => ({
      filename: quarterDxfFilename(orderId, itemId, q.id),
      content: q.dxf,
      label: q.label,
    }));

    const { sentTo, attachmentCount } = await sendDxfEmail({
      quarterFiles,
      pdfFilename: pdfResult ? `order-${orderId}-item-${itemId}.pdf` : null,
      pdfContent: pdfResult?.pdfBytes || null,
      meta: {
        orderId,
        customerName: details?.customerName || null,
        modelName,
        accessoryLine: accessoryLine || null,
      },
    });

    const completed = await orderService.completeOrderItem(orderId, itemId);

    res.json({
      ok: true,
      sentTo,
      quarterCount: result.quarters.length,
      attachmentCount,
      filePaths: result.filePaths,
      pdfFilePath: pdfResult?.filePath || null,
      pdfAttached: Boolean(pdfResult?.pdfBytes),
      deletedItemId: completed.deletedItemId,
      remainingItems: completed.remainingItems,
      remainingCount: completed.remainingCount,
      orderSubmitted: completed.orderSubmitted,
      status: completed.orderSubmitted ? 'submitted' : 'open',
      warnings: [
        ...result.warnings,
        ...(pdfWarning ? [`PDF: ${pdfWarning}`] : []),
      ],
    });
  } catch (err) {
    next(err);
  }
}

async function exportPdfHandler(req, res, next) {
  try {
    const { orderId, itemId, valid } = ids(req);
    if (!valid) return res.status(400).json({ error: 'Invalid order/item id.' });

    const { exportOrderItemPdf } = require('../export/pdfExportService');
    const result = await exportOrderItemPdf(orderId, itemId, {
      getOrderItemDetails: orderService.getOrderItemDetails,
      getOrderItemVerses: orderService.getOrderItemVerses,
    });

    res
      .type('application/pdf')
      .setHeader(
        'Content-Disposition',
        `attachment; filename="order-${orderId}-item-${itemId}.pdf"`
      )
      .send(Buffer.from(result.pdfBytes));
  } catch (err) {
    next(err);
  }
}

async function completeOrderHandler(req, res, next) {
  try {
    const { orderId, itemId, valid } = ids(req);
    if (!valid) return res.status(400).json({ error: 'Invalid order/item id.' });

    const { exportOrderItemPdf } = require('../export/pdfExportService');
    const pdfResult = await exportOrderItemPdf(orderId, itemId, {
      getOrderItemDetails: orderService.getOrderItemDetails,
      getOrderItemVerses: orderService.getOrderItemVerses,
    });

    const completed = await orderService.completeOrderItem(orderId, itemId);

    res.json({
      ok: true,
      pdfFilePath: pdfResult.filePath,
      deletedItemId: completed.deletedItemId,
      remainingItems: completed.remainingItems,
      remainingCount: completed.remainingCount,
      orderSubmitted: completed.orderSubmitted,
      status: completed.orderSubmitted ? 'submitted' : 'open',
    });
  } catch (err) {
    next(err);
  }
}

module.exports = router;
