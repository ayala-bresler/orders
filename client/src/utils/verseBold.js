/**
 * Bold range helpers for verse fields.
 * Ranges are half-open [start, end) in JavaScript string indices
 * (same as textarea selectionStart / selectionEnd).
 */

export function normalizeBoldRanges(ranges, textLen) {
  const len = Math.max(0, Number(textLen) || 0);
  if (!Array.isArray(ranges) || len <= 0) return [];
  const sorted = ranges
    .map((r) => {
      const start = Math.max(0, Math.min(len, Math.floor(Number(r?.start) || 0)));
      const end = Math.max(0, Math.min(len, Math.floor(Number(r?.end) || 0)));
      return { start: Math.min(start, end), end: Math.max(start, end) };
    })
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
    } else {
      merged.push({ start: r.start, end: r.end });
    }
  }
  return merged;
}

export function isRangeFullyBold(ranges, start, end, textLen) {
  const s = Math.max(0, Math.min(textLen, start));
  const e = Math.max(0, Math.min(textLen, end));
  if (e <= s) return false;
  const norm = normalizeBoldRanges(ranges, textLen);
  let covered = s;
  for (const r of norm) {
    if (r.end <= covered) continue;
    if (r.start > covered) return false;
    covered = Math.max(covered, r.end);
    if (covered >= e) return true;
  }
  return covered >= e;
}

export function isFullyBold(ranges, textLen) {
  const len = Math.max(0, Number(textLen) || 0);
  if (len <= 0) return false;
  return isRangeFullyBold(ranges, 0, len, len);
}

function subtractRange(ranges, start, end, textLen) {
  const norm = normalizeBoldRanges(ranges, textLen);
  const out = [];
  for (const r of norm) {
    if (r.end <= start || r.start >= end) {
      out.push(r);
      continue;
    }
    if (r.start < start) out.push({ start: r.start, end: start });
    if (r.end > end) out.push({ start: end, end: r.end });
  }
  return normalizeBoldRanges(out, textLen);
}

/**
 * Toggle bold on [start, end). If start===end (no selection), toggle the whole line.
 * If the target span is fully bold → remove bold; otherwise add bold.
 */
export function toggleBoldRanges(ranges, start, end, textLen) {
  const len = Math.max(0, Number(textLen) || 0);
  if (len <= 0) return [];
  let s = Math.floor(Number(start) || 0);
  let e = Math.floor(Number(end) || 0);
  if (e < s) [s, e] = [e, s];
  if (s === e) {
    s = 0;
    e = len;
  }
  s = Math.max(0, Math.min(len, s));
  e = Math.max(0, Math.min(len, e));
  if (e <= s) return normalizeBoldRanges(ranges, len);

  if (isRangeFullyBold(ranges, s, e, len)) {
    return subtractRange(ranges, s, e, len);
  }
  return normalizeBoldRanges([...(ranges || []), { start: s, end: e }], len);
}

/** Clamp / drop ranges after text edits (MVP: clamp to new length). */
export function clampBoldRangesToText(ranges, text) {
  return normalizeBoldRanges(ranges, String(text ?? '').length);
}

/** Split plain text into runs for SVG tspans / DXF glyph flags. */
export function boldRunsFromText(text, ranges) {
  const t = String(text ?? '');
  const len = t.length;
  const norm = normalizeBoldRanges(ranges, len);
  if (!len) return [];
  if (!norm.length) return [{ text: t, bold: false }];

  const runs = [];
  let i = 0;
  for (const r of norm) {
    if (i < r.start) runs.push({ text: t.slice(i, r.start), bold: false });
    runs.push({ text: t.slice(r.start, r.end), bold: true });
    i = r.end;
  }
  if (i < len) runs.push({ text: t.slice(i), bold: false });
  return runs.filter((r) => r.text);
}

/** Per-character bold flags aligned with JS string indices. */
export function boldFlagsForText(text, ranges) {
  const t = String(text ?? '');
  const flags = new Array(t.length).fill(false);
  for (const r of normalizeBoldRanges(ranges, t.length)) {
    for (let i = r.start; i < r.end; i += 1) flags[i] = true;
  }
  return flags;
}
