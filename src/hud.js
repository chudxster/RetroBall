const POPUP_LIFE = 1.1;
const POPUP_NEAR = 30;   // popups closer than this (world units, across and in depth) count as the same spot
const POPUP_LINE = 10;   // how far apart (in height) they have to be not to overlap
const POPUP_MERGE = 0.3; // the same text again this soon just restarts the first one
const GOAL_RISE_TIME = 1.4; // seconds a met career challenge takes to float away
const METER_H = 48;
const METER_W = 8;
const TEXT_SCALE = 2; // the 3x5 font is drawn with 2px pixels at 640x360
const PASS_DOT_SHINE = mix(COLORS.good, COLORS.line, 0.5);
const METER_GREEN_SHINE = mix(COLORS.good, COLORS.line, 0.4);

function drawHud(ctx, game) {
  const free = !isFullGame(game);
  // A career game's challenge and how it stands, green once it's met. Met for good mid-game (game.goalMet), it
  // flashes and floats up out of the way (drawn first, so it slides behind the stats box).
  const rise = game.goalMet ? game.goalMet.t / GOAL_RISE_TIME : 0;
  if (game.challenge && !(game.clock && game.clock.over) && rise < 1) {
    const ch = game.challenge;
    const now = Career.challengeState(ch, game);
    const tier = CAREER.tiers[ch.tier];
    const head = game.mode === 'daily' ? 'DAILY GOAL' : `${tier.name} X${tier.mult}`;
    const line = rise ? `${head}  ${Career.challengeText(ch)}  DONE!` : `${head}  ${Career.challengeText(ch)}  ${now.text}`;
    const flash = rise && Math.floor(rise * 12) % 2 ? COLORS.line : COLORS.good;
    ctx.save();
    ctx.globalAlpha = 1 - Math.max(0, rise - 0.5) * 2; // fades out over the second half
    drawInfoBox(ctx, line, (game.ui.stats ? 26 : 4) - Math.round(rise * rise * 40), now.done ? flash : COLORS.okay);
    ctx.restore();
  }
  if (game.drill) drawDrill(ctx, game.drill);
  // The stats box in the top left can be turned off in the pause menu's UI tab.
  else if (game.ui.stats) {
    const s = game.stats[0];
    const [home, away] = game.abbrs;
    const score = free ? `PTS ${s.pts}` : `${home} ${game.score[0]}  ${away} ${game.score[1]}`;
    const ft = !free && game.rules.freeThrows ? `  FT ${s.ftm}/${s.fta}` : '';
    drawInfoBox(ctx, `${score}  FG ${s.fgm}/${s.fga}  3PT ${s.tpm}/${s.tpa}${ft}`);
  }

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, VIEW_H - 18, VIEW_W, 18);
  // 2 Player: each player's keys on their half of the line, in their color.
  if (game.mode === 'duo') {
    ['p1', 'p2'].forEach((set, i) => {
      const k = (name) => Input.keyLabel(name, set);
      const text = `P${i + 1} ${Input.moveLabel(set)} ${k('shoot')}=SHOOT ${k('action')}=DUNK ${k('pass')}=PASS`;
      drawText(ctx, text, VIEW_W * (i ? 0.75 : 0.25), VIEW_H - 14, DUO.markers[i], { align: 'center', scale: TEXT_SCALE });
    });
    return;
  }
  const k = Input.keyLabel;
  const hint = game.drill
    ? `HOLD ${k('shoot')} TO SHOOT  -  MAKE IT TO MOVE ON`
    : free
    ? `${Input.moveLabel()} MOVE  2X TAP DASH  HOLD ${k('shoot')} SHOOT  ${k('action')} DUNK  ${k('pass')} GET BALL`
    : `${Input.moveLabel()} MOVE  2X TAP DASH  ${k('shoot')} SHOOT/BLOCK  ${k('action')} DUNK/STEAL  ${k('pass')} PASS/SWITCH`;
  drawText(ctx, hint, VIEW_W / 2, VIEW_H - 14, COLORS.hint, { align: 'center', scale: TEXT_SCALE });
}

// One line of text on a dark box at the left edge, `y` down (the stats, the drill's progress, a challenge).
function drawInfoBox(ctx, line, y = 4, color = COLORS.line) {
  ctx.fillStyle = COLORS.outline;
  ctx.fillRect(4, y, textWidth(line, TEXT_SCALE) + 12, 18);
  drawText(ctx, line, 10, y + 4, color, { scale: TEXT_SCALE });
}

