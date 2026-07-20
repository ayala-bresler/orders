'use strict';

/** Normalize verse input — single line only; preserve trailing spaces (no trim). */
function normalizeVerseText(raw) {
  return String(raw ?? '')
    .replace(/\r\n/g, ' ')
    .replace(/\r/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/\t/g, ' ')
    .replace(/ {2,}/g, ' ');
}

module.exports = {
  normalizeVerseText,
};
