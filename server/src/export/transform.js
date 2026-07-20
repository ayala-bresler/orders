'use strict';

/** Parse SVG transform="" into 2×3 matrix [a,b,c,d,e,f]. */
function parseTransform(raw) {
  if (!raw || !String(raw).trim()) {
    return [1, 0, 0, 1, 0, 0];
  }
  let m = [1, 0, 0, 1, 0, 0];
  const re =
    /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/gi;
  let match;
  while ((match = re.exec(raw))) {
    const fn = match[1].toLowerCase();
    const nums = match[2]
      .split(/[\s,]+/)
      .filter(Boolean)
      .map(Number);
    m = multiply(m, transformToMatrix(fn, nums));
  }
  return m;
}

function transformToMatrix(fn, n) {
  switch (fn) {
    case 'matrix':
      return [n[0], n[1], n[2], n[3], n[4], n[5]];
    case 'translate':
      return [1, 0, 0, 1, n[0], n[1] || 0];
    case 'scale': {
      const sx = n[0];
      const sy = n.length > 1 ? n[1] : sx;
      return [sx, 0, 0, sy, 0, 0];
    }
    case 'rotate': {
      const ang = (n[0] * Math.PI) / 180;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      if (n.length >= 3) {
        const cx = n[1];
        const cy = n[2];
        return multiply(
          multiply([1, 0, 0, 1, cx, cy], [cos, sin, -sin, cos, 0, 0]),
          [1, 0, 0, 1, -cx, -cy]
        );
      }
      return [cos, sin, -sin, cos, 0, 0];
    }
    case 'skewx': {
      const a = Math.tan((n[0] * Math.PI) / 180);
      return [1, 0, a, 1, 0, 0];
    }
    case 'skewy': {
      const a = Math.tan((n[0] * Math.PI) / 180);
      return [1, a, 0, 1, 0, 0];
    }
    default:
      return [1, 0, 0, 1, 0, 0];
  }
}

function multiply(m1, m2) {
  const [a1, b1, c1, d1, e1, f1] = m1;
  const [a2, b2, c2, d2, e2, f2] = m2;
  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1,
  ];
}

function apply(m, x, y) {
  const [a, b, c, d, e, f] = m;
  return [a * x + c * y + e, b * x + d * y + f];
}

function accumulate(parentM, node) {
  const own = parseTransform(node.getAttribute && node.getAttribute('transform'));
  return multiply(parentM, own);
}

module.exports = {
  parseTransform,
  multiply,
  apply,
  accumulate,
};
