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

const newStats = () => ({ pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, stl: 0, blk: 0 });

const state = {
  time: 0,
  mode: loadMode(),  // '3v3' or 'free' (free shot: just the user, no AI)
  look: loadLook(),  // the user's custom look; team colors come from it
  team: loadTeam(),  // the user's team: [{ name, upgrades }] by role
  rules: loadPrefs(RULES_STORAGE_KEY, DEFAULT_RULES), // { freeThrows }
  ui: loadPrefs(UI_STORAGE_KEY, DEFAULT_UI),          // { stats }: what the HUD shows
  roster: [],        // all six players, in either mode
  players: [],       // the ones on the court: everyone in 3v3, just the user's player in free shot
  user: null,        // the player the user controls
  ref: null,         // the referee (3v3 only; see ref.js)
  ball: new Ball(),
  possession: 0,     // team with the ball (or that last had it)
  score: [0, 0],
  stats: [newStats(), newStats()],
  popups: [],
  outFor: 0, // how long the loose ball has been behind a backboard
  debris: [],
  fade: null, // { t } while fading to black and back for a reset
  hitStop: 0, // seconds the action freezes for impact (dunk slams)
  freeThrow: null, // { shooter, pending } from a foul until the shot is away (pending: called, not lined up yet)
};

// A fresh game in `mode`: scores cleared, hoops fixed, everyone lined up, the user's player with the ball.
function newGame(mode) {
  state.mode = mode;
  state.roster = makePlayers(state.look, state.team);
  const star = state.roster[0];
  rollAIUpgrades(state.roster, state.team);
  state.players = mode === 'free' ? [star] : state.roster;
  state.ref = mode === 'free' ? null : Ref.make();
  state.user = star;
  state.score = [0, 0];
  state.stats = [newStats(), newStats()];
  state.popups = [];
  state.debris = [];
  state.fade = null;
  state.outFor = 0;
  state.freeThrow = null;
  restoreHoops();
  lineUp();
  Play.give(state, star);
  camera.snap(star.x);
}

function update(dt) {
  if (state.hitStop > 0) {
    state.hitStop -= dt;
    return;
  }
  state.time += dt;
  const { ball } = state;
  updateFade(dt);

  // Hold still while the camera pans back to center or the screen fades for a reset.
  const frozen = !!(camera.pan || state.fade);
  const ctls = new Map();
  ctls.set(state.user, userControls(frozen));
  AIBrain.think(dt, state, ctls, frozen);
  if (state.freeThrow) freeThrowControls(ctls);

  for (const p of state.players) {
    const c = ctls.get(p);
    p.update(dt, c.move, Play.retreatBoost(state, p, c.move));
    if (c.face && !p.airborne() && !p.sitting) p.facing = c.face;
  }
  Ref.update(dt, state, frozen);
  for (const p of state.players) Shooting.update(dt, state, p, ctls.get(p));
  // The free throw is away: everyone is free to go for the rebound.
  const ft = state.freeThrow;
  if (ft && !ft.pending && ft.shooter.shot && ft.shooter.shot.released) state.freeThrow = null;
  for (const p of state.players) Play.act(state, p, ctls.get(p));
  if (state.freeThrow && state.freeThrow.pending) startFreeThrow(state.freeThrow.shooter);
  if (ctls.get(state.user).switch) Play.switchPlayer(state);
  Play.separate(state);

  ball.update(dt);
  handleBallEvents();
  Play.pickups(state);
  // The out-of-bounds count waits while anyone is dunking (or hanging on the rim).
  if (!state.fade && !state.players.some((p) => p.shot && p.shot.dunk)) checkBallBehindHoop(dt);
  updateHoops(dt);
  updateDebris(state, dt);
  updatePopups(state, dt);
  updateScoreboard(dt, state.score[0], state.score[1]);

  // Follow the ball (leading a dribbler). In free shot, frame both the player and a loose ball.
  // Zoom out the farther the action is from a hoop.
  const u = state.user;
  const holder = ball.holder;
  const focus = holder || (state.mode === 'free' ? { x: (u.x + ball.x) / 2, y: (u.y + ball.y) / 2 } : ball);
  const hoop = nearestHoop(focus.x);
  const fromHoop = Math.hypot(focus.x - hoop.x, focus.y - hoop.y);
  const zoomT = clamp((fromHoop - CAMERA.zoomNear) / (CAMERA.zoomFar - CAMERA.zoomNear), 0, 1);
  const tilt = 1 - clamp(Math.abs(focus.x - COURT.length / 2) / CAMERA.tiltRange, 0, 1);
  camera.update(dt, holder ? holder.x + holder.vx * CAMERA.lead : focus.x, lerp(1, CAMERA.zoomMin, zoomT), tilt);
}

