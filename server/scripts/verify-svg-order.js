'use strict';
const fs = require('fs');
const path = require('path');
const { discoverSvgTextFields, enrichDiscoveredFields } = require('../src/utils/svgFieldDiscovery');
const { VERSE_CORNER_LABELS, VERSE_RING_LABELS } = require('../src/config/verseLayout');

const dir = path.join(__dirname, '../templates/sizes');
const expected = [
  'top_right_1', 'top_right_2', 'top_left_1', 'top_left_2',
  'bottom_right_1', 'bottom_right_2', 'bottom_left_1', 'bottom_left_2',
];

let ok = true;
for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.svg')).sort()) {
  const svg = fs.readFileSync(path.join(dir, name), 'utf8');
  const fields = enrichDiscoveredFields(discoverSvgTextFields(svg, []), svg);
  const keys = fields.map((f) => f.key);
  const match = keys.length === 8 && expected.every((k, i) => keys[i] === k);
  console.log(name, match ? 'OK' : 'MISMATCH', keys.join(', '));
  if (!match) ok = false;
  if (match) {
    console.log(' ', fields.map((f) => `${VERSE_CORNER_LABELS[f.corner]} ${VERSE_RING_LABELS[f.ring]}`).join(' | '));
  }
}
process.exitCode = ok ? 0 : 1;