// Game clock (period and time left) and shot clock, top right beside the pause button (3v3). The game clock turns
// yellow in the last 10 seconds, the shot clock red in its last GAME.shotWarn.
function drawClock(ctx, game) {
  const c = game.clock;
  const main = `${Clock.periodLabel(c.period)} ${Clock.format(c.t)}`;
  const shot = game.rules.shotClock ? String(Math.max(0, Math.ceil(c.shot))) : '';
  const wMain = textWidth(main, TEXT_SCALE) + 12;
  const wShot = shot ? textWidth('00', TEXT_SCALE) + 12 : 0;
  let x = VIEW_W - 34 - wMain - (shot ? wShot + 4 : 0);
  ctx.fillStyle = COLORS.outline;
  ctx.fillRect(x, 4, wMain, 18);
  drawText(ctx, main, x + 6, 8, c.t < 10 ? COLORS.okay : COLORS.line, { scale: TEXT_SCALE });
  if (!shot) return;
  x += wMain + 4;
  ctx.fillStyle = COLORS.outline;
  ctx.fillRect(x, 4, wShot, 18);
  drawText(ctx, shot, x + wShot / 2, 8, c.shot <= GAME.shotWarn ? COLORS.bad : COLORS.okay, { align: 'center', scale: TEXT_SCALE });
}

// Around the World: spot count, time and best time top left; when it's done, the time (and whether it's a record)
// in a banner with how to go again.
function drawDrill(ctx, d) {
  const best = d.best === null ? '--' : Practice.format(d.best);
  drawInfoBox(ctx, `AROUND THE WORLD  ${Math.min(d.i + 1, Practice.spots)}/${Practice.spots}  ${Practice.format(d.t)}  BEST ${best}`);
  if (!d.done) return;
  drawBanner(ctx, `DONE ${Practice.format(d.t)}`);
  const y = VIEW_H / 2 + 34;
  if (d.record) drawText(ctx, 'NEW RECORD!', VIEW_W / 2, y, COLORS.good, { align: 'center', scale: TEXT_SCALE, shadow: COLORS.outline });
  drawText(ctx, `PRESS ${Input.keyLabel('shoot')} TO GO AGAIN`, VIEW_W / 2, y + 16, COLORS.okay, { align: 'center', scale: TEXT_SCALE, shadow: COLORS.outline });
}

// Big centered text on a dark band ("HALFTIME", "OVERTIME").
function drawBanner(ctx, text) {
  const y = VIEW_H / 2 - 24;
  ctx.fillStyle = 'rgba(26, 28, 44, 0.8)';
  ctx.fillRect(0, y, VIEW_W, 48);
  drawText(ctx, text, VIEW_W / 2, y + 14, COLORS.okay, { align: 'center', scale: TEXT_SCALE * 2, shadow: COLORS.outline });
}

// A new trophy (see Trophies): a strip under the top HUD in the metal's color, sliding in and blinking out.
function drawTrophyToast(ctx, toast) {
  const slide = Math.min(toast.t / 0.2, 1);
  if (toast.t > TROPHY_TOAST_TIME - 0.6 && Math.floor(toast.t * 10) % 2) return;
  const w = textWidth(toast.text, TEXT_SCALE) + 24;
  const x = Math.round(VIEW_W / 2 - w / 2);
  const y = Math.round(22 + (slide - 1) * 20);
  ctx.fillStyle = COLORS.outline;
  ctx.fillRect(x, y, w, 20);
  ctx.fillStyle = toast.color;
  ctx.fillRect(x, y, w, 2);
  ctx.fillRect(x, y + 18, w, 2);
  drawText(ctx, toast.text, VIEW_W / 2, y + 5, toast.color, { align: 'center', scale: TEXT_SCALE });
}

