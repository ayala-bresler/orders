'use strict';

/** Audit full-verse ink fit vs inner/outer rings for every size template. */

const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const { discoverSvgTextFields, enrichDiscoveredFields } = require('../src/utils/svgFieldDiscovery');
const { analyzeSvgTemplate } = require('../src/utils/svgTemplateMeta');
const { extractSvgContent } = require('../src/export/svgExtract');
const {
  loadFont,
  computeRingCenteringDyEm,
  measureVerseInkRadialBounds,
  measureVerseInkHeight,
  ringTargetRadiusPx,
} = require('../src/export/svgText');

const SIZES_DIR = path.resolve(__dirname, '..', 'templates', 'sizes');
const FONT_SIZE = 16;
const PAD = 0.6;

function readHref(node) {
  return node?.getAttribute?.('xlink:href') || node?.getAttribute?.('href') || '';
}

function parseDyEm(raw, fontSize) {
  if (!raw) return 0;
  const s = String(raw).trim();
  if (s.endsWith('em')) return parseFloat(s) * fontSize;
  if (s.endsWith('px')) return parseFloat(s);
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function auditFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml');
  const fields = enrichDiscoveredFields(discoverSvgTextFields(raw, []), raw);
  const verses = fields.filter((f) => f.type === 'textPath' && f.found !== false);
  const meta = analyzeSvgTemplate(raw, fields);
  const { pathById } = extractSvgContent(doc);
  const font = loadFont('FbKidushPro-bold');
  const rows = [];

  for (const field of verses) {
    const pathId = (field.href || '').replace(/^#/, '');
    const pathGuide = pathById[pathId];
    const corner = field.corner || field.group;
    const center = meta.medallionCenters?.[corner];
    const radii = meta.ringRadii?.[corner];
    if (!pathGuide || !center || !radii) continue;

    let textPath = null;
    const tps = doc.getElementsByTagName('textPath');
    for (let i = 0; i < tps.length; i += 1) {
      if (readHref(tps.item(i)) === field.href) textPath = tps.item(i);
    }
    if (!textPath) continue;

    const textEl = textPath.parentNode;
    const text = (textPath.textContent || '').trim();
    const layout = {
      pathGuide,
      startOffset: textPath.getAttribute('startOffset') || '0',
      textAnchor: textPath.getAttribute('text-anchor') || 'start',
      cx: center.cx,
      cy: center.cy,
      innerRx: radii.innerRx,
      outerRx: radii.outerRx,
    };
    const dyPx = parseDyEm(textEl.getAttribute('dy'), FONT_SIZE);
    const bounds = measureVerseInkRadialBounds(
      font,
      text,
      FONT_SIZE,
      pathGuide,
      layout.startOffset,
      layout.textAnchor,
      dyPx,
      center.cx,
      center.cy,
      0
    );
    const H = measureVerseInkHeight(font, text, FONT_SIZE);
    const rTarget = ringTargetRadiusPx(radii.innerRx, radii.outerRx, H);
    const fitEm = computeRingCenteringDyEm(font, text, FONT_SIZE, layout);
    const rMid = bounds ? (bounds.rMin + bounds.rMax) / 2 : null;
    const midErr = rMid != null ? rMid - rTarget : null;

    rows.push({
      corner,
      ring: field.ring,
      inner: radii.innerRx,
      outer: radii.outerRx,
      dyEm: textEl.getAttribute('dy'),
      fitEm,
      rTarget,
      rMid,
      midErr,
      rInkMin: bounds?.rMin,
      rInkMax: bounds?.rMax,
      overflowOut: bounds ? bounds.rMax - radii.outerRx + PAD : null,
      overflowIn: bounds ? radii.innerRx + PAD - bounds.rMin : null,
    });
  }

  return { file: path.basename(filePath), rows };
}

function main() {
  const files = fs.readdirSync(SIZES_DIR).filter((n) => n.endsWith('.svg')).sort();
  let badOut = 0;
  let badMid = 0;
  for (const f of files) {
    const { rows } = auditFile(path.join(SIZES_DIR, f));
    console.log(`\n=== ${f} ===`);
    for (const r of rows) {
      const out = r.overflowOut > 0.05 ? ` OUT+${r.overflowOut.toFixed(2)}` : '';
      const inn = r.overflowIn > 0.05 ? ` IN+${r.overflowIn.toFixed(2)}` : '';
      const mid = Math.abs(r.midErr || 0) > 0.35 ? ` MIDΔ${r.midErr.toFixed(2)}` : '';
      if (out) badOut += 1;
      if (mid) badMid += 1;
      console.log(
        `${r.corner}/${r.ring} rings=[${r.inner.toFixed(1)},${r.outer.toFixed(1)}] ` +
          `target=${r.rTarget.toFixed(1)} inkMid=${r.rMid?.toFixed(1)} ` +
          `ink=[${r.rInkMin?.toFixed(1)},${r.rInkMax?.toFixed(1)}] dy=${r.dyEm} ` +
          `fit=${r.fitEm.toFixed(4)}em${out}${inn}${mid}`
      );
    }
  }
  console.log(`\n${badOut} outer-ring overflow(s), ${badMid} mid-radius miss(es) >0.35px.`);
}

main();
