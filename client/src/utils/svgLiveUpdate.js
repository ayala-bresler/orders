import { normalizeVerseText } from './verseText.js';
import { boldRunsFromText } from './verseBold.js';

function readHref(node) {
  return node?.getAttribute?.('xlink:href') || node?.getAttribute?.('href') || '';
}

/**
 * Locate the live DOM node(s) for a discovered field.
 * @param {SVGElement} svgRoot
 * @param {object} field
 */
export function resolveFieldNodes(svgRoot, field) {
  if (!svgRoot || !field) return { textPath: null, textEl: null };

  if (field.href) {
    const href = field.href;
    const textPaths = svgRoot.querySelectorAll('textPath');
    for (const textPath of textPaths) {
      const nodeHref = readHref(textPath);
      if (nodeHref === href) {
        return { textPath, textEl: textPath.parentNode };
      }
    }
  }

  if (field.key) {
    const byId = svgRoot.querySelector(`#${CSS.escape(field.key)}`);
    if (byId) {
      if (byId.tagName?.toLowerCase() === 'textpath') {
        return { textPath: byId, textEl: byId.parentNode };
      }
      if (byId.tagName?.toLowerCase() === 'text') {
        const textPath = byId.querySelector('textPath');
        return { textPath, textEl: byId };
      }
    }
  }

  return { textPath: null, textEl: null };
}

