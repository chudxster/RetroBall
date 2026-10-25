const CROWD_TOP = 32;
const CROWD_ROW_H = 16;
const SEAT_SPACING = 9;
const PLANK_W = 10;        // world units per plank row (planks run the length of the court)
const PLANK_SEAM_GAP = 60; // world units between plank ends along a row

// Picked once per load so every visit gets a different crowd. Each seat has a fixed roll against CROWD.density,
// so raising the density only adds people (and lowering it only removes them) without reshuffling the rest.
const CROWD_SEED = Math.floor(Math.random() * 1e6);

// The crowd's reaction to the last big play: `peak` share of fans on their feet for `t` more seconds, maybe
// waving signs with the scorer's number.
const crowdHype = { peak: 0, t: 0, time: 1, sign: null };

// A play worth cheering: `level` is the share of fans who jump up (less for the other team). A louder play takes
// over from a quieter one still going; a quieter one is drowned out.
function cheerCrowd(level, player, { sign = false, rare = false } = {}) {
  if (player && player.team !== 0 && !evenTeams) level *= CROWD.awayHype;
  if (level < crowdLevel()) return;
  crowdHype.peak = level;
  Sfx.play('crowd', { vol: level });
  crowdHype.time = crowdHype.t = CROWD.hypeTime * (rare ? 2 : 1);
  crowdHype.sign = player && (rare || (sign && Math.random() < CROWD.signChance))
    ? { number: player.look.number, color: player.look.jersey } : null;
}

function updateCrowd(dt) {
  crowdHype.t = Math.max(0, crowdHype.t - dt);
}

// Share of fans on their feet right now: all of the peak, then fading over the last 40% of the cheer.
function crowdLevel() {
  return crowdHype.peak * clamp(crowdHype.t / (crowdHype.time * 0.4), 0, 1);
}

function drawArena(ctx, time) {
  if (court.outdoor) {
    drawOutdoor(ctx, court.outdoor);
    if (arenaBanner) drawRaftersBanner(ctx, arenaBanner);
    return;
  }
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
    drawText(ctx, court.banner || 'RETROBALL', bx, 10, COLORS.bannerText, { scale: 2 });
  }
  ctx.fillStyle = COLORS.wallStripe;
  ctx.fillRect(0, CROWD_TOP - 3, VIEW_W, 2);

  // Stands fill from the far edge of the floor up to the wall; zooming out reveals more rows.
  const floorTop = Math.floor(screenYForWorldY(-COURT.apron));
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, CROWD_TOP, VIEW_W, floorTop - CROWD_TOP);
  ctx.clip();
  // Back rows first, so fans jumping up (and their signs) stay in front of the row behind them.
  let rows = 0;
  while (floorTop - (rows + 1) * CROWD_ROW_H + CROWD_ROW_H > CROWD_TOP) rows++;
  for (let row = rows - 1; row >= 0; row--) drawCrowdRow(ctx, row, floorTop - (row + 1) * CROWD_ROW_H, time);
  ctx.restore();
  if (arenaBanner) drawRaftersBanner(ctx, arenaBanner);
}

// `row` counts back from the court (0 = front row).
// A court's own crowd shirt colors, shaded once each.
const COURT_SHIRT_SHADES = new Map();
function courtShirtShade(color) {
  if (!COURT_SHIRT_SHADES.has(color)) COURT_SHIRT_SHADES.set(color, shade(color, 0.8));
  return COURT_SHIRT_SHADES.get(color);
}

