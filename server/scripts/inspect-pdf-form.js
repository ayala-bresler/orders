'use strict';

const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

async function main() {
  const pdfPath = path.resolve(__dirname, '..', 'templates', 'order-form.pdf');
  const bytes = fs.readFileSync(pdfPath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  const fields = form.getFields();
  console.log('field count:', fields.length);
  for (const field of fields) {
    const name = field.getName();
    const ctor = field.constructor.name;
    let value = '';
    try {
      if (typeof field.getText === 'function') value = field.getText();
      else if (typeof field.isChecked === 'function') value = String(field.isChecked());
    } catch {
      value = '(unreadable)';
    }
    console.log(`${ctor}\t${name}\t${value}`);
  }
  const pages = doc.getPages();
  console.log('pages:', pages.length);
  for (let i = 0; i < pages.length; i++) {
    const { width, height } = pages[i].getSize();
    console.log(`page ${i + 1}: ${width} x ${height}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
