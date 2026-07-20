/** Proportions from order.svg top-row medallion spacing. */
const SVG_CENTER_GAP = 640.21 - 288.14;
const SVG_OUTER_R = 168.66;

function stadiumPath(cx, cy, halfRectW, r) {
  const xL = cx - halfRectW;
  const xR = cx + halfRectW;
  const yT = cy - r;
  const yB = cy + r;
  const outerL = xL - r;
  const outerR = xR + r;
  return [
    `M ${outerL} ${cy}`,
    `A ${r} ${r} 0 0 1 ${xL} ${yT}`,
    `L ${xR} ${yT}`,
    `A ${r} ${r} 0 0 1 ${outerR} ${cy}`,
    `A ${r} ${r} 0 0 1 ${xR} ${yB}`,
    `L ${xL} ${yB}`,
    `A ${r} ${r} 0 0 1 ${outerL} ${cy}`,
    'Z',
  ].join(' ');
}

function CenterMark({ x, y, size = 5 }) {
  return (
    <g stroke="#241f1f" strokeWidth="1.2">
      <line x1={x - size} y1={y} x2={x + size} y2={y} />
      <line x1={x} y1={y - size} x2={x} y2={y + size} />
    </g>
  );
}

/** Parochet sketch — stadium outline + dimension lines (no letter badges). */
export default function EtzChaimMeasuresDiagram() {
  const cx = 250;
  const cy = 132;
  const r = 52;
  const circleR = 18;
  const circleGapExtra = 16;
  const centerGap = (SVG_CENTER_GAP / SVG_OUTER_R) * circleR + circleGapExtra;
  const halfRectW = centerGap / 2 + circleR + 10;

  const cxLeft = cx - centerGap / 2;
  const cxRight = cx + centerGap / 2;

  const xL = cx - halfRectW;
  const xR = cx + halfRectW;
  const outerL = xL - r;
  const outerR = xR + r;
  const yT = cy - r;
  const yB = cy + r;

  const widthY = yT - 24;
  const lengthX = outerR + 24;
  const c2cY = cy - circleR - 20;

  /* Diameter mark (was ד): diagonal arrow ending ON the circle edge;
     outer end: horizontal tick (// X-axis), one side only —
     so it reads as a continuation of the diagonal, not a centered bar. */
  const dialAngle = -Math.PI / 4; // top-right of right circle
  const dialUx = Math.cos(dialAngle);
  const dialUy = Math.sin(dialAngle);
  const dialX2 = cxRight + circleR * dialUx;
  const dialY2 = cy + circleR * dialUy;
  const dialX1 = cxRight + circleR * 2.05 * dialUx;
  const dialY1 = cy + circleR * 2.05 * dialUy;
  const tickLen = 10;

  return (
    <div className="parochet-diagram-panel">
      <svg
        className="parochet-diagram-svg"
        viewBox="8 14 484 198"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        aria-label="איור מידות פרוכת"
      >
        <defs>
          <marker id="pd-arrow-start" markerWidth="7" markerHeight="7" refX="1" refY="3.5" orient="auto">
            <path d="M7,0 L0,3.5 L7,7 Z" fill="#241f1f" />
          </marker>
          <marker id="pd-arrow-end" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 Z" fill="#241f1f" />
          </marker>
        </defs>

        <path
          d={stadiumPath(cx, cy, halfRectW, r)}
          fill="#fff"
          stroke="#241f1f"
          strokeWidth="2.6"
        />

        <circle cx={cxLeft} cy={cy} r={circleR} fill="#fff" stroke="#241f1f" strokeWidth="2.1" />
        <circle cx={cxRight} cy={cy} r={circleR} fill="#fff" stroke="#241f1f" strokeWidth="2.1" />

        <line x1={outerL} y1={cy} x2={outerL} y2={widthY} stroke="#241f1f" strokeWidth="1.2" />
        <line x1={outerR} y1={cy} x2={outerR} y2={widthY} stroke="#241f1f" strokeWidth="1.2" />
        <line
          x1={outerL}
          y1={widthY}
          x2={outerR}
          y2={widthY}
          stroke="#241f1f"
          strokeWidth="1.4"
          markerStart="url(#pd-arrow-start)"
          markerEnd="url(#pd-arrow-end)"
        />

        <line x1={xR} y1={yT} x2={lengthX} y2={yT} stroke="#241f1f" strokeWidth="1.2" />
        <line x1={xR} y1={yB} x2={lengthX} y2={yB} stroke="#241f1f" strokeWidth="1.2" />
        <line
          x1={lengthX}
          y1={yT}
          x2={lengthX}
          y2={yB}
          stroke="#241f1f"
          strokeWidth="1.4"
          markerStart="url(#pd-arrow-start)"
          markerEnd="url(#pd-arrow-end)"
        />

        <line
          x1={cxLeft}
          y1={c2cY}
          x2={cxRight}
          y2={c2cY}
          stroke="#241f1f"
          strokeWidth="1.4"
          markerStart="url(#pd-arrow-start)"
          markerEnd="url(#pd-arrow-end)"
        />
        <line x1={cxLeft} y1={c2cY} x2={cxLeft} y2={cy} stroke="#241f1f" strokeWidth="1.2" />
        <line x1={cxRight} y1={c2cY} x2={cxRight} y2={cy} stroke="#241f1f" strokeWidth="1.2" />
        <CenterMark x={cxLeft} y={cy} />
        <CenterMark x={cxRight} y={cy} />

        <line
          x1={dialX1}
          y1={dialY1}
          x2={dialX2}
          y2={dialY2}
          stroke="#241f1f"
          strokeWidth="1.4"
          markerEnd="url(#pd-arrow-end)"
        />
        {/* Outer end: horizontal tick, one side only (continuation feel) */}
        <line
          x1={dialX1}
          y1={dialY1}
          x2={dialX1 + tickLen}
          y2={dialY1}
          stroke="#241f1f"
          strokeWidth="1.4"
        />
      </svg>
    </div>
  );
}
