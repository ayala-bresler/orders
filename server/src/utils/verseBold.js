'use strict';

/**
 * Bold range helpers for verse fields (server).
 * Keep in sync with client/src/utils/verseBold.js
 */

function normalizeBoldRanges(ranges, textLen) {
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

function boldRunsFromText(text, ranges) {
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

function boldFlagsForText(text, ranges) {
  const t = String(text ?? '');
  const flags = new Array(t.length).fill(false);
  for (const r of normalizeBoldRanges(ranges, t.length)) {
    for (let i = r.start; i < r.end; i += 1) flags[i] = true;
  }
  return flags;
}

module.exports = {
  normalizeBoldRanges,
  boldRunsFromText,
  boldFlagsForText,
};
