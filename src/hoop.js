// dir is the way the hoop faces: +1 for the left hoop (court is to its right), -1 for the right hoop.
function makeHoop(dir) {
  const baseline = dir > 0 ? 0 : COURT.length;
  return {
    dir,
    x: baseline + dir * COURT.hoopX,
    y: COURT.width / 2,
    boardX: baseline + dir * (COURT.hoopX - HOOP.boardOffset),
    poleX: baseline - dir * HOOP.poleOffset,
    netT: 0,     // counts down while the net is swishing
    netSwing: 0, // how far (px) the net's bottom swings back on this swish
    bend: 0,     // px the far side of the rim is bent down (a spring, see updateHoops)
    bendV: 0,
    hanging: false, // a dunker is on the rim, pulling it down to hangBend
    hangBend: 0,
    sway: 0,     // px the rim is pulled sideways by a swinging dunker
    broken: false,  // rim shattered off: no rim or net until restoreHoops
  };
}

function restoreHoops() {
  for (const h of HOOPS) Object.assign(h, { bend: 0, bendV: 0, hanging: false, broken: false, netT: 0, sway: 0 });
}

const HOOPS = [makeHoop(1), makeHoop(-1)];

function nearestHoop(x) {
  return x < COURT.length / 2 ? HOOPS[0] : HOOPS[1];
}

function isThreePoint(x, y, hoop) {
  const fromBaseline = hoop.dir > 0 ? x : COURT.length - x;
  if (fromBaseline <= THREE.cornerLen) return Math.abs(y - hoop.y) >= THREE.cornerOff;
  return Math.hypot(x - hoop.x, y - hoop.y) > COURT.threeR;
}

function updateHoops(dt) {
  for (const h of HOOPS) {
    h.netT = Math.max(0, h.netT - dt);
    const target = h.hanging ? h.hangBend : 0;
    h.bendV += ((target - h.bend) * HOOP.bendStiffness - h.bendV * HOOP.bendDamping) * dt;
    h.bend += h.bendV * dt;
    if (!h.hanging) h.sway *= Math.exp(-HOOP.swaySettle * dt);
  }
}

// How far (px) the stand gives under a hanging dunker: the board and rim drop, the pole top leans in.
function hoopFlex(h) {
  return { drop: Math.round(h.bend * HOOP.boardFlex), lean: Math.round(h.bend * HOOP.poleLean) * h.dir };
}

// Each hoop is drawn in two layers so the ball can pass between them: the stand, board and back of the rim
// sort just behind the rim's center, the front of the rim and the net just in front of it.
const HOOP_LAYERS = HOOPS.flatMap((h) => [
  { y: h.y - HOOP.rimR, draw: (ctx) => drawHoopBack(ctx, h) },
  { y: h.y + HOOP.rimR, draw: (ctx) => drawHoopFront(ctx, h) },
]);

// Where the rim's center is drawn: its world spot, moved by the stand flexing and any sway.
function rimScreen(h) {
  const r = project(h.x, h.y, HOOP.rimZ);
  return { rx: Math.round(r.x + h.sway), ry: Math.round(r.y) + hoopFlex(h).drop };
}

// The rim as pixel offsets from its center: a 2px elliptical ring split into the far (back) and near (front)
// halves, a dark backing for the inside of the hoop plus a 1px outline, and a highlight along the front's top edge.
const RIM_PX = (() => {
  const a = 9.5;
  const b = 4.5;
  const inside = (dx, dy) => (dx / (a - 2)) ** 2 + (dy / (b - 1.6)) ** 2 <= 1;
  const px = { back: [], front: [], shine: [], backing: [], frontOutline: [] };
  for (let dy = -7; dy <= 7; dy++) {
    for (let dx = -12; dx <= 12; dx++) {
      const ring = (dx / a) ** 2 + (dy / b) ** 2 <= 1 && !inside(dx, dy);
      const halo = (dx / (a + 1.2)) ** 2 + (dy / (b + 1.2)) ** 2 <= 1;
      if (ring && dy < 0) px.back.push([dx, dy]);
      else if (ring) (inside(dx, dy - 1) ? px.shine : px.front).push([dx, dy]);
      else if (halo) {
        px.backing.push([dx, dy]);
        if (dy > 0 && !inside(dx, dy)) px.frontOutline.push([dx, dy]);
      }
    }
  }
  return px;
})();

// Draws rim pixels around (x, y). A bent rim droops more the farther a pixel is from the backboard.
const RIM_HALF_W = 11;
function plotPixels(ctx, pixels, x, y, color, h = null) {
  ctx.fillStyle = color;
  const span = 2 * RIM_HALF_W;
  for (const [dx, dy] of pixels) {
    const droop = h ? Math.round((h.bend * (dx * h.dir + RIM_HALF_W)) / span) : 0;
    ctx.fillRect(x + dx, y + dy + droop, 1, 1);
  }
}

