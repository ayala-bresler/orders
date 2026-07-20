'use strict';

/**
 * Product catalog (client-facing).
 *  GET /api/products                      -> selectable products (defaults to category 4)
 *  GET /api/products/models                -> all models (dropdowns)
 *  GET /api/products/selectable-models     -> model cards for new-order picker
 *  GET /api/products/model-images/:shortSku -> model photo (jpg/png)
 */

const express = require('express');
const catalogService = require('../services/catalogService');
const {
  resolveModelImagePath,
  sanitizeShortSku,
} = require('../services/modelImageService');
const { shortSkuFromFull } = require('../utils/modelSku');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const categoryId = req.query.category
      ? Number(req.query.category)
      : catalogService.CLIENT_CATEGORY_ID;
    const products = await catalogService.listProducts(categoryId);
    res.json({ categoryId, products });
  } catch (err) {
    next(err);
  }
});

router.get('/models', async (req, res, next) => {
  try {
    const models = await catalogService.listModels();
    res.json({ models });
  } catch (err) {
    next(err);
  }
});

router.get('/selectable-models', async (req, res, next) => {
  try {
    const categoryId = req.query.category
      ? Number(req.query.category)
      : catalogService.CLIENT_CATEGORY_ID;
    const models = await catalogService.listSelectableModels(categoryId);
    res.json({ categoryId, models });
  } catch (err) {
    next(err);
  }
});

router.get('/sizes', async (req, res, next) => {
  try {
    const productTypeCode = req.query.product_type_code || req.query.productTypeCode || '01';
    const sizes = await catalogService.listProductSizes(productTypeCode);
    res.json({ productTypeCode, sizes });
  } catch (err) {
    next(err);
  }
});

router.get('/model-images/:shortSku', async (req, res, next) => {
  try {
    const shortSku = sanitizeShortSku(
      shortSkuFromFull(req.params.shortSku || req.params.shortsku)
    );
    const filePath = resolveModelImagePath(shortSku);
    if (!filePath) {
      return res.status(404).json({ error: 'תמונת דגם לא נמצאה.' });
    }
    res.sendFile(filePath);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
