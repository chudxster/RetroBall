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

const newStats = () => ({ pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, stl: 0, blk: 0, dnk: 0 });

const state = {
  time: 0,
  // 'demo' (the AI playing itself behind the main menu, see title.js), '3v3', 'career' (a career game, see
  // career.js), 'duo' (2 Player, see duo.js), 'free' (free shot) or 'world' (Around the World): the last two just
  // the user
  mode: 'demo',
  look: loadLook(),  // the user's custom look; team colors come from it
  team: loadTeam(),  // the user's team: [{ name, upgrades }] by role
  rules: loadPrefs(RULES_STORAGE_KEY, DEFAULT_RULES), // { freeThrows }
  ui: loadPrefs(UI_STORAGE_KEY, DEFAULT_UI),          // { stats }: what the HUD shows
  roster: [],        // all six players, in either mode
  players: [],       // the ones on the court: everyone in 3v3, just the user's player in free shot
  // The people playing: { pad (key set, see Input), team, start (their player at a reset), player (the one they
  // control now), prevKeys, ctl }. One in every mode but 2 Player (two) and the demo (none).
  humans: [],
  get user() {       // the (first) person's player
    return this.humans.length ? this.humans[0].player : null;
  },
  draft: null,       // a 2 Player upgrade draft in progress (see Duo)
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
  freeThrow: null, // { shooter, pending, waitT } from a foul until the shot is away (pending: whistled, waiting)
  clock: null,     // the 3v3 game and shot clocks (see clock.js)
  drill: null,     // Around the World progress (see practice.js)
  replayReady: false, // after the final buzzer: the shoot key has been let go, so pressing it starts a new game
  abbrs: ['HOME', 'AWAY'], // the teams' names on the HUD
  challenge: null,    // a career game's picked challenge
  careerResult: null, // a finished career game's tokens and result (see Career.finish)
};

// A fresh game in `mode`: scores cleared, hoops fixed, everyone lined up, the user's player with the ball. In 2
// Player mode `runBack` keeps the last game's pre-game upgrades instead of drafting again.
function newGame(mode, runBack = false) {
  state.mode = mode;
  endsSwapped = false;
  const duo = mode === 'duo';
  Input.setTwoPlayer(duo && !Net.online()); // online, the host plays on the solo keys
  Sfx.setQuiet(mode === 'demo' ? SOUND.demoVolume : 1);
  // A career game: the opponent's kit (unless it's too close to the home jersey), AI level and upgrades, and the
  // career team's own levels.
  const career = mode === 'career' ? Career.setup() : null;
  awayKit = career && !colorsClash(career.kit.jersey, state.look.jersey) ? career.kit : null;
  // Opponents: a career team's own level; in Quick game and 2 Player co-op, the picked difficulty; in the demo,
  // AI.level. (In 2 Player versus every AI player plays at the teammate level: see evenTeams.)
  const picked = mode === '3v3' || (duo && !Duo.versus()) ? DIFFICULTY[difficultyOf(state.rules)].ai : null;
  opponentAILevel = career ? career.aiLevel : picked;
  teammateAILevel = career ? career.teammateLevel : null;
  evenTeams = duo && Duo.versus();
  state.abbrs = career ? career.abbrs : duo && Duo.versus() ? ['P1', 'P2'] : ['HOME', 'AWAY'];
  state.challenge = career ? career.challenge : null;
  state.careerResult = null;
  state.roster = makePlayers(state.look, state.team);
  for (const p of state.roster) p.stats = newStats(); // each player's own line on the final screen's box score
  const star = state.roster[0];
  if (career) rollAIUpgrades(state.roster, Career.team(), career.upgrades);
  else rollAIUpgrades(state.roster, state.team);
  const solo = !isFullGame(state); // free shot and the practice drills: just the user's player
  state.players = solo ? [star] : duo ? Duo.players(state.roster) : state.roster;
  state.ref = solo ? null : Ref.make();
  const people = duo ? Duo.humans(state.roster) : mode === 'demo' ? [] : [{ pad: 'solo', team: 0, start: star }];
  state.humans = people.map((h) => ({ ...h, player: h.start, prevKeys: {}, ctl: null }));
  state.draft = null;
  state.score = [0, 0];
  state.stats = [newStats(), newStats()];
  state.popups = [];
  state.debris = [];
  state.fade = null;
  state.outFor = 0;
  state.freeThrow = null;
  crowdHype.t = 0;
  restoreHoops();
  lineUp();
  Play.give(state, star);
  camera.snap(star.x);
  state.replayReady = false;
  if (!solo) Clock.start(state);
  else state.clock = null;
  state.drill = null;
  if (mode === 'world') Practice.start(state);
  if (duo) Duo.start(state, runBack);
}