function drawHoopBack(ctx, h) {
  const d = h.dir;

  // Padded base on the floor behind the baseline, with seams and a lit top edge.
  const base = project(h.poleX, h.y);
  const bx = Math.round(base.x);
  const by = Math.round(base.y);
  ctx.fillStyle = COLORS.outline;
  ctx.fillRect(bx - 17, by - 21, 34, 22);
  ctx.fillStyle = COLORS.pad;
  ctx.fillRect(bx - 16, by - 15, 32, 15);
  ctx.fillStyle = COLORS.padTop;
  ctx.fillRect(bx - 16, by - 20, 32, 5);
  ctx.fillStyle = mix(COLORS.padTop, COLORS.line, 0.25);
  ctx.fillRect(bx - 15, by - 19, 30, 1);
  ctx.fillStyle = COLORS.padSeam;
  ctx.fillRect(bx - 16, by - 15, 32, 1);
  ctx.fillRect(bx - 6, by - 14, 1, 14);
  ctx.fillRect(bx + 5, by - 14, 1, 14);

  // Pole: lit on one side, shadowed on the other. Drawn row by row so it can lean when the stand flexes.
  const flex = hoopFlex(h);
  const poleTop = Math.round(project(h.poleX, h.y, HOOP.poleTop).y);
  const poleBottom = by - 20;
  const leanAt = (y) => Math.round((flex.lean * (poleBottom - y)) / (poleBottom - poleTop));
  for (let y = poleTop - 1; y < poleBottom; y++) {
    const x = bx + leanAt(y);
    ctx.fillStyle = COLORS.outline;
    ctx.fillRect(x - 4, y, 9, 1);
    if (y < poleTop) continue;
    ctx.fillStyle = COLORS.pole;
    ctx.fillRect(x - 3, y, 7, 1);
    ctx.fillStyle = COLORS.poleLight;
    ctx.fillRect(x - 3, y, 2, 1);
    ctx.fillStyle = COLORS.poleDark;
    ctx.fillRect(x + 3, y, 1, 1);
  }

  // Board: a slab seen side-on with a framed white face toward the court. It drops with the flex and drifts a
  // little with the rim's sway.
  const bsx = Math.round(project(h.boardX, h.y).x + h.sway * 0.3);
  const bt = Math.round(project(h.boardX, h.y, HOOP.boardTop).y) + flex.drop;
  const bb = Math.round(project(h.boardX, h.y, HOOP.boardBottom).y) + flex.drop;
  const x0 = d > 0 ? bsx - 6 : bsx;
  const faceX = d > 0 ? x0 + 3 : x0;

  // Arm from the (leaning) top of the pole to the back of the board.
  thickLine(ctx, bx + flex.lean, poleTop + 3, d > 0 ? x0 - 4 : x0 + 8, bt + 8);

  ctx.fillStyle = COLORS.outline;
  ctx.fillRect(x0 - 1, bt - 1, 9, bb - bt + 2);
  ctx.fillStyle = COLORS.boardEdge;
  ctx.fillRect(x0, bt, 7, bb - bt);
  ctx.fillStyle = COLORS.poleDark;
  ctx.fillRect(d > 0 ? x0 : x0 + 6, bt, 1, bb - bt);
  ctx.fillStyle = COLORS.board;
  ctx.fillRect(faceX, bt + 2, 4, bb - bt - 4);

  // Shooter's square on the face, around rim height.
  const { rx, ry } = rimScreen(h);
  ctx.fillStyle = COLORS.boardMark;
  ctx.fillRect(faceX, ry - 17, 4, 1);
  ctx.fillRect(d > 0 ? faceX + 3 : faceX, ry - 17, 1, 15);

  // Bracket from the board to the rim.
  const from = d > 0 ? x0 + 7 : x0 - 1;
  const to = rx - d * 9;
  const left = Math.min(from, to);
  const w = Math.abs(to - from) + 1;
  ctx.fillStyle = COLORS.outline;
  ctx.fillRect(left, ry - 4, w, 5);
  ctx.fillStyle = COLORS.pole;
  ctx.fillRect(left, ry - 3, w, 3);
  ctx.fillStyle = COLORS.poleLight;
  ctx.fillRect(left, ry - 3, w, 1);

  // Inside of the hoop, the far strands of the net (behind the ball), then the far half of the rim.
  if (h.broken) return;
  plotPixels(ctx, RIM_PX.backing, rx, ry, COLORS.outline, h);
  drawNet(ctx, h, rx, ry, COLORS.netBack, 2, false);
  plotPixels(ctx, RIM_PX.back, rx, ry, COLORS.rimBack, h);
}

// Net half-widths from the rim down; it stretches longer for a moment after a make.
const NET_WIDTHS = [8, 8, 8, 8, 7, 7, 7, 7, 6, 6, 6, 6, 5, 5, 5, 5, 4, 4];

