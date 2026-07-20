'use strict';

/**
 * Bake equal-margin ring-centered dy + dominant-baseline into SVG template files.
 *
 * Arc alignment (all sizes):
 *   - startOffset is always "50%" (text-anchor=middle → geometric midpoint of the path)
 *   - path `rotate(θ cx cy)` is adjusted so that midpoint sits at top-center (inner/upper)
 *     or bottom-center (outer/lower) of the medallion
 *
 * Radial centering (unchanged):
 *   TargetRadius = R_min + ((R_max − R_min) − H_font) / 2
 *   ink center   = TargetRadius + H_font / 2
 *
 * Run: node server/scripts/fix-svg-verse-ring-center.js [svg-or-dir...]
 * Runtime (editor, save, DXF) reads dy / rotate / startOffset from the file.
 */

const fs = require('fs');
const path = require('path');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const { discoverSvgTextFields, enrichDiscoveredFields } = require('../src/utils/svgFieldDiscovery');
const { analyzeSvgTemplate } = require('../src/utils/svgTemplateMeta');
const { extractSvgContent, pathGuidePoints } = require('../src/export/svgExtract');
const { computeRingCenteringDyEm, loadFont } = require('../src/export/svgText');

const DEFAULT_DIR = path.resolve(__dirname, '..', 'templates', 'sizes');
const FONT_SIZE_PX = 16;
const START_OFFSET = '50%';

function fmtEm(dyEm) {
  const em = Number(dyEm);
  if (!Number.isFinite(em)) return '0.4em';
  return `${em.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}em`;
}

function fmtAngle(deg) {
  const n = Math.round(Number(deg) * 100) / 100;
  if (!Number.isFinite(n)) return '0';
  return String(n);
}

function sampleAt(pts, cum, len, t) {
  const target = Math.max(0, Math.min(1, t)) * len;
  for (let i = 1; i < cum.length; i += 1) {
    if (cum[i] >= target) {
      const span = cum[i] - cum[i - 1] || 1;
      const u = (target - cum[i - 1]) / span;
      return [
        pts[i - 1][0] + u * (pts[i][0] - pts[i - 1][0]),
        pts[i - 1][1] + u * (pts[i][1] - pts[i - 1][1]),
      ];
    }
  }
  return pts[pts.length - 1];
}

function pathCumLength(pts) {
  const cum = [0];
  let len = 0;
  for (let i = 1; i < pts.length; i += 1) {
    len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    cum.push(len);
  }
  return { cum, len };
}

/** Angle (deg) of path midpoint relative to medallion center. SVG Y↓. */
function pathMidpointAngleDeg(pathGuide, cx, cy) {
  const pts = pathGuidePoints(pathGuide);
  if (pts.length < 2) return null;
  const { cum, len } = pathCumLength(pts);
  if (len < 1e-6) return null;
  const [x, y] = sampleAt(pts, cum, len, 0.5);
  return (Math.atan2(y - cy, x - cx) * 180) / Math.PI;
}

