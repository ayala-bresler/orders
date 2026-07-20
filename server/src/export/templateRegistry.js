'use strict';

const path = require('path');
const { FIELD_BY_HREF } = require('../config/template');

/** Medallion ring radii in order.svg (rx = ry, before corner transforms). */
const SVG_OUTER_RX = 168.66;
const SVG_INNER_RX = 147.4;
const SVG_RING_MID_RX = (SVG_OUTER_RX + SVG_INNER_RX) / 2;

/** Ellipse centers per corner medallion (order.svg). */
const MEDALLION_CENTERS = {
  top_right: { cx: 640.21, cy: 242.58 },
  top_left: { cx: 288.14, cy: 242.58 },
  bottom_right: { cx: 640.21, cy: 617.8 },
  bottom_left: { cx: 288.14, cy: 617.8 },
};

/** Single font used for all text → path conversion. */
const FONT_FILE = 'FbKidushPro-bold.otf';

const TEMPLATE = {
  id: 'order_default',
  svgOuterDiameter: SVG_OUTER_RX * 2,
  fontsDir: path.resolve(__dirname, '..', '..', 'fonts'),
  defaultFontFile: FONT_FILE,
  fontMap: {
    'FbKidushPro': FONT_FILE,
    'FbKidush-Bold': FONT_FILE,
    'FbKidushPro-bold': FONT_FILE,
  },
  /** Paths referenced by editable textPath nodes — not exported as geometry. */
  textPathHrefs: new Set(Object.keys(FIELD_BY_HREF)),
};

module.exports = { TEMPLATE, SVG_OUTER_RX, SVG_INNER_RX, SVG_RING_MID_RX, MEDALLION_CENTERS };