function update(dt) {
  if (state.hitStop > 0) {
    state.hitStop -= dt;
    return;
  }
  state.time += dt;
  const { ball } = state;
  updateFade(dt);

  // Hold still while the camera pans back to center, the screen fades for a reset, between periods, or after a
  // foul's whistle until the free throw is set up.
  const whistle = !!(state.freeThrow && state.freeThrow.pending);
  const frozen = !!(camera.pan || state.fade) || Clock.stopped(state) || whistle;
  // After the final buzzer, a fresh press of the shoot key starts a new game (in career, goes to the main menu's
  // Career screen to pick the next one). In 2 Player, player 1's shoot key runs it back and player 2's starts a new
  // draft (see Duo.updateAfter). The demo just starts another.
  if (state.clock && state.clock.over && state.mode === 'demo') {
    if (state.clock.overT > TITLE.demoRestart) {
      newGame('demo');
      return;
    }
  } else if (state.clock && state.clock.over && state.clock.overT > 1) {
    if (state.mode === 'duo') {
      const before = state.clock;
      Duo.updateAfter(state, newGame);
      if (state.clock !== before) return;
    } else if (!Input.shoot()) {
      state.replayReady = true;
    } else if (state.replayReady) {
      state.replayReady = false;
      if (state.mode === 'career') toTitle('career');
      else newGame(state.mode);
      return;
    }
  }
  if (state.draft) Duo.updateDraft(state);
  const ctls = new Map();
  for (const h of state.humans) {
    h.ctl = humanControls(h, frozen);
    ctls.set(h.player, h.ctl);
  }
  AIBrain.think(dt, state, ctls, frozen);
  if (state.freeThrow) freeThrowControls(ctls);
  if (state.drill) Practice.controls(state, ctls);

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
  // After the whistle and the pause, line up for the free throw.
  const called = state.freeThrow;
  if (called && called.pending) {
    called.waitT -= dt;
    if (called.waitT <= 0) startFreeThrow(called.shooter);
  }
  for (const h of state.humans) {
    if (h.ctl.switch) Play.switchPlayer(state, h);
    if (h.ctl.call) Play.callFor(state, h.player);
  }
  Play.separate(state);

  ball.update(dt);
  handleBallEvents();
  Play.pickups(state);
  Clock.update(dt, state, frozen);
  // A career game's final buzzer: tokens, standings and the next game are settled right away.
  if (state.mode === 'career' && state.clock.over && !state.careerResult) state.careerResult = Career.finish(state);
  Practice.update(dt, state);
  // The out-of-bounds count waits while anyone is dunking (or hanging on the rim). The drill hands the ball back
  // itself.
  if (!state.fade && !state.drill && !whistle && !state.players.some((p) => p.shot && p.shot.dunk)) checkBallBehindHoop(dt);
  updateHoops(dt);
  updateDebris(state, dt);
  updatePopups(state, dt);
  updateCrowd(dt);
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

// A person's keys (their pad), read as a control object (the same shape the AI fills in). Shoot shoots with the
// ball and jumps to block (or at least contest) without it; action dunks with the ball and steals on defense; pass
// passes with the ball, calls for it while a teammate has it, and switches player otherwise.
function humanControls(h, frozen) {
  const pad = Input.pad(h.pad);
  const keys = frozen ? {} : { shoot: pad.shoot(), action: pad.action(), pass: pad.pass() };
  const prev = h.prevKeys;
  const pressed = (k) => !!keys[k] && !prev[k];
  h.prevKeys = keys;

  const u = h.player;
  const holder = state.ball.holder;
  const ctl = AIBrain.blank();
  ctl.move = frozen ? { x: 0, y: 0 } : pad.move();
  // Double-tapping a direction dashes that way.
  ctl.dash = frozen ? null : pad.takeDash();
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
    else if (pressed('pass') && holder && holder !== u) ctl.call = true; // a teammate has it: call for it
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
    if (isFullGame(state) || outOn === 0) {
      const names = state.mode === 'duo' && Duo.versus() ? ['P1', 'P2'] : ['PLAYER', 'AI'];
      const text = `OUT ON ${names[outOn]}`;
      const at = ball.holder || ball;
      addPopup(state, text, playColor(state, 1 - outOn), at.x, at.y, RESET.outTextZ, RESET.outTextTime);
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
  if (isFullGame(state)) {
    restartPlay(1 - lastTeam, instant);
    return;
  }
  state.freeThrow = null;
  lineUp();
  for (const h of state.humans) h.player = h.start;
  ball.respawn(cx, cy, RESET.dropHeight);
  if (instant) camera.snap(cx);
  else camera.panTo(cx, RESET.panTime);
}

// 3v3: everyone back on their own halves and `team`'s first player with the ball (a fresh shot clock), the camera
// gliding over (or jumping there when the screen is black).
function restartPlay(team, instant = false) {
  state.freeThrow = null;
  if (state.ref) state.ref.hasBall = false;
  lineUp();
  for (const h of state.humans) h.player = h.start;
  const p = state.players.find((q) => q.team === team && q.role === 0);
  Play.give(state, p);
  Clock.resetShot(state, team);
  if (instant) camera.snap(p.x);
  else camera.panTo(p.x, RESET.panTime);
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
  // A person alone on their side plays the shooter, or waits on their starting player on the other side.
  for (const h of state.humans) {
    if (state.humans.some((o) => o !== h && o.team === h.team)) continue;
    h.player = h.team === shooter.team ? shooter : h.start;
  }
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
      Practice.scored(state);
      const team = e.team || 0;
      // The shooter's line gets it too (only the team's when there's no shooter of that team to credit).
      const by = e.shooter && e.shooter.team === team ? e.shooter : { team };
      state.score[team] += e.points;
      countStat(state, by, 'pts', e.points);
      countStat(state, by, e.ft ? 'ftm' : 'fgm');
      if (e.dunk) countStat(state, by, 'dnk');
      if (e.points === 3) countStat(state, by, 'tpm');
      const { hype } = CROWD;
      const cheer = e.dunk ? (e.rare ? hype.rareDunk : hype.dunk) : e.ft ? hype.freeThrow : e.points === 3 ? hype.three : hype.score;
      cheerCrowd(cheer, e.shooter, { sign: !e.ft, rare: e.rare });
      addPopup(state, `+${e.points}`, evenTeams ? playColor(state, team) : team === 0 ? COLORS.okay : COLORS.hint, e.hoop.x, e.hoop.y, HOOP.rimZ + 16);
      if (!e.dunk) Sfx.play(e.swish ? 'swish' : 'net', { x: e.hoop.x });
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
      Sfx.play('airball', { x: e.x });
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
  const { ball } = state;
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
  // Each person's markers (in 2 Player, in their own color): dash cooldown, the arrow over their player, who a pass
  // would go to (following the direction held, like the pass itself), their shot meter and the rim-hang prompt.
  const duo = state.mode === 'duo';
  state.humans.forEach((h, i) => {
    const u = h.player;
    const color = duo ? DUO.markers[i] : COLORS.okay;
    drawDashCooldown(ctx, u);
    if (state.players.length > 1) drawUserMarker(ctx, u, color);
    if (u.hasBall && !u.shot && state.players.length > 1) {
      const target = Play.passTarget(state, u, Input.pad(h.pad).move());
      if (target) drawPassTarget(ctx, target);
    }
    if (u.meter) drawShotMeter(ctx, u.meter, u);
    if (u.shot && u.shot.dunk && u.shot.hang === Infinity && u.shot.released) {
      drawHangPrompt(ctx, u, state.time, Input.keyLabel('action', h.pad));
    }
  });
  drawPopups(ctx, state);
  // The demo behind the main menu: just the clock (and halftime), dimmed.
  const demo = state.mode === 'demo';
  if (!demo) drawHud(ctx, state);
  if (state.clock) {
    drawClock(ctx, state);
    if (state.clock.banner) drawBanner(ctx, state.clock.banner);
    if (state.clock.over && !demo) drawGameOver(ctx, state);
  }
  if (state.draft) drawDraft(ctx, state);
  if (state.fade) {
    ctx.fillStyle = `rgba(0, 0, 0, ${fadeAlpha()})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }
  if (demo) {
    ctx.fillStyle = `rgba(26, 28, 44, ${TITLE.dim})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  } else if (Menu.isOpen()) {
    drawPauseDim(ctx);
  } else if (!document.hasFocus()) {
    drawFocusOverlay(ctx, state.time);
  }
}

// Fixed-timestep loop: physics always ticks at 60Hz, rendering interpolates between ticks.
// While paused (the menu is open, or the game lost focus and shows "click to play") the simulation stops advancing;
// the demo behind the main menu always plays.
let last = performance.now();
let acc = 0;
function frame(now) {
  const elapsed = Math.min((now - last) / 1000, 0.25);
  last = now;
  Net.tick(elapsed);
  // An online guest doesn't run the game: it draws the host's latest snapshot (see Net).
  if (Net.isGuest()) {
    Net.applyLatest();
    render(1);
    requestAnimationFrame(frame);
    return;
  }
  if (state.mode === 'demo' || Net.online() || (!Menu.isOpen() && document.hasFocus())) {
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

// Back to the main menu (on one of its views, see Title.show), with the demo playing behind it.
function toTitle(view = 'home') {
  newGame('demo');
  Title.show(view);
}

// A mode picked on the main menu: its game starts, with the keyboard on the game.
function startMode(mode) {
  newGame(mode);
  canvas.focus();
}

// Online: the host pressed Start in the lobby, so a 2 Player game starts here (player 2 plays from the other
// browser). The host plays on the solo keys and keeps running the game even without focus, so the guest isn't left
// frozen.
Net.startMatch = () => {
  Title.hide();
  startMode('duo');
};
// The guest left mid-match: back to the Online screen, where the lobby is open for someone else.
Net.endMatch = () => toTitle('online');

// The pause menu's Testing tab (?dev=1): jump a game to the moment worth checking. can(name) says whether a tool
// applies right now; the clock ones need a game in progress (Quick game, career, 2 Player), not the demo.
const testing = {
  can(tool) {
    const c = state.clock;
    const playing = !!c && !c.over && state.mode !== 'demo';
    const u = state.user;
    switch (tool) {
      case 'tokens': return true;
      case 'shotClock': return playing && state.rules.shotClock;
      case 'ballToMe': return !!u && state.mode !== 'demo' && state.mode !== 'world' && !(c && c.over) && !u.shot;
      case 'freeThrow': return playing && !!state.ref && !!u && !u.shot;
      default: return playing; // endGame, endPeriod, tenSeconds, homePoints, awayPoints
    }
  },
  endGame: () => Clock.finish(state),
  endPeriod: () => Clock.endPeriodNow(state),
  tenSeconds() {
    state.clock.t = Math.min(state.clock.t, 10);
  },
  shotClock() {
    state.clock.shot = Math.min(state.clock.shot, 3);
  },
  homePoints: () => testPoints(0),
  awayPoints: () => testPoints(1),
  // The user's player gets the ball where they stand (out of any free throw or dead ball), with a fresh shot clock.
  ballToMe() {
    const u = state.user;
    state.freeThrow = null;
    if (state.ref) state.ref.hasBall = false;
    Play.give(state, u);
    if (state.clock) Clock.resetShot(state, u.team);
  },
  // The user's player is fouled: everyone lines up for their free throw.
  freeThrow() {
    const u = state.user;
    if (state.ball.holder) state.ball.holder.hasBall = false;
    startFreeThrow(u);
  },
  tokens() {
    Career.get().tokens += 100;
    Career.save();
  },
};

// Three points for `team` out of nowhere (the team's line only: no player made them).
function testPoints(team) {
  state.score[team] += 3;
  state.stats[team].pts += 3;
}

newGame(state.mode);
Menu.init({
  look: state.look,
  setLook(look) {
    state.look = look;
    setTeamLooks(state.roster, look, state.team);
  },
  team: state.team,
  // Free upgrades re-roll the opponents to match (career levels are only bought between games).
  upgradesChanged: () => {
    if (state.mode !== 'career') rollAIUpgrades(state.roster, state.team);
  },
  ui: state.ui,
  mode: () => state.mode,
  over: () => !!(state.clock && state.clock.over),
  inTitle: () => state.mode === 'demo',
  restart: () => startMode(state.mode),
  // Leaving a career game before the final buzzer forfeits it (Career.forfeit: a loss, no tokens).
  toTitle: () => {
    if (state.mode === 'career' && !state.clock.over) Career.forfeit();
    if (Net.role()) Net.leave();
    toTitle();
  },
  // Opened from the main menu (Customize, Settings): closing it goes back there.
  closed: () => {
    if (state.mode === 'demo') Title.show();
  },
  testing,
});
Title.init({
  rules: state.rules,
  start: startMode,
  // Career: the picked challenge (0..2) starts the next game.
  startCareer(choice) {
    Career.begin(choice, state.rules);
    startMode('career');
  },
  openTab: Menu.openTab,
});
// (The page may not have the keyboard yet, e.g. in an iframe, so nothing takes focus until it's clicked.)
Title.show('home', { focus: false });
fitCanvas();
requestAnimationFrame(frame);
