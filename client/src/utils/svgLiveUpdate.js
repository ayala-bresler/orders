import { normalizeVerseText } from './verseText.js';

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

/** Update only the bound text node for one field. */
export function applyFieldText(svgRoot, field, rawText) {
  const { textPath, textEl } = resolveFieldNodes(svgRoot, field);
  const text = normalizeVerseText(rawText);
  if (textPath) {
    textPath.textContent = text;
    return;
  }
  if (textEl) {
    textEl.textContent = text;
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

  const inner = svgRoot.parentElement;
  if (inner?.classList?.contains('svg-canvas-inner')) {
    inner.style.width = '';
    inner.style.height = '';
    const wrapper = inner.parentElement;
    if (wrapper?.classList?.contains('svg-canvas')) {
      wrapper.style.width = '';
      wrapper.style.height = '';
      delete wrapper.dataset.baseW;
      delete wrapper.dataset.baseH;
      delete wrapper.dataset.layoutSig;
    }
  }
}

/** Zoom at or below this value: fit in viewport, no scrolling. Above: pan/scroll. */
export const PREVIEW_SCROLL_ZOOM_THRESHOLD = 1;

export const MOBILE_PREVIEW_DEFAULT_ZOOM = 1.6;
export const DESKTOP_PREVIEW_DEFAULT_ZOOM = 1;
export const MOBILE_LAYOUT_MQ = '(max-width: 899px)';

export function getDefaultPreviewZoom() {
  if (typeof window === 'undefined') return DESKTOP_PREVIEW_DEFAULT_ZOOM;
  return window.matchMedia(MOBILE_LAYOUT_MQ).matches
    ? MOBILE_PREVIEW_DEFAULT_ZOOM
    : DESKTOP_PREVIEW_DEFAULT_ZOOM;
}

/** Parse viewBox "x y w h" → { w, h } or null. */
function parseViewBox(svgRoot) {
  const raw = svgRoot?.getAttribute?.('viewBox');
  if (!raw) return null;
  const nums = raw.trim().split(/[\s,]+/).map(Number);
  if (nums.length < 4 || !nums[2] || !nums[3]) return null;
  return { w: nums[2], h: nums[3] };
}

/** Stable preview area from the pane — not affected by scrollbars inside the viewport. */
function measurePreviewArea(wrapperEl) {
  const viewport = wrapperEl.closest('.preview-viewport');
  const pane = wrapperEl.closest('.preview-pane, .verse-preview-pane');
  const measureRoot = pane || viewport || wrapperEl;

  const rootStyle = window.getComputedStyle(measureRoot);
  const rootPadX =
    (parseFloat(rootStyle.paddingLeft) || 0) + (parseFloat(rootStyle.paddingRight) || 0);
  const rootPadY =
    (parseFloat(rootStyle.paddingTop) || 0) + (parseFloat(rootStyle.paddingBottom) || 0);

  let availW = measureRoot.clientWidth - rootPadX;
  let availH = measureRoot.clientHeight - rootPadY;

  if (pane) {
    const head = pane.querySelector('.preview-head');
    if (head) {
      const headStyle = window.getComputedStyle(head);
      availH -= head.offsetHeight;
      availH -= (parseFloat(headStyle.marginBottom) || 0);
    }
  }

  if (viewport) {
    const vpStyle = window.getComputedStyle(viewport);
    availW -= (parseFloat(vpStyle.paddingLeft) || 0) + (parseFloat(vpStyle.paddingRight) || 0);
    availH -= (parseFloat(vpStyle.paddingTop) || 0) + (parseFloat(vpStyle.paddingBottom) || 0);
  }

  return {
    availW: Math.max(0, availW),
    availH: Math.max(0, availH),
    viewport,
  };
}

function computeBaseFit(availW, availH, aspect) {
  if (availW / availH >= aspect) {
    const baseH = availH;
    return { baseW: aspect * baseH, baseH };
  }
  const baseW = availW;
  return { baseW, baseH: baseW / aspect };
}

function applyFitDimensions(svgRoot, wrapperEl, w, h) {
  svgRoot.style.height = `${h}px`;
  svgRoot.style.width = `${w}px`;
  svgRoot.style.maxHeight = 'none';
  svgRoot.style.maxWidth = 'none';
  svgRoot.style.display = 'block';

  const inner = wrapperEl.querySelector('.svg-canvas-inner') || svgRoot.parentElement;
  if (inner) {
    inner.style.width = `${w}px`;
    inner.style.height = `${h}px`;
  }
  wrapperEl.style.width = `${w}px`;
  wrapperEl.style.height = `${h}px`;
}

/**
 * Size SVG to fit inside the preview viewport (contain), then apply zoom.
 * At zoom ≤ PREVIEW_SCROLL_ZOOM_THRESHOLD: full image visible, no scroll.
 * Above threshold: scaled up with scroll (stable base size avoids scrollbar jitter).
 */
export function fitSvgToContainerHeight(svgRoot, wrapperEl, zoom = 1) {
  if (!svgRoot || !wrapperEl) return;

  const { availW, availH } = measurePreviewArea(wrapperEl);
  if (availW <= 0 || availH <= 0) return;

  const vb = parseViewBox(svgRoot);
  if (!vb) return;

  const aspect = vb.w / vb.h;
  const layoutSig = `${Math.round(availW)}x${Math.round(availH)}`;
  if (wrapperEl.dataset.layoutSig !== layoutSig) {
    delete wrapperEl.dataset.baseW;
    delete wrapperEl.dataset.baseH;
    wrapperEl.dataset.layoutSig = layoutSig;
  }

  let baseW = Number(wrapperEl.dataset.baseW);
  let baseH = Number(wrapperEl.dataset.baseH);
  if (!Number.isFinite(baseW) || !Number.isFinite(baseH) || baseW <= 0 || baseH <= 0) {
    const fit = computeBaseFit(availW, availH, aspect);
    baseW = fit.baseW;
    baseH = fit.baseH;
    wrapperEl.dataset.baseW = String(baseW);
    wrapperEl.dataset.baseH = String(baseH);
  }

  const zoomFactor = Number.isFinite(Number(zoom)) && Number(zoom) > 0 ? Number(zoom) : 1;
  let w = baseW * zoomFactor;
  let h = baseH * zoomFactor;

  if (zoomFactor <= PREVIEW_SCROLL_ZOOM_THRESHOLD) {
    if (w > availW) {
      w = availW;
      h = w / aspect;
    }
    if (h > availH) {
      h = availH;
      w = h * aspect;
    }
    w = Math.floor(w);
    h = Math.floor(h);
  } else {
    w = Math.round(w);
    h = Math.round(h);
  }

  applyFitDimensions(svgRoot, wrapperEl, w, h);
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
    applyFieldText(svgRoot, field, values[field.key] ?? '');
    const basePx = field.fontSizePx ?? 16;
    const style = styleForKeyFn(fontScales, field.key, basePx);
    applyFieldStyle(svgRoot, field, style);
  }
}
