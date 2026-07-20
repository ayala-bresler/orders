'use strict';

const svgService = require('../src/services/svgService');
const {
  exportQuartersFromRawSvg,
  buildQuartersZip,
} = require('../src/export/dxfExportService');

const raw = svgService.loadMasterSvg(require('../src/config/template').MASTER_SVG_PATH);
const result = exportQuartersFromRawSvg(raw);

console.log('quarters:', result.quarters.length);
let totalPaths = 0;
for (const q of result.quarters) {
  const pathTags = (q.svg.match(/<path\b/g) || []).length;
  totalPaths += pathTags;
  console.log(`  ${q.id} (${q.label}): ${pathTags} paths, ${q.dxf.length} bytes DXF`);
}
console.log('total paths across quarters:', totalPaths);
console.log('scale factor:', result.scaleFactor);
console.log('intersection scaled:', {
  xMid: result.intersection.xMid,
  yMid: result.intersection.yMid,
});
console.log('intersection original:', result.intersection.original);

const zip = buildQuartersZip(1, 1, result.quarters);
console.log('zip:', zip.length, 'bytes');
console.log('warnings:', result.warnings.length);
