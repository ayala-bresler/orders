'use strict';

/**
 * Offline sanity check for the SVG pipeline (no DB required):
 *  - master loads
 *  - all 8 editable text nodes are found
 *  - a customized render only changes the targeted verses
 *  - structural node counts are identical between master and customized copy
 */

const svgService = require('../src/services/svgService');
const { FIELDS } = require('../src/config/template');

function count(svg, tag) {
  return (svg.match(new RegExp(`<${tag}\\b`, 'g')) || []).length;
}

function assert(cond, msg) {
  if (!cond) {
    console.error('  FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('  ok:', msg);
  }
}

const master = svgService.loadMasterSvg();
console.log('Master loaded:', master.length, 'bytes\n');

console.log('Editable fields:');
const fields = svgService.extractEditableFields(master);
for (const f of fields) {
  console.log(`  [${f.found ? 'x' : ' '}] ${f.key.padEnd(16)} ${f.column.padEnd(28)} "${f.text}"`);
}
assert(fields.length === 8, 'exactly 8 editable fields defined');
assert(fields.every((f) => f.found), 'all 8 text nodes located in the master');
assert(fields.every((f) => f.text.length > 0), 'all 8 master verses are non-empty');

console.log('\nRender customized copy (change 2 verses):');
const values = {
  top_right_1: 'טקסט מותאם אישית ראשון',
  bottom_left_2: 'טקסט מותאם אישית שני',
};
const custom = svgService.renderCustomizedSvg(values);

assert(custom.includes('טקסט מותאם אישית ראשון'), 'custom verse 1 present');
assert(custom.includes('טקסט מותאם אישית שני'), 'custom verse 2 present');

// Untouched verses must survive.
const untouched = fields.find((f) => f.key === 'top_left_1');
assert(custom.includes(untouched.text), 'untouched verse preserved');

// Structure must be identical.
for (const tag of ['g', 'ellipse', 'rect', 'path', 'text', 'textPath']) {
  assert(count(master, tag) === count(custom, tag), `<${tag}> count unchanged`);
}

console.log('\nReject unknown / structural mutation attempts:');
try {
  svgService.renderCustomizedSvg({ evil_key: '<script>alert(1)</script>' });
  assert(false, 'unknown key should be rejected');
} catch (e) {
  assert(e.status === 400, 'unknown key rejected with 400');
}

console.log('\nField map columns:');
console.log('  ' + FIELDS.map((f) => f.column).join('\n  '));

if (process.exitCode) {
  console.log('\nVERIFY FAILED');
} else {
  console.log('\nVERIFY PASSED');
}