// The keyboard, read as a control object (the same shape the AI fills in). Space shoots with the ball and jumps
// to block (or at least contest) without it; E dunks with the ball and steals on defense; Q passes with the ball and switches player
// otherwise.
let prevKeys = {};
function userControls(frozen) {
  const keys = frozen ? {} : { shoot: Input.shoot(), action: Input.action(), pass: Input.pass() };
  const prev = prevKeys;
  const pressed = (k) => !!keys[k] && !prev[k];
  prevKeys = keys;

  const u = state.user;
  const holder = state.ball.holder;
  const ctl = AIBrain.blank();
  ctl.move = frozen ? { x: 0, y: 0 } : Input.move();
  // Double-tapping a direction dashes that way.
  ctl.dash = frozen ? null : Input.takeDash();
  ctl.shoot = !!keys.shoot;
  if (u.hasBall || u.shot) {
    ctl.dunk = !!keys.action;
    if (pressed('pass') && u.hasBall) ctl.pass = Play.passTarget(state, u, ctl.move);
  } else if (state.mode === 'free') {
    // Free shot: the pass key calls the ball, which flies back to the player wherever they are.
    if (pressed('pass') && !u.sitting) Play.callBall(state, u);
  } else {
    if (pressed('shoot')) ctl.jump = true;
    if (pressed('action') && holder && holder.team !== u.team) ctl.steal = true;
    if (pressed('pass') && !(holder && holder.team === u.team)) ctl.switch = true;
  }
  return ctl;
}

// A loose ball behind either backboard can still be grabbed, but if it stays there for RESET.outTime play resets
// (see resetToCenter). Picking it up or it bouncing back out in front clears the count. The reset announces who
// knocked it out ("OUT ON PLAYER" for the home team, "OUT ON AI" for away) over the ball's new spot.
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
    const outOn = ball.lastTeam === null ? 1 - state.possession : ball.lastTeam;
    resetToCenter();
    if (state.mode === '3v3' || outOn === 0) {
      const text = outOn === 0 ? 'OUT ON PLAYER' : 'OUT ON AI';
      const at = ball.holder || ball;
      addPopup(state, text, outOn === 0 ? COLORS.bad : COLORS.okay, at.x, at.y, RESET.outTextZ, RESET.outTextTime);
    }
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
    scatterBenchClutter();
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

// Everyone back to their starting spots, standing, empty-handed. In free shot the lone player goes to one of six
// spots around the center circle; in 3v3 the teams line up on their own halves. `spotFor(p)` picks other spots.
function lineUp(spotFor = null) {
  const cx = COURT.length / 2;
  const cy = COURT.width / 2;
  for (const p of state.players) {
    let at;
    if (spotFor) {
      at = spotFor(p);
    } else if (state.mode === 'free') {
      const a = (Math.floor(Math.random() * RESET.spots) * 2 * Math.PI) / RESET.spots;
      at = { x: cx + Math.cos(a) * COURT.circleR, y: cy + Math.sin(a) * COURT.circleR };
    } else {
      at = formationSpot(p.team, p.role);
    }
    Object.assign(p, {
      x: at.x, y: at.y, prevX: at.x, prevY: at.y, z: 0, prevZ: 0, vx: 0, vy: 0,
      shot: null, jump: null, meter: null, hasBall: false, hangSway: 0, pose: null, sitting: false,
      stunT: 0, dazedT: 0, reachT: 0, runT: 0, dashT: 0, dashCD: 0, dashDir: { x: 0, y: 0 }, mind: {},
    });
    if (Math.abs(at.x - cx) > 1) p.facing = at.x < cx ? 1 : -1;
  }
  for (const h of HOOPS) h.hanging = false;
}

