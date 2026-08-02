'use strict';

const fs = require('fs');
const path = require('path');
const svgService = require('../src/services/svgService');
const { exportQuartersFromRawSvg } = require('../src/export/dxfExportService');
const { buildTemplateContext } = require('../src/services/templateResolver');
const { CORNER_SYMBOLS_KEY } = require('../src/config/cornerSymbols');

const sizesDir = path.join(__dirname, '../templates/sizes');
const files = fs.readdirSync(sizesDir).filter((f) => f.endsWith('.svg'));

const symbols = { [CORNER_SYMBOLS_KEY]: {} };
for (const c of ['top_right', 'top_left', 'bottom_right', 'bottom_left']) {
  symbols[CORNER_SYMBOLS_KEY][c] = {
    type: 'sparkle4',
    count: 2,
    sides: 'both',
  };
}

let failed = 0;
for (const file of files) {
  const svgPath = path.join(sizesDir, file);
  const svgRaw = fs.readFileSync(svgPath, 'utf8');
  const ctx = buildTemplateContext({
    svgPath,
    svgRaw,
    sizeCode: path.basename(file, '.svg'),
    productTypeCode: '01',
    exportScaleFactor: 1,
    sizeName: file,
  });
  const values = {};
  for (const f of ctx.fields) values[f.key] = '';
  process.stdout.write(`${file}... `);
  try {
    const svg = svgService.renderCustomizedSvg(values, symbols, ctx);
    const result = exportQuartersFromRawSvg(svg, { scaleFactor: 1 });
    if (result.quarters.length !== 4) throw new Error('not 4 quarters');
    console.log('ok', result.quarters.map((q) => q.dxf.length).join('/'));
  } catch (err) {
    failed += 1;
    console.log('FAIL', err.message);
    console.error(err.stack);
  }
}

process.exit(failed ? 1 : 0);
