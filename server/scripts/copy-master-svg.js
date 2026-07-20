'use strict';

const fs = require('fs');
const path = require('path');

const src = process.env.MASTER_SVG_SOURCE || 'Z:\\תיק מוצר\\documents\\order.svg';
const dst = path.resolve(__dirname, '..', 'templates', 'sizes', '12.svg');

const data = fs.readFileSync(src);
fs.writeFileSync(dst, data);
console.log(`Copied ${data.length} bytes from:\n  ${src}\nto:\n  ${dst}`);