// Everyone lined up again and the camera gliding over (or jumping straight there when the screen is black).
// In 3v3 the team that didn't touch the ball last gets it, starting on their own half; in free shot a fresh ball
// drops at center court.
function resetToCenter(instant = false) {
  const { ball } = state;
  const cx = COURT.length / 2;
  const cy = COURT.width / 2;
  const lastTeam = ball.lastTeam === null ? 1 - state.possession : ball.lastTeam;
  state.freeThrow = null;
  if (state.ref) state.ref.hasBall = false;
  lineUp();
  state.user = state.players[0];
  let focusX = cx;
  if (state.mode === '3v3') {
    const team = 1 - lastTeam;
    const p = state.players.find((q) => q.team === team && q.role === 0);
    Play.give(state, p);
    focusX = p.x;
  } else {
    ball.respawn(cx, cy, RESET.dropHeight);
  }
  if (instant) camera.snap(focusX);
  else camera.panTo(focusX, RESET.panTime);
}

// A foul with free throws on: everyone lines up at the end the shooter attacks, the fouled player just behind the
// free-throw line, defenders on the lane spots nearest the hoop and one up top, the shooter's teammates on the
// next lane spots. The ref holds the ball in the lane and passes it in after REF.passDelay (Ref.update). Play
// waits for the one shot (freeThrowControls, AIBrain).
function startFreeThrow(shooter) {
  const { ball, ref } = state;
  const hoop = attackHoop(shooter.team);
  const at = (a, dy) => ({ x: hoop.x + hoop.dir * a, y: COURT.width / 2 + dy });
  const line = COURT.keyDepth - COURT.hoopX + FOUL.ftBack;
  const lane = COURT.keyHalfWidth + 6;
  const defense = [at(20, -lane), at(20, lane), at(line + 50, 0)];
  const offense = [at(44, -lane), at(44, lane)];
  lineUp((p) => (p === shooter ? at(line, 0) : p.team === shooter.team ? offense.shift() : defense.shift()));
  for (const p of state.players) p.facing = -hoop.dir;
  const spot = at(REF.spot, 0);
  Object.assign(ref, { x: spot.x, y: spot.y, prevX: spot.x, prevY: spot.y, vx: 0, vy: 0, facing: hoop.dir, hasBall: true });
  Object.assign(ball, { held: true, holder: null, shot: null, pass: null, lockT: 0, x: spot.x, y: spot.y, z: 20 });
  ball.reserved = shooter.team;
  ball.lastTeam = shooter.team;
  state.possession = shooter.team;
  state.user = shooter.team === 0 ? shooter : state.players[0];
  state.freeThrow = { shooter, pending: false, refT: REF.passDelay };
  state.outFor = 0;
  camera.panTo(shooter.x, RESET.panTime);
  addPopup(state, 'FREE THROW', COLORS.okay, shooter.x, shooter.y, RESET.outTextZ, FOUL.textTime);
}

// At the line only the shooter does anything, and only shoot; everyone else waits for the release.
function freeThrowControls(ctls) {
  const { shooter } = state.freeThrow;
  for (const [p, c] of ctls) ctls.set(p, { ...AIBrain.blank(), shoot: p === shooter && c.shoot });
}

