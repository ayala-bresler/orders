/**
 * HTML <-> plain text + boldRanges for the verse rich input.
 */

import { boldRunsFromText, normalizeBoldRanges } from './verseBold.js';
import { normalizeVerseText } from './verseText.js';

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Build innerHTML from plain text + bold ranges (<b> for bold runs). */
export function verseHtmlFromState(text, boldRanges) {
  const t = String(text ?? '');
  if (!t) return '';
  const runs = boldRunsFromText(t, boldRanges);
  return runs
    .map((r) => {
      const esc = escapeHtml(r.text);
      return r.bold ? `<b>${esc}</b>` : esc;
    })
    .join('');
}

function isBoldElement(el) {
  if (!el || el.nodeType !== 1) return false;
  const tag = el.tagName.toLowerCase();
  if (tag === 'b' || tag === 'strong') return true;
  const fw = (el.style?.fontWeight || el.getAttribute?.('font-weight') || '').toString();
  if (fw === 'bold' || fw === 'bolder') return true;
  const n = parseInt(fw, 10);
  return Number.isFinite(n) && n >= 600;
}

/**
 * Walk a contentEditable root → plain text + boldRanges (UTF-16 indices).
 */
export function parseVerseEditable(root) {
  let text = '';
  const rawRanges = [];

  function walk(node, inheritedBold) {
    if (!node) return;
    if (node.nodeType === 3) {
      const chunk = node.nodeValue || '';
      if (!chunk) return;
      const start = text.length;
      text += chunk;
      if (inheritedBold) rawRanges.push({ start, end: text.length });
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'br') {
      text += ' ';
      return;
    }
    if (tag === 'div' || tag === 'p') {
      // Block break → space (verses are single-line)
      if (text.length && !/\s$/.test(text)) text += ' ';
    }
    const bold = inheritedBold || isBoldElement(node);
    for (let c = node.firstChild; c; c = c.nextSibling) walk(c, bold);
  }

  walk(root, false);
  const normalized = normalizeVerseText(text);
  // After normalizeVerseText, indices may shift slightly (newlines→space, collapse spaces).
  // Re-parse via length clamp is OK for MVP; prefer applying normalize then remapping
  // by rebuilding ranges against normalized string when lengths match.
  if (normalized === text) {
    return {
      text: normalized,
      boldRanges: normalizeBoldRanges(rawRanges, normalized.length),
    };
  }
  // Collapse whitespace in text while keeping bold flags per kept char.
  let out = '';
  const flags = [];
  const boldFlags = new Array(text.length).fill(false);
  for (const r of normalizeBoldRanges(rawRanges, text.length)) {
    for (let i = r.start; i < r.end; i += 1) boldFlags[i] = true;
  }
  let prevSpace = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const isSpace = /\s/.test(ch);
    if (isSpace) {
      if (!prevSpace) {
        out += ' ';
        flags.push(boldFlags[i]);
        prevSpace = true;
      }
    } else if (ch === '\r' || ch === '\n' || ch === '\t') {
      if (!prevSpace) {
        out += ' ';
        flags.push(boldFlags[i]);
        prevSpace = true;
      }
    } else {
      out += ch;
      flags.push(boldFlags[i]);
      prevSpace = false;
    }
  }
  const finalText = normalizeVerseText(out);
  // finalText should equal out for our collapse; rebuild ranges from flags
  const ranges = [];
  let i = 0;
  while (i < flags.length && i < finalText.length) {
    if (!flags[i]) {
      i += 1;
      continue;
    }
    const start = i;
    while (i < flags.length && i < finalText.length && flags[i]) i += 1;
    ranges.push({ start, end: i });
  }
  return {
    text: finalText.slice(0, flags.length),
    boldRanges: normalizeBoldRanges(ranges, Math.min(finalText.length, flags.length)),
  };
}

/** Character offsets of the current selection inside root (UTF-16 / toString length). */
export function getEditableSelectionOffsets(root) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
    return { start: 0, end: 0 };
  }
  const range = sel.getRangeAt(0);
  const preStart = range.cloneRange();
  preStart.selectNodeContents(root);
  preStart.setEnd(range.startContainer, range.startOffset);
  const start = preStart.toString().length;
  const preEnd = range.cloneRange();
  preEnd.selectNodeContents(root);
  preEnd.setEnd(range.endContainer, range.endOffset);
  const end = preEnd.toString().length;
  return start <= end ? { start, end } : { start: end, end: start };
}

/** Restore selection by character offsets inside root. */
export function setEditableSelectionOffsets(root, start, end) {
  if (!root) return;
  const sel = window.getSelection();
  if (!sel) return;
  const targetStart = Math.max(0, start);
  const targetEnd = Math.max(targetStart, end);

  let startNode = null;
  let startOff = 0;
  let endNode = null;
  let endOff = 0;
  let walked = 0;

  function visit(node) {
    if (node.nodeType === 3) {
      const len = (node.nodeValue || '').length;
      if (!startNode && walked + len >= targetStart) {
        startNode = node;
        startOff = targetStart - walked;
      }
      if (!endNode && walked + len >= targetEnd) {
        endNode = node;
        endOff = targetEnd - walked;
      }
      walked += len;
      return;
    }
    if (node.nodeType === 1) {
      for (let c = node.firstChild; c; c = c.nextSibling) {
        visit(c);
        if (startNode && endNode) return;
      }
    }
  }

  visit(root);
  if (!startNode) {
    // Place at end
    const range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
    return;
  }
  if (!endNode) {
    endNode = startNode;
    endOff = startOff;
  }
  const range = document.createRange();
  range.setStart(startNode, Math.min(startOff, startNode.nodeValue?.length ?? 0));
  range.setEnd(endNode, Math.min(endOff, endNode.nodeValue?.length ?? 0));
  sel.removeAllRanges();
  sel.addRange(range);
}