function drawCrowdRow(ctx, row, top, time) {
  ctx.fillStyle = COLORS.risers[row % 2];
  ctx.fillRect(0, top, VIEW_W, CROWD_ROW_H);
  ctx.fillStyle = COLORS.seat;
  ctx.fillRect(0, top + CROWD_ROW_H - 3, VIEW_W, 3);

  // Back rows scroll less than front rows for a bit of depth.
  const offset = camera.renderX * PROJ.nearScale * Math.max(0.3, 0.76 - row * 0.07) - (row % 2) * 4;
  const first = Math.floor((offset - VIEW_W / 2) / SEAT_SPACING) - 1;
  const last = Math.ceil((offset + VIEW_W / 2) / SEAT_SPACING) + 1;

  const level = crowdLevel();
  const { sign } = crowdHype;
  for (let k = first; k <= last; k++) {
    const seat = k + CROWD_SEED;
    if (hash2(seat, row + 1013) >= CROWD.density * (court.density ?? 1)) continue; // empty seat
    const h = hash2(seat, row);
    const sx = Math.round(VIEW_W / 2 + k * SEAT_SPACING - offset);
    // Each fan has a fixed eagerness: the most eager get up for small plays, everyone for a big one.
    const hyped = hash2(seat, row + 2027) < level;
    const holdsSign = hyped && sign && hash2(seat, row + 3041) < CROWD.signShare;
    const cheering = hyped || Math.sin(time * 6 + h * 50) > CROWD.idleCheer;
    // On their feet: bouncing up and down (sign holders bob less, waving the sign side to side).
    const hop = holdsSign ? 1 : 3;
    const y = top - (hyped ? Math.round(Math.abs(Math.sin(time * 8 + h * 40)) * hop) + 1 : cheering ? 2 : 0);
    const skin = SKINS[Math.floor(h * 31) % SKINS.length];
    const shirts = court.shirts || CROWD_SHIRTS;
    const shirtIndex = Math.floor(h * 97) % shirts.length;
    const shirt = shirts[shirtIndex];

    ctx.fillStyle = shirt;
    ctx.fillRect(sx, y + 7, 7, 6);
    ctx.fillStyle = court.shirts ? courtShirtShade(shirt) : CROWD_SHIRT_SHADES[shirtIndex];
    ctx.fillRect(sx, y + 7, 1, 6);
    ctx.fillStyle = skin;
    ctx.fillRect(sx + 1, y + 1, 5, 5);
    ctx.fillRect(sx + 3, y + 6, 1, 1);
    if (holdsSign) {
      ctx.fillRect(sx, y - 1, 1, 8);
      ctx.fillRect(sx + 6, y - 1, 1, 8);
    } else if (cheering) {
      ctx.fillRect(sx - 1, y, 1, 7);
      ctx.fillRect(sx + 7, y, 1, 7);
    }
    ctx.fillStyle = CROWD_HAIR[Math.floor(h * 53) % CROWD_HAIR.length];
    ctx.fillRect(sx + 1, y + 1, 5, 2);
    // In the dark arenas (Finals Night, Neon Night) phones flash here and there.
    if (court.flashes && Math.sin(time * 3 + h * 90) > 0.96) {
      ctx.fillStyle = COLORS.line;
      ctx.fillRect(sx + 5, y + 2, 2, 2);
    }
    if (holdsSign) drawCrowdSign(ctx, sign, sx + 3, y - 2, Math.round(Math.sin(time * 5 + h * 30) * 1.5), h);
  }
}

// A sign held overhead (bottom edge at `bottom`, centered on `cx`) with the scorer's number: half the fans paint
// it in the team color, the rest write the number in team color on white.
function drawCrowdSign(ctx, sign, cx, bottom, sway, h) {
  const w = textWidth(sign.number) + 4;
  const left = Math.round(cx - w / 2) + sway;
  const top = bottom - 8;
  const teamBoard = h < 0.5;
  const board = teamBoard ? sign.color : '#f4f4f4';
  const ink = teamBoard || isLightColor(sign.color) ? (isLightColor(board) ? '#1a1c2c' : '#f4f4f4') : sign.color;
  ctx.fillStyle = shade(board, 0.7);
  ctx.fillRect(left - 1, top - 1, w + 2, 10);
  ctx.fillStyle = board;
  ctx.fillRect(left, top, w, 8);
  drawText(ctx, sign.number, left + 2, top + 2, ink);
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

    drawFloorRow(ctx, sy, wy, s, toX);

    const fromMid = wy - W / 2;
    if (Math.abs(fromMid) <= COURT.keyHalfWidth && !court.noPaint) {
      fillSpan(ctx, toX(0), toX(COURT.keyDepth), sy, COLORS.paint);
      fillSpan(ctx, toX(L - COURT.keyDepth), toX(L), sy, COLORS.paint);
    }
    if (Math.abs(fromMid) < COURT.circleR) {
      const dx = Math.sqrt(COURT.circleR ** 2 - fromMid ** 2);
      fillSpan(ctx, toX(L / 2 - dx), toX(L / 2 + dx), sy, court.center || COLORS.paint);
    }
  }

  drawCourtLines(ctx);
}