function setStyleProp(textEl, prop, value, pattern, replacement) {
  if (!textEl) return;
  let style = textEl.getAttribute('style') || '';
  if (value == null || value === '') {
    if (pattern.test(style)) {
      style = style.replace(pattern, '');
      textEl.setAttribute('style', style.trim());
    }
    return;
  }
  if (pattern.test(style)) {
    style = style.replace(pattern, replacement);
  } else {
    if (style.trim() && !style.trim().endsWith(';')) style += ';';
    style += replacement;
  }
  textEl.setAttribute('style', style);
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Fill a textPath (or text) with plain text or bold tspans. */
function setNodeTextRuns(node, text, boldRanges) {
  if (!node) return;
  while (node.firstChild) node.removeChild(node.firstChild);
  const runs = boldRunsFromText(text, boldRanges);
  if (!runs.length) {
    node.appendChild(document.createTextNode(''));
    return;
  }
  const anyBold = runs.some((r) => r.bold);
  if (!anyBold) {
    node.appendChild(document.createTextNode(text));
    return;
  }
  for (const run of runs) {
    const tspan = document.createElementNS(SVG_NS, 'tspan');
    if (run.bold) {
      tspan.setAttribute('font-weight', '700');
      // Synthetic thicken — base font face is already Bold OTF.
      tspan.setAttribute('stroke', 'currentColor');
      tspan.setAttribute('stroke-width', '0.45');
      tspan.setAttribute('paint-order', 'stroke fill');
      tspan.setAttribute('stroke-linejoin', 'round');
    } else {
      tspan.setAttribute('font-weight', '400');
    }
    tspan.textContent = run.text;
    node.appendChild(tspan);
  }
}

/** Update only the bound text node for one field. */
export function applyFieldText(svgRoot, field, rawText, boldRanges) {
  const { textPath, textEl } = resolveFieldNodes(svgRoot, field);
  const text = normalizeVerseText(rawText);
  if (textPath) {
    setNodeTextRuns(textPath, text, boldRanges);
    return;
  }
  if (textEl) {
    setNodeTextRuns(textEl, text, boldRanges);
  }
}

/** Apply font-size and letter-spacing on the parent <text> element. */
export function applyFieldStyle(svgRoot, field, { fontSizePx, letterSpacingEm } = {}) {
  const { textEl } = resolveFieldNodes(svgRoot, field);
  if (!textEl) return;

  if (fontSizePx != null && Number.isFinite(Number(fontSizePx))) {
    const px = `${Number(fontSizePx).toFixed(2)}px`;
    setStyleProp(
      textEl,
      'font-size',
      px,
      /font-size\s*:\s*[\d.]+(?:px|pt)/i,
      `font-size:${px}`
    );
  }

  if (letterSpacingEm != null && Number.isFinite(Number(letterSpacingEm))) {
    const em = Number(letterSpacingEm);
    if (Math.abs(em) < 0.0001) {
      setStyleProp(textEl, 'letter-spacing', null, /letter-spacing\s*:\s*[^;]+;?/i, '');
    } else {
      const val = `${em.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}em`;
      setStyleProp(
        textEl,
        'letter-spacing',
        val,
        /letter-spacing\s*:\s*[^;]+/i,
        `letter-spacing:${val}`
      );
    }
  }
}

/** Clear pixel dimensions applied for on-screen height-fit (e.g. before print). */
export function clearSvgFitDimensions(svgRoot) {
  if (!svgRoot) return;
  svgRoot.style.height = '';
  svgRoot.style.width = '';
  svgRoot.style.maxHeight = '';
  svgRoot.style.maxWidth = '';
  svgRoot.style.minHeight = '';
  svgRoot.style.minWidth = '';

  const inner = svgRoot.parentElement;
  if (inner?.classList?.contains('svg-canvas-inner')) {
    inner.style.width = '';
    inner.style.height = '';
    inner.style.maxWidth = '';
    inner.style.maxHeight = '';
    inner.style.minWidth = '';
    inner.style.minHeight = '';
    const wrapper = inner.parentElement;
    if (wrapper?.classList?.contains('svg-canvas')) {
      wrapper.style.width = '';
      wrapper.style.height = '';
      wrapper.style.maxWidth = '';
      wrapper.style.maxHeight = '';
      wrapper.style.minWidth = '';
      wrapper.style.minHeight = '';
      delete wrapper.dataset.baseW;
      delete wrapper.dataset.baseH;
      delete wrapper.dataset.layoutSig;
      delete wrapper.dataset.overflow;
    }
  }
}

/** Zoom at or below this: fit in viewport, no scrolling. */
export const PREVIEW_SCROLL_ZOOM_THRESHOLD = 1.1;
/** Above this zoom: enable vertical scrollbar. */
export const PREVIEW_SCROLL_Y_ZOOM = 1.1;
/** Above this zoom: enable horizontal scrollbar. */
export const PREVIEW_SCROLL_X_ZOOM = 1.4;

/** Preview zoom starts at true 100% on all layouts. */
export const MOBILE_PREVIEW_DEFAULT_ZOOM = 1;
export const DESKTOP_PREVIEW_DEFAULT_ZOOM = 1;
export const MOBILE_LAYOUT_MQ = '(max-width: 899px)';

export function isMobileLayout() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_LAYOUT_MQ).matches;
}

export function getDefaultPreviewZoom() {
  if (typeof window === 'undefined') return DESKTOP_PREVIEW_DEFAULT_ZOOM;
  return isMobileLayout() ? MOBILE_PREVIEW_DEFAULT_ZOOM : DESKTOP_PREVIEW_DEFAULT_ZOOM;
}

/** Parse viewBox "x y w h" → { w, h } or null. */
function parseViewBox(svgRoot) {
  const raw = svgRoot?.getAttribute?.('viewBox');
  if (!raw) return null;
  const nums = raw.trim().split(/[\s,]+/).map(Number);
  if (nums.length < 4 || !nums[2] || !nums[3]) return null;
  return { w: nums[2], h: nums[3] };
}

function cssPaddingXY(style) {
  return {
    padX: (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0),
    padY: (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0),
  };
}

/**
 * Available preview box in CSS pixels.
 * Mobile: width-first (full content column) so the SVG can hug width and
 * the pane can shrink-wrap height (no empty top/bottom bands).
 */
