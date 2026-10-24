// Team benches along the far sideline: a row of chairs per team, with towels and water bottles left lying around.
// The chairs are fixed; the clutter is scattered fresh by scatterBenchClutter (on load and during fade-to-black
// resets, so nothing visibly jumps).
// Colors are picked when drawing: the home bench (team 0) wears the player's jersey color, the away bench its inverse.
const BENCH = {
  y: -9,          // depth of the chair row, on the floor between the court and the crowd
  spacing: 15,    // world units between chairs
  chairs: 6,
  teams: [{ from: 110 }, { from: 285 }], // leaves room for the scorer's table at center court
  spread: 8,      // clutter lands up to this far (world units) in front of or behind the chair row
};
const BOTTLE_COLORS = ['#38b764', '#ffcd75', '#41a6f6', '#ef7d57'];

const BENCH_CHAIRS = BENCH.teams.flatMap((bench, team) =>
  Array.from({ length: BENCH.chairs }, (_, i) => ({ kind: 'chair', x: bench.from + i * BENCH.spacing, y: BENCH.y, team, towel: false, flip: 1 })));

let BENCH_STUFF = [];

// Semi-random mess around each chair: maybe a towel over the back, maybe one on the floor somewhere nearby
// (in front, underneath or behind), and up to three bottles anywhere around it, some knocked over.
function scatterBenchClutter() {
  const r = Math.random;
  const near = (x) => x + (r() - 0.5) * BENCH.spacing * 1.4;
  const depth = () => BENCH.y + (r() * 2 - 1) * BENCH.spread;
  const items = [];
  for (const chair of BENCH_CHAIRS) {
    chair.flip = r() < 0.5 ? -1 : 1;
    chair.towel = r() < 0.35;
    if (r() < 0.5) items.push({ kind: 'towel', x: near(chair.x), y: depth(), team: chair.team, flip: r() < 0.5 ? -1 : 1 });
    const bottles = Math.floor(r() * 4);
    for (let b = 0; b < bottles; b++) {
      items.push({
        kind: r() < 0.3 ? 'tipped' : 'bottle',
        x: near(chair.x),
        y: depth(),
        color: BOTTLE_COLORS[Math.floor(r() * BOTTLE_COLORS.length)],
        flip: r() < 0.5 ? -1 : 1,
      });
    }
  }
  BENCH_STUFF = [...BENCH_CHAIRS, ...items];
}
scatterBenchClutter();

// Sprites as [dx, dy, w, h, color] rects relative to the item's spot on the floor (see drawRects).
// `teamColors[item.team]` colors chairs and towel stripes; bottles carry their own color.
function benchSprite(item, teamColors) {
  const c = item.team === undefined ? item.color : teamColors[item.team];
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

// Depth-sorted drawables, like the hoop layers. `jersey` is the player's jersey color.
function benchLayers(jersey) {
  const teamColors = [jersey, awayJersey(jersey)];
  return BENCH_STUFF.filter(benchOnScreen).map((item) => ({
    y: item.y,
    draw(ctx) {
      const p = project(item.x, item.y);
      drawRects(ctx, benchSprite(item, teamColors), Math.round(p.x), Math.round(p.y), item.flip, spriteScale(item.y));
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