// One screen row of the court's floor, by the court's texture: planks running the length of the court in two shades
// with staggered seams (the default), speckled asphalt or concrete, sport-court tiles, or a checkerboard. Speckles and
// seams are fixed to the floor, so they scroll with it.
function drawFloorRow(ctx, sy, wy, s, toX) {
  const L = COURT.length;
  const visibleFrom = Math.max(0, camera.renderX - VIEW_W / 2 / s);
  const visibleTo = Math.min(L, camera.renderX + VIEW_W / 2 / s);
  const floor = court.floor || 'planks';
  if (floor === 'checker' || floor === 'tiles') {
    const size = floor === 'checker' ? 20 : 12;
    const row = Math.floor(wy / size);
    for (let x = Math.floor(visibleFrom / size) * size; x < visibleTo; x += size) {
      const odd = (Math.floor(x / size) + row) % 2;
      fillSpan(ctx, toX(Math.max(0, x)), toX(Math.min(L, x + size)), sy, odd ? COLORS.woodA : COLORS.woodB);
      if (floor === 'tiles') fillSpan(ctx, toX(x), toX(x) + 1, sy, COLORS.woodSeam);
    }
    if (floor === 'tiles' && wy % size < 0.9) fillSpan(ctx, toX(0), toX(L), sy, COLORS.woodSeam);
    return;
  }
  if (floor === 'speckle') {
    fillSpan(ctx, toX(0), toX(L), sy, COLORS.woodA);
    const row = Math.round(wy * 2);
    for (let x = Math.floor(visibleFrom); x < visibleTo; x += 2) {
      const r = hash2(x, row);
      if (r < 0.12) fillSpan(ctx, toX(x), toX(x) + 1, sy, court.speckle[r < 0.06 ? 0 : 1]);
    }
    return;
  }
  const plank = Math.floor(wy / PLANK_W);
  fillSpan(ctx, toX(0), toX(L), sy, plank % 2 ? COLORS.woodA : COLORS.woodB);
  ctx.fillStyle = COLORS.woodSeam;
  const start = hash2(plank, 7) * PLANK_SEAM_GAP;
  for (let x = start + Math.max(0, Math.floor((visibleFrom - start) / PLANK_SEAM_GAP)) * PLANK_SEAM_GAP; x < L; x += PLANK_SEAM_GAP) {
    const px = Math.round(toX(x));
    if (px >= VIEW_W) break;
    ctx.fillRect(px, sy, 1, 1);
  }
}

function fillSpan(ctx, x0, x1, sy, color) {
  const a = Math.max(0, Math.round(x0));
  const b = Math.min(VIEW_W, Math.round(x1));
  if (b <= a) return;
  ctx.fillStyle = color;
  ctx.fillRect(a, sy, b - a, 1);
}

// The court's lines in its line color; Neon Night draws them a second time first, a pixel lower, as the glow.
function drawCourtLines(ctx) {
  if (court.glow) {
    ctx.save();
    ctx.translate(0, 1);
    drawCourtLineSet(ctx, court.glow);
    ctx.restore();
  }
  drawCourtLineSet(ctx, court.line || COLORS.line);
}

function drawCourtLineSet(ctx, color) {
  const { length: L, width: W } = COURT;
  ctx.fillStyle = color;

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
  // Worn lines on the blacktop: a few pixels missing.
  if (court.wear && hash2(Math.round(x * 2), Math.round(y * 2)) < court.wear) return;
  ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
}