// After the final buzzer: the result, the final score and both teams' stat lines, then how to play again.
function drawGameOver(ctx, game) {
  const [home, away] = game.score;
  const won = home > away;
  const ot = game.clock.period > 2 ? ` / ${Clock.periodLabel(game.clock.period)}` : '';
  ctx.fillStyle = 'rgba(26, 28, 44, 0.85)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const mid = VIEW_W / 2;
  const versus = game.mode === 'duo' && Duo.versus();
  // (A tie only happens when the Testing tab ends a game early.)
  const tied = home === away;
  const title = tied ? 'TIE GAME' : versus ? `P${won ? 1 : 2} WINS!` : won ? 'YOU WIN!' : 'YOU LOSE';
  const titleColor = tied ? COLORS.line : versus ? DUO.markers[won ? 0 : 1] : won ? COLORS.good : COLORS.bad;
  drawText(ctx, title, mid, 40, titleColor, { align: 'center', scale: TEXT_SCALE * 3, shadow: COLORS.outline });
  drawText(ctx, `FINAL${ot}`, mid, 82, COLORS.hint, { align: 'center', scale: TEXT_SCALE });
  const [homeName, awayName] = game.abbrs;
  drawText(ctx, `${homeName} ${home} - ${away} ${awayName}`, mid, 100, COLORS.line, { align: 'center', scale: TEXT_SCALE * 2 });

  drawBoxScore(ctx, game, 128);
  const r = game.careerResult;
  if (r) drawCareerResult(ctx, r, mid, 254);
  if (game.dailyResult) drawDailyResult(ctx, game.dailyResult, mid, 254);
  if (game.clock.overT <= 1) return;
  if (Math.floor(game.time * 2) % 2 === 0) {
    const next = r ? 'FOR THE NEXT GAME' : 'TO PLAY AGAIN';
    const prompt = game.mode === 'duo'
      ? `${Input.keyLabel('shoot', 'p1')}: RUN IT BACK (SAME UPGRADES)   ${Input.keyLabel('shoot', 'p2')}: NEW DRAFT`
      : `PRESS ${Input.keyLabel('shoot')} ${next}`;
    drawText(ctx, prompt, mid, VIEW_H - 50, COLORS.okay, { align: 'center', scale: TEXT_SCALE });
  }
  // The way out (the pause menu's Main menu button), steady under the blinking prompt.
  drawText(ctx, 'ESC: MENU', mid, VIEW_H - 34, COLORS.hint, { align: 'center', scale: TEXT_SCALE });
}

// The final screen's box score: a column per stat, and for each team its totals (in its name) over a line per
// player on the court. Home players go by their names, away players by their numbers.
const BOX_COLUMNS = [
  ['PTS', (s) => String(s.pts)],
  ['FG', (s) => `${s.fgm}/${s.fga}`],
  ['3PT', (s) => `${s.tpm}/${s.tpa}`],
  ['FT', (s) => `${s.ftm}/${s.fta}`],
  ['STL', (s) => String(s.stl)],
  ['BLK', (s) => String(s.blk)],
  ['DNK', (s) => String(s.dnk)],
];
const BOX_NAME_X = 96;   // names start here...
const BOX_FIRST_X = 236; // ...and the stat columns are centered from here,
const BOX_STEP = 50;     // this far apart
const BOX_ROW = 12;

function boxName(game, p) {
  if (p.team !== 0) return `NO.${p.look.number}`;
  const team = game.mode === 'career' ? Career.team() : game.team;
  return team[p.role].name;
}

function drawBoxScore(ctx, game, top) {
  const text = (s, x, y, color, align = 'center') => drawText(ctx, s, x, y, color, { align, scale: TEXT_SCALE });
  const row = (label, stats, y, labelColor, color) => {
    text(label, BOX_NAME_X, y, labelColor, 'left');
    BOX_COLUMNS.forEach(([, value], i) => text(value(stats), BOX_FIRST_X + i * BOX_STEP, y, color));
  };
  BOX_COLUMNS.forEach(([head], i) => text(head, BOX_FIRST_X + i * BOX_STEP, top, COLORS.hint));
  let y = top + BOX_ROW + 2;
  for (const team of [0, 1]) {
    row(game.abbrs[team], game.stats[team], y, COLORS.okay, COLORS.line);
    y += BOX_ROW;
    const players = game.players.filter((p) => p.team === team).sort((a, b) => a.role - b.role);
    for (const p of players) {
      row(boxName(game, p), p.stats, y, COLORS.hint, COLORS.hint);
      y += BOX_ROW;
    }
    y += 4;
  }
}

