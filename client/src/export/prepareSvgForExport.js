import { glyphPathD } from './glyphPaths.js';
import { getSessionToken } from '../utils/sessionAuth.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FONT_FAMILY = 'FbKidushPro';
const FONT_URL = '/api/template/font';

/** Corner orientation labels drawn on the template — not for laser DXF. */
const CORNER_LABELS = new Set([
  'ימין למעלה',
  'שמאל למעלה',
  'ימין למטה',
  'שמאל למטה',
]);

function normalizeCornerLabel(text) {
  return String(text || '')
    .replace(/[\u200e\u200f\u202a-\u202e]/g, '')
    .replace(/-/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isCornerLabelText(textEl) {
  if (textEl.querySelector('textPath')) return false;
  return CORNER_LABELS.has(normalizeCornerLabel(textEl.textContent));
}

let _fontPromise = null;
let _fontFacePromise = null;

function fontFetchHeaders() {
  const token = getSessionToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function parseFontSize(textEl) {
  const style = textEl.getAttribute('style') || '';
  const m = style.match(/font-size\s*:\s*([\d.]+)(?:px|pt)?/i);
  if (!m) return 16;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return 16;
  const unit = (style.match(/font-size\s*:\s*[\d.]+\s*(pt|px)/i) || [])[1];
  if (unit && unit.toLowerCase() === 'pt') return n / 0.75;
  return n;
}

/** Characters in the same order as getNumberOfChars() indices. */
function collectChars(textEl) {
  if (textEl.querySelector('textPath, tspan')) {
    const chars = [];
    for (const node of textEl.querySelectorAll('textPath, tspan')) {
      for (const ch of node.textContent || '') chars.push(ch);
    }
    return chars;
  }
  return [...(textEl.textContent || '')];
}

/** Browser layout → root SVG user space (position + tangent angle). */
function charLayout(textEl, index) {
  const svg = textEl.ownerSVGElement;
  const local = textEl.getStartPositionOfChar(index);
  const angleLocal = (textEl.getRotationOfChar(index) * Math.PI) / 180;

  if (!svg?.createSVGPoint || !textEl.getCTM) {
    return { x: local.x, y: local.y, angle: angleLocal };
  }

  const origin = svg.createSVGPoint();
  origin.x = local.x;
  origin.y = local.y;
  const pos = origin.matrixTransform(textEl.getCTM());

  const tangent = svg.createSVGPoint();
  tangent.x = local.x + Math.cos(angleLocal);
  tangent.y = local.y + Math.sin(angleLocal);
  const tip = tangent.matrixTransform(textEl.getCTM());
  const angle = Math.atan2(tip.y - pos.y, tip.x - pos.x);

  return { x: pos.x, y: pos.y, angle };
}

async function ensureExportFont() {
  if (!_fontFacePromise) {
    _fontFacePromise = (async () => {
      if (!document.fonts.check(`16px "${FONT_FAMILY}"`)) {
        const face = new FontFace(FONT_FAMILY, `url(${FONT_URL})`, {
          weight: '700',
          style: 'normal',
        });
        await face.load();
        document.fonts.add(face);
      }
      await document.fonts.load(`700 16px "${FONT_FAMILY}"`);
      await document.fonts.ready;
    })();
  }
  await _fontFacePromise;

  if (!_fontPromise) {
    const { parse: parseFont } = await import('opentype.js');
    _fontPromise = fetch(FONT_URL, { headers: fontFetchHeaders() }).then(async (res) => {
      if (!res.ok) throw new Error('לא ניתן לטעון את קובץ הפונט לייצוא.');
      return parseFont(await res.arrayBuffer());
    });
  }
  return _fontPromise;
}

function convertTextToPaths(liveText, font) {
  const n = liveText.getNumberOfChars();
  if (!n) return null;

  const fontSize = parseFontSize(liveText);
  const chars = collectChars(liveText);
  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('data-exported-text', 'true');

  for (let i = 0; i < n; i += 1) {
    const ch = chars[i];
    if (ch == null || ch === '\n') continue;

    const { x, y, angle } = charLayout(liveText, i);
    const d = glyphPathD(font, ch, fontSize, x, y, angle);
    if (!d) continue;

    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', '#241F1F');
    p.setAttribute('stroke', 'none');
    g.appendChild(p);
  }

  return g.childNodes.length ? g : null;
}

/**
 * Replace live preview text with vector paths — same layout as the browser shows.
 * No manual baseline, ring, or offset tweaks.
 */
export async function prepareSvgForExport({ liveSvg, guidePathIds = [] } = {}) {
  if (!liveSvg) throw new Error('אין תצוגה מקדימה לייצוא.');

  const font = await ensureExportFont();
  const guideSet = new Set(guidePathIds);

  const host = document.createElement('div');
  host.style.cssText =
    'position:fixed;left:-10000px;top:0;visibility:hidden;pointer-events:none';
  document.body.appendChild(host);

  const exportSvg = liveSvg.cloneNode(true);
  host.appendChild(exportSvg);

  const liveTexts = [...liveSvg.querySelectorAll('text')];
  const exportTexts = [...exportSvg.querySelectorAll('text')];

  for (let i = 0; i < liveTexts.length; i += 1) {
    const target = exportTexts[i];
    if (!target) continue;
    // Drop orientation labels before they become glyph paths.
    if (isCornerLabelText(liveTexts[i])) {
      target.remove();
      continue;
    }
    const paths = convertTextToPaths(liveTexts[i], font);
    if (paths) target.replaceWith(paths);
    else target.remove();
  }

  // Rings / frames — not needed for laser DXF
  for (const el of [
    ...exportSvg.querySelectorAll('circle, ellipse'),
  ]) {
    el.remove();
  }
  // Stroked ring paths (e.g. size 9) that are not textPath guides
  for (const path of [...exportSvg.querySelectorAll('path')]) {
    const id = path.getAttribute('id');
    if (id && guideSet.has(id)) continue;
    const style = path.getAttribute('style') || '';
    const fill = path.getAttribute('fill') || '';
    const stroke = path.getAttribute('stroke') || '';
    const fillNone =
      /fill\s*:\s*none/i.test(style) || fill === 'none' || (!fill && !/fill\s*:/i.test(style));
    const hasStroke =
      (/stroke\s*:\s*(?!none\b)[^;]+/i.test(style) && !/stroke\s*:\s*none/i.test(style)) ||
      (stroke && stroke !== 'none');
    if (fillNone && hasStroke) path.remove();
  }
  // Keep all <rect> cut markers — required in DXF
  for (const path of [...exportSvg.querySelectorAll('path[id]')]) {
    if (guideSet.has(path.getAttribute('id'))) path.remove();
  }

  const out = new XMLSerializer().serializeToString(exportSvg);
  host.remove();
  return out;
}
