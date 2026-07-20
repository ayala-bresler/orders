'use strict';



const templateResolver = require('./templateResolver');

const {

  plateDiameterNumber,

  resolveProductSizeRow,

} = require('../utils/productSizeDisplay');



async function resolveSizeForItem(item, productTypeCode = '01') {

  if (!item) return null;

  const ptc = item.product_type_code || productTypeCode;

  const sizes = await templateResolver.listProductSizes(ptc);

  return resolveProductSizeRow(sizes, {

    plate_diameter: item.plate_diameter,

    size_code: item.size_code,

  });

}



/** Keep size_code + plate_diameter aligned with the chosen plate size. */

async function syncItemSizeFields(item, productTypeCode = '01') {

  if (!item) return item;

  const row = await resolveSizeForItem(item, productTypeCode);

  if (!row) return item;

  const out = { ...item, size_code: row.size_code };

  const n = plateDiameterNumber(row);

  if (n != null) out.plate_diameter = n;

  return out;

}



function sizeSupportsVerses(sizeRow) {

  if (!sizeRow) return false;

  return sizeRow.supports_verses !== false;

}



async function itemSupportsVerses(item, productTypeCode = '01') {

  const sizeRow = await resolveSizeForItem(item, productTypeCode);

  return sizeSupportsVerses(sizeRow);

}



module.exports = {

  resolveSizeForItem,

  syncItemSizeFields,

  sizeSupportsVerses,

  itemSupportsVerses,

};

