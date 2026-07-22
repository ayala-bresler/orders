'use strict';

/** RTL corner order in the verse editor. */
const VERSE_CORNER_ORDER = ['top_right', 'top_left', 'bottom_right', 'bottom_left'];

const VERSE_CORNER_LABELS = {
  top_right: 'ימין למעלה',
  top_left: 'שמאל למעלה',
  bottom_right: 'ימין למטה',
  bottom_left: 'שמאל למטה',
};

/** inner = upper arc, outer = lower arc (matches DB verse_*_text_1 / _2). */
const VERSE_RING_UPPER = 'inner';
const VERSE_RING_LOWER = 'outer';

const VERSE_RING_LABELS = {
  inner: 'עליון',
  outer: 'תחתון',
};

function verseFieldKey(corner, ring) {
  return `${corner}_${ring === VERSE_RING_LOWER ? '2' : '1'}`;
}

function columnForCornerRing(corner, ring) {
  if (!corner || !ring) return null;
  return `verse_${corner}_text_${ring === VERSE_RING_LOWER ? '2' : '1'}`;
}

/**
 * Map 8 textPath nodes in SVG document order to the standard corner grid:
 * ימין למעלה עליון/תחתון, שמאל למעלה…, ימין למטה…, שמאל למטה…
 */
function applyStandardEightVerseLayout(fields) {
  const editable = fields.filter((f) => f.type === 'textPath' && f.found !== false);
  if (editable.length !== 8) return fields;

  const sorted = [...editable].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  const assignByRef = new Map();

  sorted.forEach((field, idx) => {
    const corner = VERSE_CORNER_ORDER[Math.floor(idx / 2)];
    // Document pair order: first = עליון (inner/text_1), second = תחתון (outer/text_2).
    // Matches preview arcs, side form, DB columns, and PDF line order.
    const ring = idx % 2 === 0 ? VERSE_RING_UPPER : VERSE_RING_LOWER;
    assignByRef.set(field.href || field.key, { corner, ring, idx });
  });

  return fields
    .map((field) => {
      const assign = assignByRef.get(field.href || field.key);
      if (!assign) return field;
      const { corner, ring, idx } = assign;
      const cornerLabel = VERSE_CORNER_LABELS[corner];
      const ringLabel = VERSE_RING_LABELS[ring];
      return {
        ...field,
        key: verseFieldKey(corner, ring),
        corner,
        ring,
        group: corner,
        groupLabel: cornerLabel,
        label: `${cornerLabel} · ${ringLabel}`,
        sortOrder: idx,
        column: columnForCornerRing(corner, ring),
      };
    })
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
}

module.exports = {
  VERSE_CORNER_ORDER,
  VERSE_CORNER_LABELS,
  VERSE_RING_UPPER,
  VERSE_RING_LOWER,
  VERSE_RING_LABELS,
  verseFieldKey,
  columnForCornerRing,
  applyStandardEightVerseLayout,
};
