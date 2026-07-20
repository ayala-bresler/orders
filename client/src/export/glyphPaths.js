/** @param {import('opentype.js').Path} path */
export function transformOpentypePath(path, ox, oy, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const tx = (x, y) => {
    const rx = x * cos - y * sin + ox;
    const ry = x * sin + y * cos + oy;
    return [fmt(rx), fmt(ry)];
  };

  const parts = [];
  for (const cmd of path.commands) {
    switch (cmd.type) {
      case 'M': {
        const [x, y] = tx(cmd.x, cmd.y);
        parts.push(`M ${x} ${y}`);
        break;
      }
      case 'L': {
        const [x, y] = tx(cmd.x, cmd.y);
        parts.push(`L ${x} ${y}`);
        break;
      }
      case 'C': {
        const [x1, y1] = tx(cmd.x1, cmd.y1);
        const [x2, y2] = tx(cmd.x2, cmd.y2);
        const [x, y] = tx(cmd.x, cmd.y);
        parts.push(`C ${x1} ${y1} ${x2} ${y2} ${x} ${y}`);
        break;
      }
      case 'Q': {
        const [x1, y1] = tx(cmd.x1, cmd.y1);
        const [x, y] = tx(cmd.x, cmd.y);
        parts.push(`Q ${x1} ${y1} ${x} ${y}`);
        break;
      }
      case 'Z':
        parts.push('Z');
        break;
      default:
        break;
    }
  }
  return parts.join(' ');
}

function fmt(n) {
  const r = Math.round(Number(n) * 10000) / 10000;
  if (Number.isInteger(r)) return String(r);
  return r.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

/** Outline path for one glyph at browser-computed anchor + rotation. */
export function glyphPathD(font, char, fontSize, ox, oy, angleRad) {
  const g = font.charToGlyph(char);
  if (!g || g.unicode === undefined) return null;
  const outline = g.getPath(0, 0, fontSize);
  if (!outline.commands.length) return null;
  return transformOpentypePath(outline, ox, oy, angleRad);
}
