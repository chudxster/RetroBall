const POPUP_LIFE = 1.1;
const METER_H = 48;
const METER_W = 8;
const TEXT_SCALE = 2; // the 3x5 font is drawn with 2px pixels at 640x360

function drawHud(ctx, game) {
  const free = game.mode === 'free';
  // The stats box in the top left can be turned off in the pause menu's UI tab.
  if (game.ui.stats) {
    const s = game.stats[0];
    const score = free ? `PTS ${s.pts}` : `HOME ${game.score[0]}  AWAY ${game.score[1]}`;
    const ft = !free && game.rules.freeThrows ? `  FT ${s.ftm}/${s.fta}` : '';
    const line = `${score}  FG ${s.fgm}/${s.fga}  3PT ${s.tpm}/${s.tpa}${ft}`;
    ctx.fillStyle = COLORS.outline;
    ctx.fillRect(4, 4, textWidth(line, TEXT_SCALE) + 12, 18);
    drawText(ctx, line, 10, 8, COLORS.line, { scale: TEXT_SCALE });
  }

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, VIEW_H - 18, VIEW_W, 18);
  const k = Input.keyLabel;
  const hint = free
    ? `${Input.moveLabel()} MOVE  2X TAP DASH  HOLD ${k('shoot')} SHOOT  ${k('action')} DUNK  ${k('pass')} GET BALL`
    : `${Input.moveLabel()} MOVE  2X TAP DASH  ${k('shoot')} SHOOT/BLOCK  ${k('action')} DUNK/STEAL  ${k('pass')} PASS/SWITCH`;
  drawText(ctx, hint, VIEW_W / 2, VIEW_H - 14, COLORS.hint, { align: 'center', scale: TEXT_SCALE });
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

// Big centered text on a dark band ("HALFTIME", "OVERTIME").
function drawBanner(ctx, text) {
  const y = VIEW_H / 2 - 24;
  ctx.fillStyle = 'rgba(26, 28, 44, 0.8)';
  ctx.fillRect(0, y, VIEW_W, 48);
  drawText(ctx, text, VIEW_W / 2, y + 14, COLORS.okay, { align: 'center', scale: TEXT_SCALE * 2, shadow: COLORS.outline });
}

// After the final buzzer: the result, the final score and both teams' stat lines, then how to play again.
function drawGameOver(ctx, game) {
  const [home, away] = game.score;
  const won = home > away;
  const ot = game.clock.period > 2 ? ` / ${Clock.periodLabel(game.clock.period)}` : '';
  ctx.fillStyle = 'rgba(26, 28, 44, 0.85)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const mid = VIEW_W / 2;
  drawText(ctx, won ? 'YOU WIN!' : 'YOU LOSE', mid, 40, won ? COLORS.good : COLORS.bad, { align: 'center', scale: TEXT_SCALE * 3, shadow: COLORS.outline });
  drawText(ctx, `FINAL${ot}`, mid, 82, COLORS.hint, { align: 'center', scale: TEXT_SCALE });
  drawText(ctx, `HOME ${home} - ${away} AWAY`, mid, 100, COLORS.line, { align: 'center', scale: TEXT_SCALE * 2 });

  // Stat table: label, home, away.
  const rows = [
    ['FG', (s) => `${s.fgm}/${s.fga}`],
    ['3PT', (s) => `${s.tpm}/${s.tpa}`],
    ['FT', (s) => `${s.ftm}/${s.fta}`],
    ['STL', (s) => String(s.stl)],
    ['BLK', (s) => String(s.blk)],
  ];
  const top = 136;
  drawText(ctx, 'HOME', mid - 10, top, COLORS.hint, { align: 'center', scale: TEXT_SCALE });
  drawText(ctx, 'AWAY', mid + 90, top, COLORS.hint, { align: 'center', scale: TEXT_SCALE });
  rows.forEach(([label, value], i) => {
    const y = top + 20 + i * 18;
    drawText(ctx, label, mid - 110, y, COLORS.hint, { align: 'center', scale: TEXT_SCALE });
    drawText(ctx, value(game.stats[0]), mid - 10, y, COLORS.line, { align: 'center', scale: TEXT_SCALE });
    drawText(ctx, value(game.stats[1]), mid + 90, y, COLORS.line, { align: 'center', scale: TEXT_SCALE });
  });
  if (game.clock.overT > 1 && Math.floor(game.time * 2) % 2 === 0) {
    drawText(ctx, `PRESS ${Input.keyLabel('shoot')} TO PLAY AGAIN`, mid, VIEW_H - 46, COLORS.okay, { align: 'center', scale: TEXT_SCALE });
  }
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
  ctx.fillStyle = mix(COLORS.good, COLORS.line, 0.5);
  ctx.fillRect(x - 1, y - 2, 2, 1);
}

// A small arrow over the head of the player the user is controlling.
function drawUserMarker(ctx, p) {
  const x = p.sx;
  const y = p.by - Math.round(92 * p.scale);
  ctx.fillStyle = COLORS.outline;
  ctx.fillRect(x - 5, y - 1, 11, 2);
  ctx.fillRect(x - 4, y + 1, 9, 2);
  ctx.fillRect(x - 3, y + 3, 7, 2);
  ctx.fillRect(x - 1, y + 5, 3, 2);
  ctx.fillStyle = COLORS.okay;
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
    ctx.fillStyle = mix(COLORS.good, COLORS.line, 0.4);
    ctx.fillRect(x, top + METER_H - hiPx, 2, hiPx - loPx);
  }
  // Release marker: where the fill stopped.
  if (meter.result) {
    ctx.fillStyle = meter.result.color;
    ctx.fillRect(x - 4, top + METER_H - fillPx - 1, METER_W + 8, 2);
  }
}

// Blinking reminder above a player hanging on the rim.
function drawHangPrompt(ctx, player, time) {
  if (Math.floor(time * 3) % 2) return;
  const y = player.by - Math.round(96 * player.scale);
  drawText(ctx, `${Input.keyLabel('action')} TO LET GO`, player.sx, y, COLORS.okay, { align: 'center', shadow: COLORS.outline, scale: TEXT_SCALE });
}

// Floating text anchored to a spot in the world, rising and blinking out.
function addPopup(game, text, color, x, y, z, life = POPUP_LIFE) {
  game.popups.push({ text, color, x, y, z, t: 0, life });
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
