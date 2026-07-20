'use strict';

function fmt(n) {
  const r = Math.round(Number(n) * 10000) / 10000;
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

module.exports = { fmt, escapeAttr };
