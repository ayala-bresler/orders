'use strict';

const { apply } = require('./transform');

const SEGMENTS = 72;

function flattenEllipse(cx, cy, rx, ry, matrix) {
  const pts = [];
  for (let i = 0; i <= SEGMENTS; i += 1) {
    const t = (i / SEGMENTS) * Math.PI * 2;
    const x = cx + rx * Math.cos(t);
    const y = cy + ry * Math.sin(t);
    pts.push(apply(matrix, x, y));
  }
  return pts;
}

function flattenRect(x, y, w, h, matrix) {
  return [
    apply(matrix, x, y),
    apply(matrix, x + w, y),
    apply(matrix, x + w, y + h),
    apply(matrix, x, y + h),
    apply(matrix, x, y),
  ];
}

/** Flatten cubic bezier to polyline. */
function flattenCubic(p0, p1, p2, p3, steps = 16) {
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    const x =
      u * u * u * p0[0] +
      3 * u * u * t * p1[0] +
      3 * u * t * t * p2[0] +
      t * t * t * p3[0];
    const y =
      u * u * u * p0[1] +
      3 * u * u * t * p1[1] +
      3 * u * t * t * p2[1] +
      t * t * t * p3[1];
    out.push([x, y]);
  }
  return out;
}

function flattenQuadratic(p0, p1, p2, steps = 12) {
  const out = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0];
    const y = u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1];
    out.push([x, y]);
  }
  return out;
}

/** Parse SVG path d → polylines in local space (before matrix). */
function pathToPolylines(d) {
  if (!d) return [];
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
  if (!tokens) return [];

  const polylines = [];
  let current = [];
  let i = 0;
  let cmd = 'M';
  let cx = 0;
  let cy = 0;
  let sx = 0;
  let sy = 0;
  let prevCubicCtrl = null;

  const read = () => Number(tokens[i++]);

  const pushCurrent = () => {
    if (current.length >= 2) polylines.push(current);
    current = [];
  };

  while (i < tokens.length) {
    const t = tokens[i];
    if (/[a-zA-Z]/.test(t)) {
      cmd = tokens[i++];
    } else if (!cmd) {
      break;
    }

    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();

    switch (C) {
      case 'M': {
        if (current.length) pushCurrent();
        cx = read();
        cy = read();
        if (rel) {
          cx += sx;
          cy += sy;
        }
        sx = cx;
        sy = cy;
        current.push([cx, cy]);
        cmd = rel ? 'l' : 'L';
        break;
      }
      case 'L': {
        cx = read();
        cy = read();
        if (rel) {
          cx += sx;
          cy += sy;
        }
        current.push([cx, cy]);
        sx = cx;
        sy = cy;
        break;
      }
      case 'H': {
        cx = read();
        if (rel) cx += sx;
        cy = sy;
        current.push([cx, cy]);
        sx = cx;
        break;
      }
      case 'V': {
        cy = read();
        if (rel) cy += sy;
        cx = sx;
        current.push([cx, cy]);
        sy = cy;
        break;
      }
      case 'C': {
        const x1 = read();
        const y1 = read();
        const x2 = read();
        const y2 = read();
        let x = read();
        let y = read();
        let p1x = x1;
        let p1y = y1;
        let p2x = x2;
        let p2y = y2;
        if (rel) {
          p1x += sx;
          p1y += sy;
          p2x += sx;
          p2y += sy;
          x += sx;
          y += sy;
        }
        const seg = flattenCubic([sx, sy], [p1x, p1y], [p2x, p2y], [x, y]);
        for (let k = 1; k < seg.length; k += 1) current.push(seg[k]);
        prevCubicCtrl = [p2x, p2y];
        sx = x;
        sy = y;
        break;
      }
      case 'S': {
        let p1x;
        let p1y;
        if (prevCubicCtrl) {
          p1x = 2 * sx - prevCubicCtrl[0];
          p1y = 2 * sy - prevCubicCtrl[1];
        } else {
          p1x = sx;
          p1y = sy;
        }
        let p2x = read();
        let p2y = read();
        let x = read();
        let y = read();
        if (rel) {
          p2x += sx;
          p2y += sy;
          x += sx;
          y += sy;
        }
        const seg = flattenCubic([sx, sy], [p1x, p1y], [p2x, p2y], [x, y]);
        for (let k = 1; k < seg.length; k += 1) current.push(seg[k]);
        prevCubicCtrl = [p2x, p2y];
        sx = x;
        sy = y;
        break;
      }
      case 'T': {
        let p1x;
        let p1y;
        if (prevCubicCtrl) {
          p1x = 2 * sx - prevCubicCtrl[0];
          p1y = 2 * sy - prevCubicCtrl[1];
        } else {
          p1x = sx;
          p1y = sy;
        }
        let x = read();
        let y = read();
        if (rel) {
          x += sx;
          y += sy;
        }
        const seg = flattenQuadratic([sx, sy], [p1x, p1y], [x, y]);
        for (let k = 1; k < seg.length; k += 1) current.push(seg[k]);
        prevCubicCtrl = [p1x, p1y];
        sx = x;
        sy = y;
        break;
      }
      case 'Q': {
        const x1 = read();
        const y1 = read();
        let x = read();
        let y = read();
        let p1x = x1;
        let p1y = y1;
        if (rel) {
          p1x += sx;
          p1y += sy;
          x += sx;
          y += sy;
        }
        const seg = flattenQuadratic([sx, sy], [p1x, p1y], [x, y]);
        for (let k = 1; k < seg.length; k += 1) current.push(seg[k]);
        sx = x;
        sy = y;
        break;
      }
      case 'Z': {
        if (current.length) {
          current.push([current[0][0], current[0][1]]);
          pushCurrent();
        }
        cx = sx;
        cy = sy;
        prevCubicCtrl = null;
        break;
      }
      default:
        i += 1;
        break;
    }
  }
  if (current.length) pushCurrent();
  return polylines;
}

function longestPolyline(polylines) {
  if (!polylines || !polylines.length) return [];
  return polylines.reduce((best, line) => (line.length > best.length ? line : best));
}

function transformPolylines(polylines, matrix) {
  return polylines.map((line) => line.map(([x, y]) => apply(matrix, x, y)));
}

module.exports = {
  flattenEllipse,
  flattenRect,
  pathToPolylines,
  transformPolylines,
  longestPolyline,
};