function measurePreviewArea(wrapperEl) {
  const viewport = wrapperEl.closest('.preview-viewport');
  const pane = wrapperEl.closest('.preview-pane, .verse-preview-pane');
  const mobile = isMobileLayout();

  const boxEl = viewport || pane || wrapperEl;
  const boxStyle = window.getComputedStyle(boxEl);
  const { padX, padY } = cssPaddingXY(boxStyle);
  const rect = boxEl.getBoundingClientRect();

  const cssPx = (value) => {
    const n = parseFloat(value);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  const FALLBACK_W = Math.min(Math.round(window.innerWidth - (mobile ? 16 : 32)), 480);
  const widthEl = (mobile && pane) ? pane : boxEl;
  const widthStyle = mobile && pane ? window.getComputedStyle(pane) : boxStyle;
  const widthPadX = mobile && pane ? cssPaddingXY(widthStyle).padX : padX;
  const widthRect = widthEl.getBoundingClientRect();
  let availW = Math.max(
    0,
    (widthEl.clientWidth || widthRect.width || 0) - widthPadX
  );

  let availH = Math.max(0, (boxEl.clientHeight || 0) - padY);
  const cssH = cssPx(boxStyle.height);
  if (cssH > 0) {
    availH = Math.max(availH, cssH - padY);
  }

  if (pane && boxEl === pane && !mobile) {
    const head = pane.querySelector('.preview-head');
    if (head) {
      const headStyle = window.getComputedStyle(head);
      availH -= head.offsetHeight;
      availH -= parseFloat(headStyle.marginBottom) || 0;
    }
  }

  if (!mobile) {
    const minHCss = cssPx(boxStyle.minHeight);
    const maxHCss = cssPx(boxStyle.maxHeight);
    if (minHCss > 0) {
      availH = Math.max(availH, minHCss - padY);
    }
    if (maxHCss > 0) {
      availH = availH > 0 ? Math.min(availH, maxHCss - padY) : maxHCss - padY;
    }
  }

  if (!(availW > 40)) {
    availW = FALLBACK_W;
  }

  if (mobile) {
    // Tall virtual height → width-limited fit; pane height follows the SVG.
    availH = Math.max(availW * 2, 400);
  } else {
    const FALLBACK_H = Math.min(Math.round(window.innerHeight * 0.45), 400);
    if (!(availH > 40)) {
      availH = FALLBACK_H;
    }
  }

  const inset = mobile ? 2 : 4;
  return {
    availW: Math.max(0, Math.floor(availW - inset)),
    availH: Math.max(0, Math.floor(availH - inset)),
    viewport,
    mobile,
  };
}

function computeBaseFit(availW, availH, aspect) {
  if (availW <= 0 || availH <= 0) return { baseW: 0, baseH: 0 };
  if (availW / availH >= aspect) {
    const baseH = availH;
    return { baseW: aspect * baseH, baseH };
  }
  const baseW = availW;
  return { baseW, baseH: baseW / aspect };
}

function applyFitDimensions(svgRoot, wrapperEl, w, h, { allowOverflow = false } = {}) {
  const widthPx = `${w}px`;
  const heightPx = `${h}px`;

  svgRoot.style.height = heightPx;
  svgRoot.style.width = widthPx;
  svgRoot.style.maxHeight = heightPx;
  svgRoot.style.maxWidth = widthPx;
  svgRoot.style.minHeight = heightPx;
  svgRoot.style.minWidth = widthPx;
  svgRoot.style.display = 'block';

  const inner = wrapperEl.querySelector('.svg-canvas-inner') || svgRoot.parentElement;
  if (inner) {
    inner.style.width = widthPx;
    inner.style.height = heightPx;
    inner.style.minWidth = widthPx;
    inner.style.minHeight = heightPx;
    if (allowOverflow) {
      inner.style.maxWidth = 'none';
      inner.style.maxHeight = 'none';
    } else {
      inner.style.maxWidth = widthPx;
      inner.style.maxHeight = heightPx;
    }
  }

  wrapperEl.style.width = widthPx;
  wrapperEl.style.height = heightPx;
  wrapperEl.style.minWidth = widthPx;
  wrapperEl.style.minHeight = heightPx;
  if (allowOverflow) {
    // Let zoomed content exceed the viewport so overflow can scroll both axes.
    wrapperEl.style.maxWidth = 'none';
    wrapperEl.style.maxHeight = 'none';
    wrapperEl.dataset.overflow = '1';
  } else {
    wrapperEl.style.maxWidth = '100%';
    wrapperEl.style.maxHeight = isMobileLayout() ? heightPx : '100%';
    delete wrapperEl.dataset.overflow;
  }
}

/**
 * Size SVG to fit inside the preview viewport (contain), then apply zoom.
 * At zoom ≤ PREVIEW_SCROLL_ZOOM_THRESHOLD (100%): full image visible, no scroll.
 * Mobile 100%: width-filling contain-fit (as large as possible within width).
 * Above threshold: scaled up with scroll.
 */
export function fitSvgToContainerHeight(svgRoot, wrapperEl, zoom = 1) {
  if (!svgRoot || !wrapperEl) return;

  const { availW, availH } = measurePreviewArea(wrapperEl);
  if (availW <= 0 || availH <= 0) return;

  const vb = parseViewBox(svgRoot);
  if (!vb) return;

  const aspect = vb.w / vb.h;
  const zoomFactor = Number.isFinite(Number(zoom)) && Number(zoom) > 0 ? Number(zoom) : 1;

  // At <110%: always recompute contain-fit from the live screen box.
  if (zoomFactor < PREVIEW_SCROLL_Y_ZOOM) {
    const fit = computeBaseFit(availW, availH, aspect);
    const w = Math.max(1, Math.floor(fit.baseW));
    const h = Math.max(1, Math.floor(fit.baseH));
    wrapperEl.dataset.baseW = String(fit.baseW);
    wrapperEl.dataset.baseH = String(fit.baseH);
    wrapperEl.dataset.layoutSig = `${Math.round(availW)}x${Math.round(availH)}`;
    applyFitDimensions(svgRoot, wrapperEl, w, h, { allowOverflow: false });
    return;
  }

  // Zoomed (≥110%): keep a stable base from the last fit-to-screen size.
  // Never invalidate base while zoomed — scrollbar gutter would shrink availW/H
  // and collapse overflow, which removes the scrollbars.
  let baseW = Number(wrapperEl.dataset.baseW);
  let baseH = Number(wrapperEl.dataset.baseH);
  if (!Number.isFinite(baseW) || !Number.isFinite(baseH) || baseW <= 0 || baseH <= 0) {
    const fit = computeBaseFit(availW, availH, aspect);
    baseW = fit.baseW;
    baseH = fit.baseH;
    wrapperEl.dataset.baseW = String(baseW);
    wrapperEl.dataset.baseH = String(baseH);
  }

  applyFitDimensions(
    svgRoot,
    wrapperEl,
    Math.round(baseW * zoomFactor),
    Math.round(baseH * zoomFactor),
    { allowOverflow: true }
  );
}

/** Prepare SVG root for responsive display without altering internal coordinates. */
export function prepareSvgForDisplay(svgRoot) {
  if (!svgRoot) return;

  if (!svgRoot.dataset.originalViewBox) {
    const viewBox = svgRoot.getAttribute('viewBox');
    if (viewBox) svgRoot.dataset.originalViewBox = viewBox;
  }

  svgRoot.removeAttribute('width');
  svgRoot.removeAttribute('height');
  svgRoot.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svgRoot.style.display = 'block';
  svgRoot.style.direction = 'ltr';
  svgRoot.style.width = '';
  svgRoot.style.height = '';
  svgRoot.style.maxWidth = '';
  svgRoot.style.maxHeight = '';
}

/** Apply all current values/styles to the live SVG DOM. */
export function syncSvgFromState(svgRoot, fields, values, fontScales, styleForKeyFn) {
  if (!svgRoot || !fields?.length) return;
  for (const field of fields) {
    const basePx = field.fontSizePx ?? 16;
    const style = styleForKeyFn(fontScales, field.key, basePx);
    applyFieldText(svgRoot, field, values[field.key] ?? '', style.boldRanges);
    applyFieldStyle(svgRoot, field, style);
  }
}
