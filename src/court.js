const CROWD_TOP = 32;
const CROWD_ROW_H = 16;
const SEAT_SPACING = 9;
const PLANK_W = 10;        // world units per plank row (planks run the length of the court)
const PLANK_SEAM_GAP = 60; // world units between plank ends along a row

// Picked once per load so every visit gets a different crowd. Each seat has a fixed roll against CROWD.density,
// so raising the density only adds people (and lowering it only removes them) without reshuffling the rest.
const CROWD_SEED = Math.floor(Math.random() * 1e6);

function drawArena(ctx, time) {
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(0, 0, VIEW_W, CROWD_TOP);

  // Banner along the back wall, scrolling slower than the court.
  ctx.fillStyle = COLORS.banner;
  ctx.fillRect(0, 6, VIEW_W, 18);
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(0, 7, VIEW_W, 1);
  ctx.fillRect(0, 22, VIEW_W, 1);
  const bannerOffset = Math.round(camera.renderX * 0.9);
  for (let bx = -((bannerOffset % 180) + 180); bx < VIEW_W + 180; bx += 180) {
    drawText(ctx, 'RETROBALL', bx, 10, COLORS.bannerText, { scale: 2 });
  }
  ctx.fillStyle = COLORS.wallStripe;
  ctx.fillRect(0, CROWD_TOP - 3, VIEW_W, 2);

  // Stands fill from the far edge of the floor up to the wall; zooming out reveals more rows.
  const floorTop = Math.floor(screenYForWorldY(-COURT.apron));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, CROWD_TOP, VIEW_W, floorTop - CROWD_TOP);
  ctx.clip();
  for (let row = 0, top = floorTop - CROWD_ROW_H; top + CROWD_ROW_H > CROWD_TOP; row++, top -= CROWD_ROW_H) {
    drawCrowdRow(ctx, row, top, time);
  }
  ctx.restore();
}

// `row` counts back from the court (0 = front row).
function drawCrowdRow(ctx, row, top, time) {
  ctx.fillStyle = COLORS.risers[row % 2];
  ctx.fillRect(0, top, VIEW_W, CROWD_ROW_H);
  ctx.fillStyle = COLORS.seat;
  ctx.fillRect(0, top + CROWD_ROW_H - 3, VIEW_W, 3);

  // Back rows scroll less than front rows for a bit of depth.
  const offset = camera.renderX * PROJ.nearScale * Math.max(0.3, 0.76 - row * 0.07) - (row % 2) * 4;
  const first = Math.floor((offset - VIEW_W / 2) / SEAT_SPACING) - 1;
  const last = Math.ceil((offset + VIEW_W / 2) / SEAT_SPACING) + 1;

  for (let k = first; k <= last; k++) {
    if (hash2(k + CROWD_SEED, row + 1013) >= CROWD.density) continue; // empty seat
    const h = hash2(k + CROWD_SEED, row);
    const sx = Math.round(VIEW_W / 2 + k * SEAT_SPACING - offset);
    const cheering = Math.sin(time * 6 + h * 50) > 0.97;
    const y = top + (cheering ? -2 : 0);
    const skin = SKINS[Math.floor(h * 31) % SKINS.length];
    const shirt = CROWD_SHIRTS[Math.floor(h * 97) % CROWD_SHIRTS.length];

    ctx.fillStyle = shirt;
    ctx.fillRect(sx, y + 7, 7, 6);
    ctx.fillStyle = shade(shirt, 0.8);
    ctx.fillRect(sx, y + 7, 1, 6);
    ctx.fillStyle = skin;
    ctx.fillRect(sx + 1, y + 1, 5, 5);
    ctx.fillRect(sx + 3, y + 6, 1, 1);
    if (cheering) {
      ctx.fillRect(sx - 1, y, 1, 7);
      ctx.fillRect(sx + 7, y, 1, 7);
    }
    ctx.fillStyle = CROWD_HAIR[Math.floor(h * 53) % CROWD_HAIR.length];
    ctx.fillRect(sx + 1, y + 1, 5, 2);
  }
}

