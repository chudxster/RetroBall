const POPUP_LIFE = 1.1;
const METER_H = 48;
const METER_W = 8;
const TEXT_SCALE = 2; // the 3x5 font is drawn with 2px pixels at 640x360

function drawHud(ctx, game) {
  const s = game.stats;
  const line = `PTS ${s.pts}  FG ${s.fgm}/${s.fga}  3PT ${s.tpm}/${s.tpa}`;
  ctx.fillStyle = COLORS.outline;
  ctx.fillRect(4, 4, textWidth(line, TEXT_SCALE) + 12, 18);
  drawText(ctx, line, 10, 8, COLORS.line, { scale: TEXT_SCALE });

  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, VIEW_H - 18, VIEW_W, 18);
  drawText(ctx, 'WASD MOVE  SHIFT SPRINT  HOLD SPACE SHOOT  F DUNK', VIEW_W / 2, VIEW_H - 14, COLORS.hint, { align: 'center', scale: TEXT_SCALE });
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
  drawText(ctx, 'F TO LET GO', player.sx, y, COLORS.okay, { align: 'center', shadow: COLORS.outline, scale: TEXT_SCALE });
}

// Floating text anchored to a spot in the world, rising and blinking out.
function addPopup(game, text, color, x, y, z) {
  game.popups.push({ text, color, x, y, z, t: 0 });
}

function updatePopups(game, dt) {
  for (const p of game.popups) p.t += dt;
  game.popups = game.popups.filter((p) => p.t < POPUP_LIFE);
}

function drawPopups(ctx, game) {
  for (const p of game.popups) {
    if (p.t > POPUP_LIFE * 0.7 && Math.floor(p.t * 12) % 2) continue;
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
