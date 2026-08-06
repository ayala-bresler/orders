'use strict';

/**
 * Minimal AutoCAD R12 (AC1009) ASCII DXF writer for 2D polylines.
 *
 * MagicMark (and many laser apps) reject newer DXF (AC1021 / LWPOLYLINE)
 * that dxf-writer emits — but accept R12 POLYLINE+VERTEX after a Rhino
 * re-save. This writer matches that older, laser-friendly shape.
 */

function fmt(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return '0';
  // Trim noisy floats while keeping sub-mm precision.
  return String(Math.round(x * 1e6) / 1e6);
}

function isClosedPolyline(points, eps = 1e-4) {
  if (!points || points.length < 3) return false;
  const a = points[0];
  const b = points[points.length - 1];
  return Math.hypot(a[0] - b[0], a[1] - b[1]) <= eps;
}

/**
 * @param {{ points: number[][], closed?: boolean, layer?: string }[]} polylines
 * @param {{ units?: number, layer?: string }} [options]
 *   units: DXF $INSUNITS — 0=Unitless, 4=Millimeters (default 4 for laser).
 * @returns {string}
 */
function buildR12Dxf(polylines, options = {}) {
  const layer = options.layer || 'geometry';
  const units = Number.isFinite(options.units) ? options.units : 4;
  const lines = [];
  const w = (...vals) => {
    for (const v of vals) lines.push(String(v));
  };

  w('0', 'SECTION', '2', 'HEADER');
  w('9', '$ACADVER', '1', 'AC1009');
  w('9', '$INSUNITS', '70', String(units));
  w('0', 'ENDSEC');

  w('0', 'SECTION', '2', 'TABLES');
  w('0', 'TABLE', '2', 'LAYER', '70', '1');
  w('0', 'LAYER');
  w('2', layer);
  w('70', '0');
  w('62', '7'); // white / default
  w('6', 'CONTINUOUS');
  w('0', 'ENDTAB');
  w('0', 'ENDSEC');

  w('0', 'SECTION', '2', 'ENTITIES');

  for (const poly of polylines || []) {
    let pts = (poly.points || []).filter(
      (p) => Array.isArray(p) && Number.isFinite(p[0]) && Number.isFinite(p[1])
    );
    if (pts.length < 2) continue;

    const closed =
      poly.closed === true || (poly.closed !== false && isClosedPolyline(pts));
    if (closed && pts.length > 2) {
      const a = pts[0];
      const b = pts[pts.length - 1];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) <= 1e-4) {
        pts = pts.slice(0, -1);
      }
    }
    if (pts.length < 2) continue;

    w('0', 'POLYLINE');
    w('8', layer);
    w('66', '1'); // vertices follow
    w('70', closed ? '1' : '0');

    for (const [x, y] of pts) {
      w('0', 'VERTEX');
      w('8', layer);
      w('10', fmt(x));
      w('20', fmt(y));
      w('30', '0');
    }

    w('0', 'SEQEND');
    w('8', layer);
  }

  w('0', 'ENDSEC');
  w('0', 'EOF');
  return `${lines.join('\n')}\n`;
}

function emptyR12Dxf(options = {}) {
  return buildR12Dxf([], options);
}

module.exports = {
  buildR12Dxf,
  emptyR12Dxf,
  isClosedPolyline,
};
