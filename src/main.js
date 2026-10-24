const stage = document.getElementById('stage');
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

const STEP = 1 / 60;

// All shadows are drawn opaque here first, then laid over the floor in one pass so overlaps don't double up.
const shadowLayer = document.createElement('canvas');
shadowLayer.width = VIEW_W;
shadowLayer.height = VIEW_H;
const shadowCtx = shadowLayer.getContext('2d');

const state = {
  time: 0,
  player: new Player({ x: COURT.length / 2 - 40, y: COURT.width / 2 + 20, look: loadLook() }),
  ball: new Ball(),
  meter: null,
  popups: [],
  outFor: 0, // how long the loose ball has been behind a backboard
  debris: [],
  fade: null, // { t } while fading to black and back for a reset
  hitStop: 0, // seconds the action freezes for impact (dunk slams)
  stats: { pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0 },
};

function update(dt) {
  if (state.hitStop > 0) {
    state.hitStop -= dt;
    return;
  }
  state.time += dt;
  const { player: p, ball } = state;
  updateFade(dt);

  // Hold still while the camera pans back to center or the screen fades for a reset.
  const frozen = camera.pan || state.fade;
  p.update(dt, frozen ? { x: 0, y: 0 } : Input.move(), Input.sprint());
  Shooting.update(dt, state, !frozen && Input.shoot(), !frozen && Input.dunk());
  ball.update(dt);
  handleBallEvents();
  tryPickup();
  if (!state.fade) checkBallBehindHoop(dt);
  updateHoops(dt);
  updateDebris(state, dt);
  updatePopups(state, dt);

  // While the ball is loose, frame both the player and the ball. Zoom out the farther the player is from a hoop.
  const hoop = nearestHoop(p.x);
  const fromHoop = Math.hypot(p.x - hoop.x, p.y - hoop.y);
  const zoomT = clamp((fromHoop - CAMERA.zoomNear) / (CAMERA.zoomFar - CAMERA.zoomNear), 0, 1);
  const ballX = ball.held ? p.x : ball.x;
  const tilt = 1 - clamp(Math.abs(ballX - COURT.length / 2) / CAMERA.tiltRange, 0, 1);
  camera.update(dt, ball.held ? p.x + p.vx * CAMERA.lead : (p.x + ball.x) / 2, lerp(1, CAMERA.zoomMin, zoomT), tilt);
}

// A loose ball behind either backboard can still be grabbed, but if it stays there for RESET.outTime it comes
// back at center court. Picking it up or it bouncing back out in front clears the count.
function checkBallBehindHoop(dt) {
  const { ball } = state;
  const behind = !ball.held && HOOPS.some((h) => (ball.x - h.boardX) * h.dir < 0);
  if (!behind) {
    state.outFor = 0;
    return;
  }
  state.outFor += dt;
  if (state.outFor >= RESET.outTime) {
    state.outFor = 0;
    resetToCenter();
  }
}

// Fade to black, reset to center (with the hoops fixed and debris cleared) while it's dark, then fade back in.
function fadeToReset() {
  state.fade = { t: 0 };
}

function updateFade(dt) {
  const f = state.fade;
  if (!f) return;
  const before = f.t;
  f.t += dt;
  if (before < FADE.out && f.t >= FADE.out) {
    restoreHoops();
    state.debris = [];
    state.popups = [];
    resetToCenter(true);
  }
  if (f.t >= FADE.out + FADE.hold + FADE.in) state.fade = null;
}

function fadeAlpha() {
  const t = state.fade.t;
  if (t < FADE.out) return t / FADE.out;
  if (t < FADE.out + FADE.hold) return 1;
  return 1 - (t - FADE.out - FADE.hold) / FADE.in;
}

// Fresh ball dropped at center court, the player placed on one of six spots around the center circle,
// and the camera glides over to them (or jumps straight there when the screen is black).
function resetToCenter(instant = false) {
  const { player: p, ball } = state;
  const cx = COURT.length / 2;
  const cy = COURT.width / 2;
  const a = (Math.floor(Math.random() * RESET.spots) * 2 * Math.PI) / RESET.spots;
  const x = cx + Math.cos(a) * COURT.circleR;
  const y = cy + Math.sin(a) * COURT.circleR;
  Object.assign(p, { x, y, prevX: x, prevY: y, z: 0, prevZ: 0, vx: 0, vy: 0, shot: null, hasBall: false, hangSway: 0 });
  if (Math.abs(x - cx) > 1) p.facing = x < cx ? 1 : -1;
  ball.respawn(cx, cy, RESET.dropHeight);
  state.meter = null;
  if (instant) camera.snap(cx);
  else camera.panTo(cx, RESET.panTime);
}

