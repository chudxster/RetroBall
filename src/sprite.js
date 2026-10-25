// Sprites are lists of [dx, dy, w, h, color, min?] rects relative to an origin, drawn facing right.
// Scaling rounds each rect's edges to whole pixels, never below `min` (default 1px), so details survive at any size.
// Every rect gets a 1px outline in a first pass, then the colors go on top.
function drawRects(ctx, parts, ox, oy, facing = 1, scale = 1) {
  const boxes = parts.map(([dx, dy, w, h, color, min = 1]) => {
    const x0 = Math.round(dx * scale);
    const y0 = Math.round(dy * scale);
    const x1 = Math.max(x0 + min, Math.round((dx + w) * scale));
    const y1 = Math.max(y0 + min, Math.round((dy + h) * scale));
    return [facing === 1 ? ox + x0 : ox - x1, oy + y0, x1 - x0, y1 - y0, color];
  });
  ctx.fillStyle = COLORS.outline;
  for (const [x, y, w, h] of boxes) ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  for (const [x, y, w, h, color] of boxes) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }
}

// A ball's rounded shadow, `w` pixels wide, centered on (cx, sy). Drawn into the shared shadow layer.
function drawBallShadow(ctx, cx, sy, w) {
  const left = cx - (w >> 1);
  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(left + 2, sy - 2, w - 4, 1);
  ctx.fillRect(left, sy - 1, w, 2);
  ctx.fillRect(left + 2, sy + 1, w - 4, 1);
}

// A ball `size` pixels across with its top-left at (x, top), rasterized as a circle so it stays round at any size.
// `spin` rolls the vertical seams across the ball; there's a shaded lower edge and a shine top-left.
const BALL_SIZE = 12;
// The ball skin in use (a Cosmetics ball style: colors, plus ABA panels or brick courses), or null for the
// standard ball. Set per game by main.js (setBallSkin).
let ballSkin = null;
function setBallSkin(style) {
  ballSkin = style;
}

function ballSprite(x, top, spin, size = BALL_SIZE) {
  const r = size / 2;
  const parts = [];
  const spans = [];
  const skin = ballSkin || { ball: COLORS.ball, seam: COLORS.ballSeam, shade: COLORS.ballShade };
  const cols = size - 2;
  for (let row = 0; row < size; row++) {
    const dy = row + 0.5 - r;
    const half = Math.sqrt(r * r - dy * dy);
    const a = Math.round(r - half);
    const b = Math.round(r + half);
    spans.push([a, b]);
    parts.push([x + a, top + row, b - a, 1, row === Math.floor(size / 2) && !skin.brick ? skin.seam : skin.ball]);
  }
  // Patterned skins, rolled by the spin: the ABA ball's three panels, the Brick ball's courses and mortar.
  if (skin.panels || skin.brick) {
    spans.forEach(([a, b], row) => {
      for (let col = a; col < b; col++) {
        const turn = (((col + Math.floor(spin)) % cols) + cols) % cols;
        if (skin.panels) {
          parts.push([x + col, top + row, 1, 1, skin.panels[Math.floor((turn * 3) / cols) % 3]]);
        } else if (row % 4 === 3 || (turn + (Math.floor(row / 4) % 2) * 3) % 6 === 0) {
          parts.push([x + col, top + row, 1, 1, skin.seam]);
        }
      }
    });
  }
  // Shaded underside.
  for (let row = Math.ceil(size * 0.7); row < size; row++) {
    const [a, b] = spans[row];
    if (row !== Math.floor(size / 2) && !skin.panels && !skin.brick) parts.push([x + a, top + row, b - a, 1, skin.shade]);
  }
  if (skin.brick) return [...parts, ballShine(x, top, size)];
  // Two vertical seams half a ball apart, clipped to the circle.
  const seamAt = (offset) => 1 + (((Math.floor(spin + offset) % cols) + cols) % cols);
  for (const col of size >= 10 ? [seamAt(0), seamAt(cols / 2)] : [seamAt(0)]) {
    const rows = spans.map(([a, b], row) => (col >= a && col < b ? row : -1)).filter((row) => row > 0 && row < size - 1);
    if (rows.length) parts.push([x + col, top + rows[0], 1, rows[rows.length - 1] - rows[0] + 1, skin.seam]);
  }
  parts.push(ballShine(x, top, size));
  return parts;
}

function ballShine(x, top, size) {
  const shine = Math.max(1, Math.round(size / 4));
  return [x + Math.round(size * 0.2), top + Math.round(size * 0.15), shine, Math.max(1, shine >> 1), COLORS.ballShine];
}