// Your banner in the rafters (Cosmetics, set per game by main.js): { tier, jersey, number, trim, stars, x (the world
// x it hangs over) } or null.
// It hangs over the top rows of the crowd above your home basket, scrolling with the crowd: a pennant, a banner, a
// gold-trimmed banner with a star per trophy on your shelf, or your retired jersey under its own spotlight.
let arenaBanner = null;
function drawRaftersBanner(ctx, b) {
  const x = Math.round(VIEW_W / 2 + (b.x - camera.renderX) * PROJ.nearScale * 0.6);
  if (x < -40 || x > VIEW_W + 40) return;
  const top = 25;
  const rect = (dx, dy, w, h, color) => {
    ctx.fillStyle = color;
    ctx.fillRect(x + dx, top + dy, w, h);
  };
  if (b.tier === 3) {
    ctx.fillStyle = 'rgba(255, 205, 117, 0.08)'; // the spotlight
    ctx.beginPath();
    ctx.moveTo(x - 6, 0);
    ctx.lineTo(x + 6, 0);
    ctx.lineTo(x + 26, top + 52);
    ctx.lineTo(x - 26, top + 52);
    ctx.fill();
  }
  rect(-16, -1, 32, 2, '#94b0c2'); // the rod
  if (b.tier === 0) {
    for (let i = 0; i < 30; i++) rect(-11, 1 + i, Math.max(1, Math.round(22 * (1 - i / 30))), 1, b.jersey);
    drawText(ctx, String(b.number), x - 4, top + 5, b.trim, { align: 'center' });
    return;
  }
  if (b.tier === 3) {
    rect(-16, 1, 32, 46, '#29366f');
    rect(-15, 2, 30, 44, '#1a1c2c');
    rect(-9, 8, 18, 30, b.jersey);   // the jersey: body, shoulders, armholes
    rect(-13, 8, 4, 8, b.jersey);
    rect(9, 8, 4, 8, b.jersey);
    rect(-3, 8, 6, 3, '#1a1c2c');
    drawText(ctx, String(b.number), x, top + 18, b.trim, { align: 'center', scale: 2 });
    rect(-12, 40, 24, 3, '#ffcd75');
    return;
  }
  const gold = b.tier === 2;
  rect(-12, 1, 24, 36, gold ? '#ffcd75' : b.jersey);
  if (gold) rect(-11, 2, 22, 34, b.jersey);
  for (let i = 0; i < 6; i++) rect(-12 + i, 37 + i, 12 - i, 1, gold ? '#ffcd75' : b.jersey); // the notched bottom
  for (let i = 0; i < 6; i++) rect(i, 37 + i, 12 - i, 1, gold ? '#ffcd75' : b.jersey);
  drawText(ctx, String(b.number), x, top + 10, b.trim, { align: 'center', scale: 2 });
  if (gold) {
    for (let i = 0; i < Math.min(b.stars, 5); i++) {
      const sx = -8 + i * 4;
      rect(sx + 1, 26, 1, 3, '#ffcd75');
      rect(sx, 27, 3, 1, '#ffcd75');
    }
  }
}

