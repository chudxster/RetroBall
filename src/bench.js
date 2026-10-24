// Team benches along the far sideline: a row of chairs per team, with towels and water bottles left lying around.
// Placement is pseudo-random from hash2, so the mess is the same every frame.
const BENCH = {
  y: -9,          // depth of the chair row, on the floor between the court and the crowd
  spacing: 15,    // world units between chairs
  chairs: 6,
  teams: [
    { from: 125, color: '#3b5dc9' },
    { from: 270, color: '#b13e53' },
  ],
};
const BOTTLE_COLORS = ['#38b764', '#ffcd75', '#41a6f6', '#ef7d57'];

const BENCH_STUFF = (() => {
  const items = [];
  let k = 0;
  for (const team of BENCH.teams) {
    for (let i = 0; i < BENCH.chairs; i++, k++) {
      const x = team.from + i * BENCH.spacing;
      const flip = hash2(k, 5) < 0.5 ? -1 : 1;
      items.push({ kind: 'chair', x, y: BENCH.y, color: team.color, towel: hash2(k, 1) < 0.4, flip });
      // A towel tossed on the floor nearby...
      if (hash2(k, 2) < 0.45) {
        items.push({ kind: 'towel', x: x + (hash2(k, 3) - 0.5) * 14, y: BENCH.y + 2 + hash2(k, 4) * 5, color: team.color, flip });
      }
      // ...and a couple of water bottles, some knocked over.
      const bottles = Math.floor(hash2(k, 6) * 3);
      for (let b = 0; b < bottles; b++) {
        items.push({
          kind: hash2(k, 11 + b) < 0.3 ? 'tipped' : 'bottle',
          x: x + (hash2(k, 7 + b) - 0.5) * 16,
          y: BENCH.y + 1 + hash2(k, 9 + b) * 6,
          color: BOTTLE_COLORS[Math.floor(hash2(k, 13 + b) * BOTTLE_COLORS.length)],
          flip: hash2(k, 15 + b) < 0.5 ? -1 : 1,
        });
      }
    }
  }
  return items;
})();

// Sprites as [dx, dy, w, h, color] rects relative to the item's spot on the floor (see drawRects).
function benchSprite(item) {
  const c = item.color;
  switch (item.kind) {
    case 'chair':
      return [
        [-6, -8, 2, 8, COLORS.chairMetal],
        [4, -8, 2, 8, COLORS.chairMetal],
        [-7, -24, 14, 12, c],
        [-7, -24, 14, 2, mix(c, COLORS.line, 0.3)],
        [-7, -24, 1, 12, shade(c, 0.75)],
        [-7, -14, 14, 2, shade(c, 0.75)],
        [-7, -11, 14, 3, c],
        [-7, -11, 14, 1, mix(c, COLORS.line, 0.3)],
        // A towel slung over the backrest.
        ...(item.towel
          ? [
              [-5, -26, 7, 3, COLORS.towel],
              [-5, -23, 4, 9, COLORS.towel],
              [-5, -23, 4, 1, COLORS.towelShade],
              [-5, -16, 4, 1, c],
            ]
          : []),
      ];
    case 'towel':
      return [
        [-6, -3, 10, 3, COLORS.towel],
        [-4, -5, 7, 2, COLORS.towel],
        [-5, -1, 8, 1, COLORS.towelShade],
        [-2, -5, 1, 4, c],
      ];
    case 'bottle':
      return [
        [0, -9, 4, 8, c],
        [0, -9, 1, 8, shade(c, 0.8)],
        [0, -6, 4, 2, COLORS.towel],
        [1, -11, 2, 2, COLORS.bottleCap],
      ];
    case 'tipped':
      return [
        [-4, -4, 8, 4, c],
        [-4, -1, 8, 1, shade(c, 0.8)],
        [-1, -4, 2, 4, COLORS.towel],
        [4, -3, 2, 2, COLORS.bottleCap],
      ];
  }
  return [];
}

function benchOnScreen(item) {
  const x = project(item.x, item.y).x;
  return x > -40 && x < VIEW_W + 40;
}

// Depth-sorted drawables, like the hoop layers.
function benchLayers() {
  return BENCH_STUFF.filter(benchOnScreen).map((item) => ({
    y: item.y,
    draw(ctx) {
      const p = project(item.x, item.y);
      drawRects(ctx, benchSprite(item), Math.round(p.x), Math.round(p.y), item.flip, spriteScale(item.y));
    },
  }));
}

// Small shadows under the chairs, drawn into the shared shadow layer.
function drawBenchShadows(ctx) {
  ctx.fillStyle = COLORS.shadow;
  for (const item of BENCH_STUFF) {
    if (item.kind !== 'chair' || !benchOnScreen(item)) continue;
    const p = project(item.x, item.y);
    const w = Math.round(18 * spriteScale(item.y));
    ctx.fillRect(Math.round(p.x) - (w >> 1), Math.round(p.y) - 1, w, 2);
    ctx.fillRect(Math.round(p.x) - (w >> 1) + 2, Math.round(p.y) + 1, w - 4, 1);
  }
}
