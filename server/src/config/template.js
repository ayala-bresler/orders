'use strict';

/**
 * SVG template configuration.
 *
 * Per-size templates live under server/templates/sizes/.
 * The ONLY editable parts are the eight curved verse strings on <textPath>.
 *
 * Ring convention (per corner medallion):
 *   text_1 = inner ring verse (upper arc)
 *   text_2 = outer ring verse (lower arc)
 */

const path = require('path');

// Fallback when no product size is resolved (dev/tests). Override with env in prod.
const BUNDLED_MASTER = path.resolve(__dirname, '..', '..', 'templates', 'sizes', '12.svg');
const MASTER_SVG_PATH = process.env.MASTER_SVG_PATH || BUNDLED_MASTER;

/**
 * The 8 editable fields.
 * - key:      stable field key used by the API/UI
 * - column:   destination column on order_items
 * - corner:   which medallion (top_right | top_left | bottom_right | bottom_left)
 * - ring:     inner | outer
 * - href:     the xlink:href value of the <textPath> in the master SVG
 * - label:    human-readable Hebrew label for the UI
 */
const FIELDS = [
  {
    key: 'top_right_1',
    column: 'verse_top_right_text_1',
    corner: 'top_right',
    ring: 'inner',
    href: '#SVGID_x5F_1_x5F_',
    label: 'ימין למעלה · טבעת פנימית',
  },
  {
    key: 'top_right_2',
    column: 'verse_top_right_text_2',
    corner: 'top_right',
    ring: 'outer',
    href: '#SVGID_x5F_00000042739086170294597130000008421388898778421434_x5F_',
    label: 'ימין למעלה · טבעת חיצונית',
  },
  {
    key: 'top_left_1',
    column: 'verse_top_left_text_1',
    corner: 'top_left',
    ring: 'inner',
    href: '#SVGID_x5F_00000123404221532655691870000016885861311901042099_x5F_',
    label: 'שמאל למעלה · טבעת פנימית',
  },
  {
    key: 'top_left_2',
    column: 'verse_top_left_text_2',
    corner: 'top_left',
    ring: 'outer',
    href: '#SVGID_x5F_00000137094688694433255300000000253766141101609663_x5F_',
    label: 'שמאל למעלה · טבעת חיצונית',
  },
  {
    key: 'bottom_right_1',
    column: 'verse_bottom_right_text_1',
    corner: 'bottom_right',
    ring: 'inner',
    href: '#SVGID_x5F_00000050652039550397022970000016903594535339344006_x5F_',
    label: 'ימין למטה · טבעת פנימית',
  },
  {
    key: 'bottom_right_2',
    column: 'verse_bottom_right_text_2',
    corner: 'bottom_right',
    ring: 'outer',
    href: '#SVGID_x5F_00000137832376926140511820000017915223820749522354_x5F_',
    label: 'ימין למטה · טבעת חיצונית',
  },
  {
    key: 'bottom_left_1',
    column: 'verse_bottom_left_text_1',
    corner: 'bottom_left',
    ring: 'inner',
    href: '#SVGID_x5F_00000094607761993563898200000005929923840889637553_x5F_',
    label: 'שמאל למטה · טבעת פנימית',
  },
  {
    key: 'bottom_left_2',
    column: 'verse_bottom_left_text_2',
    corner: 'bottom_left',
    ring: 'outer',
    href: '#SVGID_x5F_00000119084054513447627200000011175409375864812935_x5F_',
    label: 'שמאל למטה · טבעת חיצונית',
  },
];

const FIELD_BY_KEY = Object.freeze(
  Object.fromEntries(FIELDS.map((f) => [f.key, f]))
);
const FIELD_BY_HREF = Object.freeze(
  Object.fromEntries(FIELDS.map((f) => [f.href, f]))
);
const FIELD_BY_COLUMN = Object.freeze(
  Object.fromEntries(FIELDS.map((f) => [f.column, f]))
);

const EDITABLE_COLUMNS = FIELDS.map((f) => f.column);

module.exports = {
  MASTER_SVG_PATH,
  BUNDLED_MASTER,
  FIELDS,
  FIELD_BY_KEY,
  FIELD_BY_HREF,
  FIELD_BY_COLUMN,
  EDITABLE_COLUMNS,
};