// An outdoor court's backdrop instead of the stands (court.outdoor): sky bands, the sun or the moon, the city's
// buildings with lit windows (or trees in the park), a brick wall if there is one, and the chain-link fence.
// Everything scrolls a little slower than the court for depth.
function drawOutdoor(ctx, o) {
  const floorTop = Math.floor(screenYForWorldY(-COURT.apron));
  const band = Math.ceil(floorTop / o.sky.length);
  o.sky.forEach((color, i) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, i * band, VIEW_W, band);
  });
  const far = Math.round(camera.renderX * 0.15);
  if (o.sun || o.moon) {
    ctx.fillStyle = o.sun || o.moon;
    ctx.beginPath();
    ctx.arc(470 - far * 0.3, o.sun ? 46 : 22, o.sun ? 16 : 7, 0, Math.PI * 2);
    ctx.fill();
  }
  const near = Math.round(camera.renderX * 0.35);
  const base = floorTop - (o.wall ? 14 : 0);
  if (o.buildings) {
    // Fixed widths and heights from a hash of each block, so the skyline doesn't change as it scrolls.
    for (let k = Math.floor(near / 48) - 1; k < Math.floor(near / 48) + 16; k++) {
      const x = k * 48 - near;
      const w = 30 + Math.floor(hash2(k, 3) * 16);
      const h = 24 + Math.floor(hash2(k, 5) * 56);
      ctx.fillStyle = o.buildings[k & 1];
      ctx.fillRect(x, base - h, w, h);
      ctx.fillStyle = o.windows;
      for (let wy = base - h + 4; wy < base - 6; wy += 7) {
        for (let wx = x + 4; wx < x + w - 4; wx += 6) if (hash2(wx + k * 7, wy) < 0.3) ctx.fillRect(wx, wy, 2, 3);
      }
    }
  }
  if (o.trees) {
    for (let k = Math.floor(near / 40) - 1; k < Math.floor(near / 40) + 18; k++) {
      const x = k * 40 - near + Math.floor(hash2(k, 9) * 14);
      const r = 12 + Math.floor(hash2(k, 11) * 8);
      ctx.fillStyle = '#5a3524';
      ctx.fillRect(x - 2, base - 16, 4, 16);
      ctx.fillStyle = o.trees[k & 1];
      ctx.beginPath();
      ctx.arc(x, base - 16 - r * 0.6, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (o.wall) {
    ctx.fillStyle = o.wall;
    ctx.fillRect(0, base, VIEW_W, floorTop - base);
    ctx.fillStyle = shade(o.wall, 0.75);
    for (let y = base + 3; y < floorTop; y += 4) ctx.fillRect(0, y, VIEW_W, 1);
  }
  // The fence: a diamond mesh over the lower backdrop, with posts.
  const top = Math.max(0, floorTop - 70);
  ctx.fillStyle = o.fence;
  ctx.globalAlpha = 0.45;
  for (let y = top; y < floorTop; y++) {
    for (let x = (y - near) % 8; x < VIEW_W; x += 8) ctx.fillRect(x, y, 1, 1);
    for (let x = 8 - ((y + near) % 8); x < VIEW_W; x += 8) ctx.fillRect(x, y, 1, 1);
  }
  ctx.globalAlpha = 1;
  ctx.fillRect(0, top - 2, VIEW_W, 2);
  for (let x = -(Math.round(camera.renderX * 0.6) % 120); x < VIEW_W; x += 120) ctx.fillRect(x, top - 2, 3, floorTop - top + 2);
  // Rooftop: a string of lights across the top.
  if (o.lights) {
    for (let x = -(near % 24); x < VIEW_W; x += 24) {
      ctx.fillStyle = '#ffcd75';
      ctx.fillRect(x, 18 + Math.round(Math.sin((x + near) / 60) * 4), 2, 2);
    }
  }
}

// The court's lighting, over the floor and players and under the HUD: a night tint (Rooftop Cage), or Finals Night's
// house lights down with a spotlight from above pooled on whoever has the ball (or the loose ball itself).
const spot = { x: VIEW_W / 2, y: VIEW_H / 2 };
let spotLayer = null;
function drawCourtLighting(ctx, game) {
  if (court.night) {
    ctx.fillStyle = `rgba(13, 14, 22, ${court.night})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (!court.spotlight) return;
  const { ball } = game;
  const target = ball.held && ball.holder ? { x: ball.holder.sx, y: ball.holder.sy } : { x: ball.sx, y: ball.sy };
  if (Number.isFinite(target.x) && Number.isFinite(target.y)) {
    spot.x += (target.x - spot.x) * 0.2;
    spot.y += (target.y - spot.y) * 0.2;
  }
  // The cone: narrow at the rafters, an ellipse of light on the floor around the ball.
  const cone = (c) => {
    c.beginPath();
    c.moveTo(spot.x - 10, 0);
    c.lineTo(spot.x + 10, 0);
    c.lineTo(spot.x + 40, spot.y - 4);
    c.ellipse(spot.x, spot.y, 40, 14, 0, 0, Math.PI);
    c.lineTo(spot.x - 40, spot.y - 4);
    c.closePath();
  };
  if (!spotLayer) {
    spotLayer = document.createElement('canvas');
    spotLayer.width = VIEW_W;
    spotLayer.height = VIEW_H;
  }
  const s = spotLayer.getContext('2d');
  s.globalCompositeOperation = 'source-over';
  s.clearRect(0, 0, VIEW_W, VIEW_H);
  s.fillStyle = 'rgba(13, 14, 22, 0.55)';
  s.fillRect(0, 0, VIEW_W, VIEW_H);
  s.globalCompositeOperation = 'destination-out';
  cone(s);
  s.fill();
  ctx.drawImage(spotLayer, 0, 0);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255, 205, 117, 0.10)';
  cone(ctx);
  ctx.fill();
  ctx.restore();
}
