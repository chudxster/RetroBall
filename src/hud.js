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
  ctx.fillStyle = COLORS.good;
  ctx.fillRect(x, top + METER_H - hiPx, METER_W, hiPx - loPx);
  ctx.fillStyle = mix(COLORS.good, COLORS.line, 0.4);
  ctx.fillRect(x, top + METER_H - hiPx, 2, hiPx - loPx);
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