function normalizeDeltaDeg(delta) {
  let d = delta;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

/** Parse `rotate(θ [cx cy])` from a transform attribute (spaces or commas). */
function parseRotateTransform(raw) {
  const s = String(raw || '');
  const m = s.match(
    /rotate\s*\(\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*[, ]\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*[, ]\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*\)/i
  );
  if (m) {
    return { angle: Number(m[1]), cx: Number(m[2]), cy: Number(m[3]), raw: s };
  }
  const m2 = s.match(/rotate\s*\(\s*([-+]?\d*\.?\d+(?:e[-+]?\d+)?)\s*\)/i);
  if (m2) {
    return { angle: Number(m2[1]), cx: null, cy: null, raw: s };
  }
  return null;
}

/**
 * Adjust path rotate so startOffset=50% lands at top (inner) or bottom (outer).
 * Keeps the existing rotation pivot when present so radius is unchanged.
 */
function alignPathRotateToExtreme(pathEl, pathGuide, cx, cy, ring) {
  const midAng = pathMidpointAngleDeg(pathGuide, cx, cy);
  if (midAng == null) return null;

  const desired = ring === 'outer' ? 90 : -90;
  const delta = normalizeDeltaDeg(desired - midAng);
  if (Math.abs(delta) < 0.05) {
    // Still rewrite transform for consistent formatting / pivot.
    const existing = parseRotateTransform(pathEl.getAttribute('transform'));
    const rcx = existing?.cx ?? cx;
    const rcy = existing?.cy ?? cy;
    const ang = existing?.angle ?? 0;
    pathEl.setAttribute('transform', `rotate(${fmtAngle(ang)} ${rcx} ${rcy})`);
    return { midAng, desired, delta: 0, angle: ang };
  }

  const existing = parseRotateTransform(pathEl.getAttribute('transform'));
  const rcx = existing?.cx ?? cx;
  const rcy = existing?.cy ?? cy;
  const baseAng = existing?.angle ?? 0;
  const newAng = baseAng + delta;
  pathEl.setAttribute('transform', `rotate(${fmtAngle(newAng)} ${rcx} ${rcy})`);
  return { midAng, desired, delta, angle: newAng };
}

function parseFontSize(textEl) {
  const style = textEl.getAttribute('style') || '';
  const m = style.match(/font-size\s*:\s*([\d.]+)(?:px|pt)?/i);
  if (!m) return FONT_SIZE_PX;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return FONT_SIZE_PX;
  const unit = (style.match(/font-size\s*:\s*[\d.]+\s*(pt|px)/i) || [])[1];
  if (unit && unit.toLowerCase() === 'pt') return n / 0.75;
  return n;
}

function setFontSize(textEl, sizePx) {
  let style = textEl.getAttribute('style') || '';
  const px = `${Number(sizePx).toFixed(2)}px`;
  if (/font-size\s*:/i.test(style)) {
    style = style.replace(/font-size\s*:\s*[\d.]+(?:px|pt)/i, `font-size:${px}`);
  } else {
    if (style.trim() && !style.trim().endsWith(';')) style += ';';
    style += `font-size:${px};`;
  }
  textEl.setAttribute('style', style);
}

function readHref(node) {
  return node?.getAttribute?.('xlink:href') || node?.getAttribute?.('href') || '';
}

function findTextPath(doc, href) {
  const textPaths = doc.getElementsByTagName('textPath');
  for (let i = 0; i < textPaths.length; i += 1) {
    const node = textPaths.item(i);
    if (readHref(node) === href) return node;
  }
  return null;
}

function fixSvgFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const doc = new DOMParser().parseFromString(raw, 'image/svg+xml');
  const fields = enrichDiscoveredFields(discoverSvgTextFields(raw, []), raw);
  const verseFields = fields.filter((f) => f.type === 'textPath' && f.found !== false);

  if (verseFields.length !== 8) {
    return { filePath, skipped: true, reason: `expected 8 textPaths, found ${verseFields.length}` };
  }

  const meta = analyzeSvgTemplate(raw, fields);
  let { pathById } = extractSvgContent(doc);
  const font = loadFont('FbKidushPro-bold');
  if (!font) {
    throw new Error('Font FbKidushPro-bold not found — cannot compute ring centering.');
  }

  // Pass 1: rotate each guide so path midpoint = top/bottom extreme.
  const rotateNotes = [];
  for (const field of verseFields) {
    const href = field.href || '';
    const pathId = href.replace(/^#/, '');
    if (!pathId) continue;

    const pathEl = doc.getElementById(pathId);
    const pathGuide = pathById[pathId];
    const corner = field.corner || field.group;
    const center = meta.medallionCenters?.[corner];
    if (!pathEl || !pathGuide || !center) continue;

    const ring = field.ring || 'outer';
    const note = alignPathRotateToExtreme(pathEl, pathGuide, center.cx, center.cy, ring);
    if (note) rotateNotes.push({ key: field.key, ...note });
  }

  // Re-extract after rotate changes (path points include transform).
  ({ pathById } = extractSvgContent(doc));

  let updated = 0;
  for (const field of verseFields) {
    const href = field.href || '';
    const pathId = href.replace(/^#/, '');
    if (!pathId) continue;

    const textPath = findTextPath(doc, href);
    if (!textPath) continue;

    const textEl = textPath.parentNode;
    const pathGuide = pathById[pathId];
    const corner = field.corner || field.group;
    const center = meta.medallionCenters?.[corner];
    const radii = meta.ringRadii?.[corner];
    if (!textEl || !pathGuide || !center || !radii?.innerRx || !radii?.outerRx) continue;

    const defaultText = (textPath.textContent || '').trim();
    const fontSize = parseFontSize(textEl);
    setFontSize(textEl, fontSize);

    textPath.setAttribute('text-anchor', 'middle');
    textPath.setAttribute('startOffset', START_OFFSET);

    const dyEm = computeRingCenteringDyEm(font, defaultText, fontSize, {
      pathGuide,
      startOffset: START_OFFSET,
      textAnchor: 'middle',
      cx: center.cx,
      cy: center.cy,
      innerRx: radii.innerRx,
      outerRx: radii.outerRx,
      letterSpacingEm: 0,
    });

    textEl.setAttribute('dominant-baseline', 'central');
    textEl.setAttribute('alignment-baseline', 'middle');
    textEl.setAttribute('dy', fmtEm(dyEm));
    textPath.removeAttribute('dy');
    textPath.setAttribute('dominant-baseline', 'central');
    textPath.setAttribute('alignment-baseline', 'middle');
    updated += 1;
  }

  if (updated === 0) {
    return { filePath, skipped: true, reason: 'no fields updated' };
  }

  const out = new XMLSerializer().serializeToString(doc);
  fs.writeFileSync(filePath, out, 'utf8');
  return { filePath, updated, rotateNotes };
}

function collectTargets(argv) {
  if (!argv.length) return [DEFAULT_DIR];
  return argv;
}

function listSvgFiles(target) {
  const st = fs.statSync(target);
  if (st.isFile()) return [target];
  return fs
    .readdirSync(target)
    .filter((f) => f.toLowerCase().endsWith('.svg'))
    .map((f) => path.join(target, f))
    .sort();
}

function main() {
  const targets = collectTargets(process.argv.slice(2));
  let ok = 0;
  let total = 0;
  for (const target of targets) {
    for (const file of listSvgFiles(target)) {
      total += 1;
      const result = fixSvgFile(file);
      if (result.skipped) {
        console.log(`skip ${path.basename(file)} (${result.reason})`);
      } else {
        ok += 1;
        const big = (result.rotateNotes || []).filter((n) => Math.abs(n.delta) >= 1);
        const hint = big.length
          ? ` rotates: ${big.map((n) => `${n.key}${n.delta >= 0 ? '+' : ''}${n.delta.toFixed(1)}°`).join(', ')}`
          : '';
        console.log(`fixed ${path.basename(file)} (${result.updated} verses)${hint}`);
      }
    }
  }
  console.log(`Done. Updated ${ok}/${total} file(s).`);
}

main();