// The floor is filled one screen row at a time, so the perspective squeeze comes for free.
function drawCourt(ctx) {
  const { length: L, width: W, apron } = COURT;
  const top = Math.floor(screenYForWorldY(-apron));

  // Down to the bottom of the screen so zooming out never shows a gap below the near sideline.
  for (let sy = top; sy < VIEW_H; sy++) {
    const wy = worldYForScreenY(sy + 0.5);
    const s = scaleAtY(wy);
    const toX = (x) => VIEW_W / 2 + (x - camera.renderX) * s;

    fillSpan(ctx, 0, VIEW_W, sy, COLORS.apron);
    if (wy < 0 || wy > W) continue;

    // Planks run the length of the court in alternating shades, with staggered seams where boards meet.
    const plank = Math.floor(wy / PLANK_W);
    fillSpan(ctx, toX(0), toX(L), sy, plank % 2 ? COLORS.woodA : COLORS.woodB);
    ctx.fillStyle = COLORS.woodSeam;
    const visibleFrom = camera.renderX - VIEW_W / 2 / s;
    const start = hash2(plank, 7) * PLANK_SEAM_GAP;
    for (let x = start + Math.max(0, Math.floor((visibleFrom - start) / PLANK_SEAM_GAP)) * PLANK_SEAM_GAP; x < L; x += PLANK_SEAM_GAP) {
      const px = Math.round(toX(x));
      if (px >= VIEW_W) break;
      ctx.fillRect(px, sy, 1, 1);
    }

    const fromMid = wy - W / 2;
    if (Math.abs(fromMid) <= COURT.keyHalfWidth) {
      fillSpan(ctx, toX(0), toX(COURT.keyDepth), sy, COLORS.paint);
      fillSpan(ctx, toX(L - COURT.keyDepth), toX(L), sy, COLORS.paint);
    }
    if (Math.abs(fromMid) < COURT.circleR) {
      const dx = Math.sqrt(COURT.circleR ** 2 - fromMid ** 2);
      fillSpan(ctx, toX(L / 2 - dx), toX(L / 2 + dx), sy, COLORS.paint);
    }
  }

  drawCourtLines(ctx);
}

function fillSpan(ctx, x0, x1, sy, color) {
  const a = Math.max(0, Math.round(x0));
  const b = Math.min(VIEW_W, Math.round(x1));
  if (b <= a) return;
  ctx.fillStyle = color;
  ctx.fillRect(a, sy, b - a, 1);
}

function drawCourtLines(ctx) {
  const { length: L, width: W } = COURT;
  ctx.fillStyle = COLORS.line;

  plotLine(ctx, 0, 0, L, 0);
  plotLine(ctx, 0, W, L, W);
  plotLine(ctx, 0, 0, 0, W);
  plotLine(ctx, L, 0, L, W);
  plotLine(ctx, L / 2, 0, L / 2, W);
  plotArc(ctx, L / 2, W / 2, COURT.circleR, 0, Math.PI * 2);

  drawEndLines(ctx, (x) => x);
  drawEndLines(ctx, (x) => L - x);
}

// One half's markings, drawn for the left end; `mx` mirrors x for the right end.
function drawEndLines(ctx, mx) {
  const W = COURT.width;
  const mid = W / 2;
  const kd = COURT.keyDepth;
  const kw = COURT.keyHalfWidth;

  plotLine(ctx, mx(0), mid - kw, mx(kd), mid - kw);
  plotLine(ctx, mx(0), mid + kw, mx(kd), mid + kw);
  plotLine(ctx, mx(kd), mid - kw, mx(kd), mid + kw);

  // Free-throw circle: solid outside the key, dashed inside.
  plotArc(ctx, kd, mid, COURT.circleR, -Math.PI / 2, Math.PI / 2, mx);
  plotArc(ctx, kd, mid, COURT.circleR, Math.PI / 2, Math.PI * 1.5, mx, true);

  // Three-point line: straight in the corners, then an arc around the hoop.
  const { cornerLen, arcAngle } = THREE;
  plotLine(ctx, mx(0), COURT.threeCornerY, mx(cornerLen), COURT.threeCornerY);
  plotLine(ctx, mx(0), W - COURT.threeCornerY, mx(cornerLen), W - COURT.threeCornerY);
  plotArc(ctx, COURT.hoopX, mid, COURT.threeR, -arcAngle, arcAngle, mx);
}

function plotLine(ctx, x0, y0, x1, y1) {
  const a = project(x0, y0);
  const b = project(x1, y1);
  if (y0 === y1) {
    ctx.fillRect(Math.round(Math.min(a.x, b.x)), Math.round(a.y), Math.round(Math.abs(b.x - a.x)) + 1, 1);
    return;
  }
  const steps = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y))) + 1;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    plotPoint(ctx, lerp(x0, x1, t), lerp(y0, y1, t));
  }
}

// Sampled finely enough (in screen pixels) to leave no gaps; dashes are about 8px.
const ARC_SAMPLES_PER_UNIT = PROJ.nearScale * 1.5;
function plotArc(ctx, cx, cy, r, a0, a1, mx = (x) => x, dashed = false) {
  const steps = Math.ceil(r * Math.abs(a1 - a0) * ARC_SAMPLES_PER_UNIT);
  const dash = Math.round(4 * ARC_SAMPLES_PER_UNIT);
  for (let i = 0; i <= steps; i++) {
    if (dashed && Math.floor(i / dash) % 2) continue;
    const a = lerp(a0, a1, i / steps);
    plotPoint(ctx, mx(cx + Math.cos(a) * r), cy + Math.sin(a) * r);
  }
}

function plotPoint(ctx, x, y) {
  const p = project(x, y);
  ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
}