function handleBallEvents() {
  const { ball } = state;
  for (const e of ball.events) {
    if (e.type === 'score') {
      const team = e.team || 0;
      const stats = state.stats[team];
      state.score[team] += e.points;
      stats.pts += e.points;
      if (e.ft) stats.ftm++;
      else stats.fgm++;
      if (e.points === 3) stats.tpm++;
      addPopup(state, `+${e.points}`, team === 0 ? COLORS.okay : COLORS.hint, e.hoop.x, e.hoop.y, HOOP.rimZ + 16);
      if (e.dunk) {
        addPopup(state, 'DUNK!', COLORS.bad, e.hoop.x, e.hoop.y, HOOP.rimZ + 26);
        camera.shake = DUNK.shake;
      } else if (e.swish) {
        addPopup(state, 'SWISH', COLORS.line, e.hoop.x, e.hoop.y, HOOP.rimZ + 26);
      }
      // The other team brings it back in: only they can pick it up.
      if (state.mode !== 'free') {
        ball.reserved = 1 - team;
        state.possession = 1 - team;
      }
    } else if (e.type === 'airball') {
      addPopup(state, 'AIRBALL', COLORS.bad, e.x, e.y, 20);
    }
  }
  ball.events.length = 0;
}

function render(alpha) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  camera.prepare(alpha);
  drawArena(ctx, state.time);
  drawCourt(ctx);

  // Everything standing on the floor is drawn back-to-front by depth.
  const { ball, user } = state;
  const movers = ball.held ? [...state.players] : [...state.players, ball];
  if (state.ref) movers.push(state.ref);
  for (const m of movers) m.prepare(alpha);

  shadowCtx.clearRect(0, 0, VIEW_W, VIEW_H);
  for (const h of HOOPS) drawHoopShadow(shadowCtx, h);
  drawBenchShadows(shadowCtx);
  drawTableShadow(shadowCtx);
  for (const m of movers) m.drawShadow(shadowCtx);
  ctx.globalAlpha = SHADOW.alpha;
  ctx.drawImage(shadowLayer, 0, 0);
  ctx.globalAlpha = 1;

  const jersey = state.look.jersey;
  const layers = [...benchLayers(jersey), tableLayer(jersey), ...movers, ...HOOP_LAYERS, ...debrisLayers(state)].sort((a, b) => a.y - b.y);
  for (const l of layers) l.draw(ctx);

  for (const p of state.players) {
    if (p.dashT > 0) drawDashLines(ctx, p);
    if (p.dazedT > 0) drawDazed(ctx, p, state.time);
  }
  drawDashCooldown(ctx, user);
  if (state.players.length > 1) drawUserMarker(ctx, user);
  // With the ball, show who a pass would go to (it follows the direction held, like the pass itself).
  if (user.hasBall && !user.shot && state.players.length > 1) {
    const target = Play.passTarget(state, user, Input.move());
    if (target) drawPassTarget(ctx, target);
  }
  if (user.meter) drawShotMeter(ctx, user.meter, user);
  if (user.shot && user.shot.dunk && user.shot.hang === Infinity && user.shot.released) {
    drawHangPrompt(ctx, user, state.time);
  }
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
// While paused (the menu is open, or the game lost focus and shows "click to play") the simulation stops advancing.
let last = performance.now();
let acc = 0;
function frame(now) {
  const elapsed = Math.min((now - last) / 1000, 0.25);
  last = now;
  if (!Menu.isOpen() && document.hasFocus()) {
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

newGame(state.mode);
Menu.init({
  look: state.look,
  setLook(look) {
    state.look = look;
    setTeamLooks(state.roster, look, state.team);
  },
  team: state.team,
  upgradesChanged: () => rollAIUpgrades(state.roster, state.team),
  rules: state.rules,
  ui: state.ui,
  mode: () => state.mode,
  setMode: newGame,
});
fitCanvas();
requestAnimationFrame(frame);