// 2 Player upgrade draft: each player's half of the screen, with their points left, the five stats as pips (a
// cursor on the picked one) and whether they're ready.
function drawDraft(ctx, game) {
  const d = game.draft;
  ctx.fillStyle = 'rgba(26, 28, 44, 0.9)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const title = d.phase === 'pre' ? `PRE-GAME UPGRADES: ${d.points} POINTS EACH` : `HALFTIME: +${d.points} POINTS EACH`;
  drawText(ctx, title, VIEW_W / 2, 26, COLORS.okay, { align: 'center', scale: TEXT_SCALE, shadow: COLORS.outline });
  const coop = !Duo.versus();
  const levels = Duo.levels();
  d.sides.forEach((s, i) => {
    const set = i ? 'p2' : 'p1';
    const color = DUO.markers[i];
    const x0 = i ? VIEW_W / 2 + 16 : 16;
    const k = (name) => Input.keyLabel(name, set);
    drawText(ctx, `PLAYER ${i + 1}${coop ? '' : i ? ' (AWAY)' : ' (HOME)'}`, x0, 56, color, { scale: TEXT_SCALE });
    drawText(ctx, `POINTS LEFT ${s.left}`, x0, 76, s.left ? COLORS.line : COLORS.hint, { scale: TEXT_SCALE });
    UPGRADE_KEYS.forEach((key, row) => {
      const y = 104 + row * 26;
      const on = row === s.cursor && !s.ready;
      if (on) {
        ctx.fillStyle = COLORS.wall;
        ctx.fillRect(x0 - 6, y - 5, VIEW_W / 2 - 20, 20);
      }
      drawText(ctx, key, x0, y, on ? color : COLORS.hint, { scale: TEXT_SCALE });
      for (let n = 0; n < UPGRADES.max; n++) {
        const px = x0 + 110 + n * 14;
        ctx.fillStyle = COLORS.outline;
        ctx.fillRect(px - 1, y - 1, 12, 12);
        ctx.fillStyle = n < levels[i][key] ? (n >= levels[i][key] - s.bought[key] ? color : COLORS.good) : COLORS.meterBg;
        ctx.fillRect(px, y, 10, 10);
      }
    });
    const help = `${k('up')}/${k('down')} PICK  ${k('right')} ADD  ${k('left')} TAKE BACK`;
    drawText(ctx, help, x0, 246, COLORS.hint, { scale: TEXT_SCALE });
    const ready = s.ready ? 'READY!' : `PRESS ${k('shoot')} WHEN READY`;
    drawText(ctx, ready, x0, 270, s.ready ? COLORS.good : color, { scale: TEXT_SCALE, shadow: COLORS.outline });
  });
  const who = coop ? 'EACH UPGRADES THEIR OWN PLAYER' : 'UPGRADES GO TO YOUR WHOLE TEAM';
  drawText(ctx, who, VIEW_W / 2, 300, COLORS.hint, { align: 'center', scale: TEXT_SCALE });
}

// The daily game's result: the goal (made or missed), then the streak (or that a replay doesn't change today's).
function drawDailyResult(ctx, r, mid, y) {
  drawText(ctx, `DAILY GOAL: ${r.goal} - ${r.done ? 'DONE!' : 'MISSED'}`, mid, y, r.done ? COLORS.good : COLORS.bad, { align: 'center', scale: TEXT_SCALE });
  const line = r.first ? `STREAK ${r.streak} DAY${r.streak === 1 ? '' : 'S'}   BEST ${r.best}` : 'REPLAY: YOUR FIRST GAME TODAY IS THE ONE THAT COUNTS';
  drawText(ctx, line, mid, y + 18, COLORS.okay, { align: 'center', scale: TEXT_SCALE, shadow: COLORS.outline });
}

// A career game's payout: the challenge (made or missed), then points x the result's and the challenge's multipliers.
function drawCareerResult(ctx, r, mid, y) {
  if (r.challenge) {
    const tier = CAREER.tiers[r.tier];
    const text = `${tier.name} X${tier.mult}: ${r.challenge} - ${r.done ? 'DONE!' : 'MISSED'}`;
    drawText(ctx, text, mid, y, r.done ? COLORS.good : COLORS.bad, { align: 'center', scale: TEXT_SCALE });
  }
  const parts = [`${r.points} PTS`, `X${r.resultMult} ${r.won ? 'WIN' : 'LOSS'}`];
  if (r.done) parts.push(`X${r.challengeMult}`);
  drawText(ctx, `${parts.join(' ')} = +${r.tokens} TOKENS`, mid, y + 18, COLORS.okay, { align: 'center', scale: TEXT_SCALE, shadow: COLORS.outline });
}

