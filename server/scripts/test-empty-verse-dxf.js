'use strict';

/**
 * Offline check: DXF export must succeed with missing/empty verses + corner symbols.
 */

const svgService = require('../src/services/svgService');
const { exportQuartersFromRawSvg } = require('../src/export/dxfExportService');
const { buildDefaultContext } = require('../src/services/templateResolver');
const { CORNER_SYMBOLS_KEY } = require('../src/config/cornerSymbols');

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('ok:', msg);
  }
}

function runCase(name, values, fontScales) {
  const ctx = buildDefaultContext();
  console.log(`\n--- ${name} ---`);
  try {
    const svg = svgService.renderCustomizedSvg(values, fontScales, ctx);
    assert(typeof svg === 'string' && svg.length > 100, `${name}: svg rendered`);
    const baked = svgService.renderPreviewSvg(values, fontScales, ctx, { bake: true });
    assert(typeof baked === 'string' && baked.length > 100, `${name}: bake ok`);
    const result = exportQuartersFromRawSvg(svg, {
      scaleFactor: ctx.exportScaleFactor || 1,
    });
    assert(result.quarters.length === 4, `${name}: 4 quarters`);
    for (const q of result.quarters) {
      assert(q.dxf && q.dxf.length > 50, `${name}: ${q.id} dxf non-empty`);
    }
    if (result.warnings.length) {
      console.log('warnings:', result.warnings);
    }
  } catch (err) {
    console.error('FAIL:', name, err && err.message);
    console.error(err && err.stack);
    process.exitCode = 1;
  }
}

const ctx = buildDefaultContext();
const allEmpty = {};
for (const f of ctx.fields) allEmpty[f.key] = '';

const symbols = { [CORNER_SYMBOLS_KEY]: {} };
for (const c of ['top_right', 'top_left', 'bottom_right', 'bottom_left']) {
  symbols[CORNER_SYMBOLS_KEY][c] = {
    type: 'sparkle4',
    count: 3,
    sides: 'both',
  };
}

runCase('all empty verses', allEmpty, {});
runCase('all empty + symbols', allEmpty, symbols);

const partial = { ...allEmpty, top_right_1: 'ברוך' };
runCase('one verse only + symbols', partial, symbols);

const missingKeys = { top_right_1: 'שלום' }; // other keys omitted
runCase('sparse values object', missingKeys, symbols);

const nullish = {};
for (const f of ctx.fields) nullish[f.key] = null;
runCase('null verse values', nullish, symbols);

if (!process.exitCode) console.log('\nAll empty-verse DXF checks passed.');
