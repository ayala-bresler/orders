'use strict';

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const TEMPLATE = path.resolve(__dirname, '..', 'templates', 'order-form.pdf');
const FONT = path.resolve(__dirname, '..', 'fonts', 'NotoSansHebrew.ttf');

async function main() {
  const bytes = fs.readFileSync(TEMPLATE);
  const doc = await PDFDocument.load(bytes);
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(fs.readFileSync(FONT));
  const form = doc.getForm();
  form.updateFieldAppearances(font);
  const tf = form.getTextField('Text Field 1');
  tf.setText('שלום');
  tf.updateAppearances(font);
  const out = await doc.save();
  const outPath = path.resolve(__dirname, '..', 'fonts', 'test-hebrew.pdf');
  fs.writeFileSync(outPath, out);
  console.log('ok', outPath, out.length);
}

main().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