// Speed lines trailing a dashing player: horizontal streaks behind a sideways dash, vertical ones above or below
// an up/down dash.
function drawDashLines(ctx, p) {
  const k = p.scale;
  ctx.fillStyle = COLORS.line;
  if (p.dashDir.x) {
    const back = -Math.sign(p.dashDir.x);
    for (const [dy, len] of [[-58, 10], [-44, 16], [-30, 12], [-16, 8]]) {
      const x0 = p.sx + back * Math.round(14 * k);
      const w = Math.round(len * k);
      ctx.fillRect(back > 0 ? x0 : x0 - w, p.by + Math.round(dy * k), w, 1);
    }
  } else {
    // Dashing toward the camera the streaks trail above the head; away from it, below the feet.
    const up = p.dashDir.y > 0;
    for (const [dx, len] of [[-9, 8], [-3, 12], [3, 12], [9, 8]]) {
      const h = Math.round(len * k);
      const y = up ? p.by - Math.round(76 * k) - h : p.by + Math.round(2 * k);
      ctx.fillRect(p.sx + Math.round(dx * k), y, 1, h);
    }
  }
}

// Dash cooldown under the user's player: a small bar that fills back up, gone once the dash is ready.
function drawDashCooldown(ctx, p) {
  if (p.dashCD <= 0) return;
  const w = 20;
  const x = p.sx - w / 2;
  const y = p.sy + 4;
  ctx.fillStyle = COLORS.outline;
  ctx.fillRect(x - 1, y - 1, w + 2, 4);
  ctx.fillStyle = COLORS.meterBg;
  ctx.fillRect(x, y, w, 2);
  ctx.fillStyle = COLORS.hint;
  ctx.fillRect(x, y, Math.round(w * (1 - p.dashCD / DASH.cooldown)), 2);
}

// Three little stars circling over the head of a player who just had the ball stolen.
function drawDazed(ctx, p, time) {
  const cx = p.sx;
  const cy = p.by - Math.round(80 * p.scale);
  for (let i = 0; i < 3; i++) {
    const a = time * 8 + (i * 2 * Math.PI) / 3;
    const x = Math.round(cx + Math.cos(a) * 9);
    const y = Math.round(cy + Math.sin(a) * 3);
    ctx.fillStyle = COLORS.outline;
    ctx.fillRect(x - 2, y - 1, 5, 3);
    ctx.fillRect(x - 1, y - 2, 3, 5);
    ctx.fillStyle = COLORS.okay;
    ctx.fillRect(x - 1, y, 3, 1);
    ctx.fillRect(x, y - 1, 1, 3);
  }
}

// A green dot over the teammate a pass would go to right now.
function drawPassTarget(ctx, p) {
  const x = p.sx;
  const y = p.by - Math.round(90 * p.scale);
  ctx.fillStyle = COLORS.outline;
  ctx.fillRect(x - 2, y - 4, 5, 9);
  ctx.fillRect(x - 4, y - 2, 9, 5);
  ctx.fillRect(x - 3, y - 3, 7, 7);
  ctx.fillStyle = COLORS.good;
  ctx.fillRect(x - 1, y - 3, 3, 7);
  ctx.fillRect(x - 3, y - 1, 7, 3);
  ctx.fillRect(x - 2, y - 2, 5, 5);
  ctx.fillStyle = PASS_DOT_SHINE;
  ctx.fillRect(x - 1, y - 2, 2, 1);
}

// A small arrow over the head of the player the user is controlling.
function drawUserMarker(ctx, p, color = COLORS.okay) {
  const x = p.sx;
  const y = p.by - Math.round(92 * p.scale);
  ctx.fillStyle = COLORS.outline;
  ctx.fillRect(x - 5, y - 1, 11, 2);
  ctx.fillRect(x - 4, y + 1, 9, 2);
  ctx.fillRect(x - 3, y + 3, 7, 2);
  ctx.fillRect(x - 1, y + 5, 3, 2);
  ctx.fillStyle = color;
  ctx.fillRect(x - 4, y, 9, 1);
  ctx.fillRect(x - 3, y + 1, 7, 2);
  ctx.fillRect(x - 2, y + 3, 5, 2);
  ctx.fillRect(x, y + 5, 1, 1);
}