// The net's shape right now: one { hw, shift } per row from the rim down. After a make it stretches and swings
// back toward the baseline, overshoots forward a little, then settles.
function netRows(h) {
  const p = h.netT > 0 ? 1 - h.netT / HOOP.swishTime : 1;
  const stretch = Math.round(6 * Math.sin(Math.PI * Math.min(p * 1.6, 1)));
  const swing = h.netSwing * Math.sin(p * 2.5 * Math.PI) * (1 - p);
  const count = NET_WIDTHS.length + stretch;
  const rows = [];
  for (let k = 0; k < count; k++) {
    rows.push({
      hw: NET_WIDTHS[Math.floor((k * NET_WIDTHS.length) / count)],
      shift: Math.round((-h.dir * swing * (k + 1)) / count),
    });
  }
  return rows;
}

// Criss-cross diamond mesh hanging from the rim. `phase` offsets the diamonds so the far strands sit between
// the near ones; `edges` draws the solid outer cords.
function drawNet(ctx, h, rx, ry, color, phase, edges) {
  ctx.fillStyle = color;
  const top = ry + 3 + Math.round(h.bend * 0.5); // hangs from a bent rim's middle
  netRows(h).forEach(({ hw, shift }, k) => {
    for (let x = -hw; x <= hw; x++) {
      const diag = (((x + k + phase) % 4) + 4) % 4 === 0 || (((x - k + phase) % 4) + 4) % 4 === 0;
      if (diag || (edges && Math.abs(x) === hw)) ctx.fillRect(rx + x + shift, top + k, 1, 1);
    }
  });
}

function drawHoopFront(ctx, h) {
  if (h.broken) return;
  const { rx, ry } = rimScreen(h);
  drawNet(ctx, h, rx, ry, COLORS.net, 0, true);
  drawRimFront(ctx, rx, ry, h);
}

function drawRimFront(ctx, rx, ry, h = null) {
  plotPixels(ctx, RIM_PX.frontOutline, rx, ry, COLORS.outline, h);
  plotPixels(ctx, RIM_PX.front, rx, ry, COLORS.rim, h);
  plotPixels(ctx, RIM_PX.shine, rx, ry, COLORS.rimShine, h);
}

// The hoop's shadow on the floor: every part is sampled in world space and dropped along the light direction.
// Drawn opaque into the shared shadow layer.
function drawHoopShadow(ctx, h) {
  if (Math.abs(project(h.x, h.y).x - VIEW_W / 2) > VIEW_W) return;
  ctx.fillStyle = COLORS.shadow;
  const dot = (x, y, z, w = 2) => {
    const p = project(x + SHADOW.dx * z, y + SHADOW.dy * z);
    ctx.fillRect(Math.round(p.x) - (w >> 1), Math.round(p.y), w, 2);
  };

  for (let z = 0; z <= HOOP.poleTop; z += 0.25) dot(h.poleX, h.y, z, 7);

  const armTo = { x: h.boardX - h.dir * 2, z: HOOP.boardTop - 4 };
  for (let t = 0; t <= 1; t += 0.01) dot(lerp(h.poleX, armTo.x, t), h.y, lerp(HOOP.poleTop, armTo.z, t), 4);

  for (let dy = -HOOP.boardHalfW; dy <= HOOP.boardHalfW; dy += 0.5) {
    for (let z = HOOP.boardBottom; z <= HOOP.boardTop; z += 0.5) dot(h.boardX, h.y + dy, z);
  }

  // Rim and net shadows follow the rim's sway.
  const s = scaleAtY(h.y);
  const rimX = h.x + h.sway / s;
  for (let t = 0; t <= 1; t += 0.05) dot(lerp(h.boardX, rimX - h.dir * HOOP.rimR, t), h.y, HOOP.rimZ, 3);
  if (h.broken) return;
  for (let a = 0; a < Math.PI * 2; a += Math.PI / 48) {
    dot(rimX + Math.cos(a) * HOOP.rimR, h.y + Math.sin(a) * HOOP.rimR, HOOP.rimZ);
  }

  // Net: a ring per row, narrowing and swinging with the net itself.
  const rows = netRows(h);
  rows.forEach(({ hw, shift }, k) => {
    const z = HOOP.rimZ - ((k + 1) * HOOP.netDepth) / rows.length;
    const r = (hw / NET_WIDTHS[0]) * HOOP.rimR;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 12) {
      dot(rimX + shift / s + Math.cos(a) * r, h.y + Math.sin(a) * r, z, 1);
    }
  });
}

// A 4px strut with an outline and a lit top edge.
function thickLine(ctx, x0, y0, x1, y1) {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  const at = (i) => [Math.round(lerp(x0, x1, i / steps)), Math.round(lerp(y0, y1, i / steps))];
  ctx.fillStyle = COLORS.outline;
  for (let i = 0; i <= steps; i++) {
    const [x, y] = at(i);
    ctx.fillRect(x - 1, y - 1, 6, 6);
  }
  ctx.fillStyle = COLORS.pole;
  for (let i = 0; i <= steps; i++) {
    const [x, y] = at(i);
    ctx.fillRect(x, y, 4, 4);
  }
  ctx.fillStyle = COLORS.poleLight;
  for (let i = 0; i <= steps; i++) {
    const [x, y] = at(i);
    ctx.fillRect(x, y, 4, 1);
  }
}