function handleBallEvents() {
  const { ball, stats } = state;
  for (const e of ball.events) {
    if (e.type === 'score') {
      stats.pts += e.points;
      stats.fgm++;
      if (e.points === 3) stats.tpm++;
      addPopup(state, `+${e.points}`, COLORS.okay, e.hoop.x, e.hoop.y, HOOP.rimZ + 16);
      if (e.dunk) {
        addPopup(state, 'DUNK!', COLORS.bad, e.hoop.x, e.hoop.y, HOOP.rimZ + 26);
        camera.shake = DUNK.shake;
      } else if (e.swish) {
        addPopup(state, 'SWISH', COLORS.line, e.hoop.x, e.hoop.y, HOOP.rimZ + 26);
      }
    } else if (e.type === 'airball') {
      addPopup(state, 'AIRBALL', COLORS.bad, e.x, e.y, 20);
    }
  }
  ball.events.length = 0;
}

// Run over a loose ball (low enough to reach) to grab it.
function tryPickup() {
  const { player: p, ball } = state;
  if (ball.held || p.shot || ball.noPickup > 0 || ball.z > PICKUP.reach) return;
  if (Math.abs(ball.x - p.x) > PICKUP.radius || Math.abs(ball.y - p.y) > PICKUP.radius) return;
  ball.held = true;
  ball.shot = null;
  p.hasBall = true;
}

function render(alpha) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  camera.prepare(alpha);
  drawArena(ctx, state.time);
  drawCourt(ctx);

  // Everything standing on the floor is drawn back-to-front by depth.
  const { player, ball } = state;
  const movers = ball.held ? [player] : [player, ball];
  for (const m of movers) m.prepare(alpha);

  shadowCtx.clearRect(0, 0, VIEW_W, VIEW_H);
  for (const h of HOOPS) drawHoopShadow(shadowCtx, h);
  for (const m of movers) m.drawShadow(shadowCtx);
  ctx.globalAlpha = SHADOW.alpha;
  ctx.drawImage(shadowLayer, 0, 0);
  ctx.globalAlpha = 1;

  const layers = [...movers, ...HOOP_LAYERS, ...debrisLayers(state)].sort((a, b) => a.y - b.y);
  for (const l of layers) l.draw(ctx);

  if (state.meter) drawShotMeter(ctx, state.meter, player);
  drawPopups(ctx, state);
  drawHud(ctx, state);
  if (state.fade) {
    ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha()})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (Menu.isOpen()) drawPauseDim(ctx);
  else if (!document.hasFocus()) drawFocusOverlay(ctx, state.time);
}

// Fixed-timestep loop: physics always ticks at 60Hz, rendering interpolates between ticks.
// While paused the simulation simply stops advancing.
let last = performance.now();
let acc = 0;
function frame(now) {
  const elapsed = Math.min((now - last) / 1000, 0.25);
  last = now;
  if (!Menu.isOpen()) {
    acc += elapsed;
    while (acc >= STEP) {
      update(STEP);
      acc -= STEP;
    }
  }
  render(acc / STEP);
  requestAnimationFrame(frame);
}

// Scale to the largest whole multiple of device pixels that fits, so every game pixel is the same size.
// --px (1/320 of the game's width in CSS pixels) lets the HTML menu scale with the game.
function fitCanvas() {
  const dpr = window.devicePixelRatio || 1;
  const fit = Math.min((window.innerWidth * dpr) / VIEW_W, (window.innerHeight * dpr) / VIEW_H);
  const scale = fit >= 1 ? Math.floor(fit) : fit;
  const px = scale / dpr;
  stage.style.width = `${VIEW_W * px}px`;
  stage.style.height = `${VIEW_H * px}px`;
  stage.style.setProperty('--px', `${(px * VIEW_W) / 320}px`);
}

window.addEventListener('resize', fitCanvas);
canvas.addEventListener('pointerdown', () => {
  window.focus();
  canvas.focus();
});

Menu.init(state.player);
fitCanvas();
requestAnimationFrame(frame);
