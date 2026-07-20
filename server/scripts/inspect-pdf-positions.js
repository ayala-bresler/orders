'use strict';

const fs = require('fs');
const path = require('path');
const { PDFDocument, PDFName } = require('pdf-lib');

async function main() {
  const pdfPath = path.resolve(__dirname, '..', 'templates', 'order-form.pdf');
  const bytes = fs.readFileSync(pdfPath);
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true });
  const form = doc.getForm();
  const page = doc.getPages()[0];
  const { height: pageH } = page.getSize();

  for (const field of form.getFields()) {
    const name = field.getName();
    const widgets = field.acroField.getWidgets();
    for (const w of widgets) {
      const rect = w.getRectangle();
      const yTop = pageH - rect.y - rect.height;
      console.log(
        JSON.stringify({
          name,
          type: field.constructor.name.replace('PDF', ''),
          x: Math.round(rect.x),
          y: Math.round(yTop),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        })
      );
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
