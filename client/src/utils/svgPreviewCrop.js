/** Preview-only crop padding (px in SVG user units) around registration squares. */
export const PREVIEW_CROP_PADDING_PX = 3;

/** Ignore tiny leftover rects (not the corner registration squares). */
const MIN_REGISTRATION_RECT_PX = 4;

/**
 * Bounding box of registration-marker <rect>s in the template.
 * Skips zero/tiny rects so a baked SVG cannot crop the preview to a speck.
 * @returns {{ minX: number, minY: number, maxX: number, maxY: number } | null}
 */
export function registrationMarkerBounds(svgRoot) {
  const rects = svgRoot?.querySelectorAll?.('rect');
  if (!rects?.length) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let used = 0;

  for (const rect of rects) {
    const x = Number.parseFloat(rect.getAttribute('x'));
    const y = Number.parseFloat(rect.getAttribute('y'));
    const w = Number.parseFloat(rect.getAttribute('width') || '0');
    const h = Number.parseFloat(rect.getAttribute('height') || '0');
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!(w >= MIN_REGISTRATION_RECT_PX) || !(h >= MIN_REGISTRATION_RECT_PX)) continue;
    used += 1;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
  }

  if (!used || !Number.isFinite(minX)) return null;
  // Crop only when we have a real frame (at least two corners / a wide span).
  if (maxX - minX < 40 || maxY - minY < 40) return null;
  return { minX, minY, maxX, maxY };
}

/** @returns {string | null} viewBox string for preview crop */
export function previewCropViewBox(svgRoot, padding = PREVIEW_CROP_PADDING_PX) {
  const bounds = registrationMarkerBounds(svgRoot);
  if (!bounds) return null;

  const x = bounds.minX - padding;
  const y = bounds.minY - padding;
  const w = bounds.maxX - bounds.minX + padding * 2;
  const h = bounds.maxY - bounds.minY + padding * 2;
  return `${x} ${y} ${w} ${h}`;
}

/**
 * Tighten preview framing to the area between corner registration squares.
 * Does not alter the serialized SVG — only the live DOM node in the preview.
 */
export function applyPreviewCrop(svgRoot, padding = PREVIEW_CROP_PADDING_PX) {
  const cropped = previewCropViewBox(svgRoot, padding);
  if (!cropped || !svgRoot) return;

  svgRoot.setAttribute('viewBox', cropped);
  svgRoot.setAttribute('preserveAspectRatio', 'xMidYMid meet');
}