// 2K-style vertical meter beside the shooter: fills while Space is held, green band is the make window.
function drawShotMeter(ctx, meter, player) {
  const k = player.scale;
  const x = player.sx + (player.facing > 0 ? -Math.round(28 * k) : Math.round(20 * k));
  const top = player.by - Math.round(76 * k);
  const fillPx = Math.round(meter.fill * METER_H);
  const loPx = Math.round(meter.lo * METER_H);
  const hiPx = Math.max(loPx + 1, Math.round(meter.hi * METER_H));

  // Once released, the frame flashes the result color.
  const flash = meter.result && Math.floor(meter.hideIn * 10) % 2 === 0;
  ctx.fillStyle = flash ? meter.result.color : COLORS.outline;
  ctx.fillRect(x - 2, top - 2, METER_W + 4, METER_H + 4);
  ctx.fillStyle = COLORS.meterBg;
  ctx.fillRect(x, top, METER_W, METER_H);
  ctx.fillStyle = COLORS.meterFill;
  ctx.fillRect(x, top + METER_H - fillPx, METER_W, fillPx);
  // The green band, unless this deep shot hides it.
  if (!meter.hidden) {
    ctx.fillStyle = COLORS.good;
    ctx.fillRect(x, top + METER_H - hiPx, METER_W, hiPx - loPx);
    ctx.fillStyle = METER_GREEN_SHINE;
    ctx.fillRect(x, top + METER_H - hiPx, 2, hiPx - loPx);
  }
  // Release marker: where the fill stopped.
  if (meter.result) {
    ctx.fillStyle = meter.result.color;
    ctx.fillRect(x - 4, top + METER_H - fillPx - 1, METER_W + 8, 2);
  }
}

// Blinking reminder above a player hanging on the rim.
function drawHangPrompt(ctx, player, time, key = Input.keyLabel('action')) {
  if (Math.floor(time * 3) % 2) return;
  const y = player.by - Math.round(96 * player.scale);
  drawText(ctx, `${key} TO LET GO`, player.sx, y, COLORS.okay, { align: 'center', shadow: COLORS.outline, scale: TEXT_SCALE });
}

// Floating text anchored to a spot in the world, rising and blinking out. The same text at the same spot just
// restarts; a popup that would land on another one nearby goes up a line instead.
function addPopup(game, text, color, x, y, z, life = POPUP_LIFE) {
  const near = game.popups.filter((p) => Math.abs(p.x - x) < POPUP_NEAR && Math.abs(p.y - y) < POPUP_NEAR);
  const same = near.find((p) => p.text === text && p.t < POPUP_MERGE);
  if (same) {
    same.t = 0;
    return;
  }
  while (near.some((p) => Math.abs(p.z - z) < POPUP_LINE)) z += POPUP_LINE;
  game.popups.push({ text, color, x, y, z, t: 0, life });
}

// A play's popup color as seen by the people playing: yellow when it went their side's way, red when it went
// against them. In 2 Player versus each side's plays are in that player's marker color. (In the demo, home's way.)
function playColor(game, team) {
  if (game.mode === 'duo' && Duo.versus()) return DUO.markers[team];
  const ours = game.humans.length ? game.humans.some((h) => h.team === team) : team === 0;
  return ours ? COLORS.okay : COLORS.bad;
}

function updatePopups(game, dt) {
  for (const p of game.popups) p.t += dt;
  game.popups = game.popups.filter((p) => p.t < p.life);
}

function drawPopups(ctx, game) {
  for (const p of game.popups) {
    if (p.t > p.life - POPUP_LIFE * 0.3 && Math.floor(p.t * 12) % 2) continue;
    const pos = project(p.x, p.y, p.z);
    const rise = Math.round(Math.min(p.t / 0.4, 1) * 16);
    drawText(ctx, p.text, Math.round(pos.x), Math.round(pos.y) - rise, p.color, {
      align: 'center',
      shadow: COLORS.outline,
      scale: TEXT_SCALE,
    });
  }
}

function drawPauseDim(ctx) {
  ctx.fillStyle = 'rgba(26, 28, 44, 0.5)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

// Shown when the page (or the iframe it's embedded in) doesn't have keyboard focus.
function drawFocusOverlay(ctx, time) {
  ctx.fillStyle = 'rgba(26, 28, 44, 0.6)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  if (Math.floor(time * 2) % 2 === 0) {
    drawText(ctx, 'CLICK TO PLAY', VIEW_W / 2, VIEW_H / 2 - 10, COLORS.line, {
      scale: TEXT_SCALE * 2,
      align: 'center',
      shadow: COLORS.outline,
    });
  }
}
