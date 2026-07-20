'use strict';

const fs = require('fs');
const path = require('path');
const { splitSvgIntoQuarters, QUARTER_DEFS } = require('../src/export/svgQuarterSplit');

const inputPath = process.argv[2];
const outputDir = process.argv[3];

if (!inputPath || !outputDir) {
  console.error('Usage: node scripts/split-svg-quarters.js <input.svg> <output-dir>');
  process.exit(1);
}

const raw = fs.readFileSync(path.resolve(inputPath), 'utf8');
const result = splitSvgIntoQuarters(raw);

fs.mkdirSync(path.resolve(outputDir), { recursive: true });

for (const def of QUARTER_DEFS) {
  const quarter = result.quarters[def.id];
  const outFile = path.join(path.resolve(outputDir), `${def.id}.svg`);
  fs.writeFileSync(outFile, quarter.svg, 'utf8');
  console.log(`Wrote ${outFile} (${def.label}) viewBox=${quarter.viewBox}`);
}

console.log('\nIntersection (original):', result.intersection.original);
console.log('Intersection (scaled):', {
  xMid: result.intersection.xMid,
  yMid: result.intersection.yMid,
});
console.log('Scale factor:', result.scaleFactor);
console.log('Analysis:', result.analysis);
console.log(`Flattened paths: ${result.flattenedPathCount}`);

if (result.warnings.length) {
  console.warn('\nWarnings:');
  for (const w of result.warnings) console.warn(`  - ${w}`);
}
