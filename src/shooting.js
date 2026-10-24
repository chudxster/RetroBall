// Hold shoot to rise into a jump shot while the meter fills; let go in the green zone to make it.
// The dunk key leaps to the rim instead, from farther out the faster you're driving at it.
const Shooting = (() => {
  let wasHeld = false;
  let wasDunkHeld = false;

  function update(dt, game, held, dunkHeld) {
    const p = game.player;
    const pressed = held && !wasHeld;
    const dunkPressed = dunkHeld && !wasDunkHeld;
    wasHeld = held;
    wasDunkHeld = dunkHeld;

    if (!p.shot) {
      if (dunkPressed && p.hasBall) tryDunk(game);
      else if (pressed && p.hasBall) start(game);
    } else if (p.shot.dunk) {
      updateDunk(dt, game, dunkPressed);
    } else {
      const shot = p.shot;
      shot.t += dt;
      p.z = SHOT.jumpHeight * Math.sin(Math.PI * Math.min(shot.t / shot.jumpTime, 1));
      if (!shot.released) {
        shot.fill = Math.min(shot.t / shot.meterTime, 1);
        game.meter.fill = shot.fill;
        if (!held || shot.fill >= 1) release(game);
      }
      if (shot.t >= shot.jumpTime) {
        p.z = 0;
        p.shot = null;
      }
    }

    const m = game.meter;
    if (m && m.result) {
      m.hideIn -= dt;
      if (m.hideIn <= 0) game.meter = null;
    }
  }

  function start(game) {
    const p = game.player;
    const hoop = nearestHoop(p.x);
    const dist = Math.hypot(hoop.x - p.x, hoop.y - p.y);
    if (Math.abs(hoop.x - p.x) > 1) p.facing = Math.sign(hoop.x - p.x);

    // Closer shots are quicker: the meter (and the jump with it) speeds up near the rim.
    const t = clamp((dist - SHOT.quickRange.near) / (SHOT.quickRange.far - SHOT.quickRange.near), 0, 1);
    const meterTime = lerp(SHOT.meterTimeClose, SHOT.meterTimeFar, t);

    // The green zone shrinks the farther out the shot is, and is much wider right at the rim.
    const { near, far } = SHOT.closeRangeGreen;
    const closeness = 1 - clamp((dist - near) / (far - near), 0, 1);
    const green = clamp(SHOT.greenMax - dist * SHOT.greenShrink, SHOT.greenMin, SHOT.greenMax) + SHOT.greenCloseBonus * closeness;
    // Keep a wide green fully on the meter (with a sliver of "late" above it).
    const center = Math.min(SHOT.greenCenter, 0.97 - green / 2);
    p.shot = { t: 0, fill: 0, released: false, hoop, meterTime, jumpTime: meterTime * SHOT.jumpPerMeter };
    game.meter = {
      fill: 0,
      lo: center - green / 2,
      hi: center + green / 2,
      result: null,
      hideIn: 0,
    };
  }

  // Release timing decides make or miss; the aim below then sends the ball where physics will play that out.
  function grade(fill, lo, hi) {
    if (fill >= lo && fill <= hi) return { label: 'PERFECT', color: COLORS.good, make: true };
    const early = fill < lo;
    const off = early ? lo - fill : fill - hi;
    if (off <= SHOT.goodMargin) {
      const label = early ? 'SLIGHTLY EARLY' : 'SLIGHTLY LATE';
      return { label, color: COLORS.okay, make: Math.random() < SHOT.slightMakeChance, early };
    }
    if (early && fill < SHOT.airballFill) return { label: 'WAY EARLY', color: COLORS.bad, make: false, early, airball: true };
    return { label: early ? 'EARLY' : 'LATE', color: COLORS.bad, make: false, early };
  }

  // Where the ball should come down, relative to the rim center: `long` along the shot line (+ = past center), `side` across it.
  // Offsets come from simulating thousands of shots: landing 0-2.5 long always drops, 5-7.5 short/long always rims out.
  function aim(result, dist) {
    if (result.make) return { long: rand(0, 2.5), side: rand(-0.5, 0.5) };
    if (result.airball) return { long: -rand(14, 22), side: rand(-2, 2) };
    const long = result.early ? -rand(5, 7) : rand(5.5, 7.5);
    // Up close the ball drops so steeply that front/back rim misses still fall in, so miss off the side instead.
    const side = dist < SHOT.closeRange ? (Math.random() < 0.5 ? -1 : 1) * rand(7, 9) : rand(-1.5, 1.5);
    return { long, side };
  }

  function release(game) {
    const { player: p, ball, meter } = game;
    const shot = p.shot;
    shot.released = true;

    const result = grade(shot.fill, meter.lo, meter.hi);
    meter.result = result;
    meter.hideIn = SHOT.meterLinger;

    // Aim along the line from the ball to the hoop, offset long/short and sideways by the result.
    const hoop = shot.hoop;
    const from = p.shootingBallPosition();
    const dx = hoop.x - from.x;
    const dy = hoop.y - from.y;
    const dist = Math.hypot(dx, dy);
    const ux = dist > 0.01 ? dx / dist : -hoop.dir;
    const uy = dist > 0.01 ? dy / dist : 0;
    const { long, side } = aim(result, dist);
    const target = {
      x: hoop.x + ux * long - uy * side,
      y: hoop.y + uy * long + ux * side,
      z: HOOP.rimZ - BALL.radius,
    };

    const points = isThreePoint(p.x, p.y, hoop) ? 3 : 2;
    ball.launch(from.x, from.y, from.z, target, SHOT.baseTime + dist / SHOT.flightSpeed, { hoop, points, dist });
    p.hasBall = false;

    game.stats.fga++;
    if (points === 3) game.stats.tpa++;
    addPopup(game, result.label, result.color, p.x, p.y, p.z + 48);
  }

  // Dunk range grows with speed toward the hoop: a standing dunk needs to be under the rim, a full sprint
  // can take off from much farther out. Must be on the court side of the hoop.
  function tryDunk(game) {
    const p = game.player;
    const hoop = nearestHoop(p.x);
    const dx = hoop.x - p.x;
    const dy = hoop.y - p.y;
    const dist = Math.hypot(dx, dy);
    const approach = dist > 0.01 ? Math.max(0, (p.vx * dx + p.vy * dy) / dist) : 0;
    const range = DUNK.baseRange + DUNK.rangePerSpeed * approach;
    const inFront = (p.x - hoop.x) * hoop.dir > 0;
    if (dist > range || !inFront) {
      addPopup(game, 'TOO FAR', COLORS.hint, p.x, p.y, 48);
      return;
    }
    if (Math.abs(dx) > 1) p.facing = Math.sign(dx);
    startDunk(game, hoop, dist);
  }

  // Leap to a spot where the overhead ball sits right above the rim, slam it at the top, hang, drop.
  // Most dunks hang briefly; some hang long and bend the rim; a rare one rips the rim off.
  function startDunk(game, hoop, dist) {
    const p = game.player;
    const s = scaleAtY(hoop.y) / spriteScale(hoop.y);
    const ballAhead = (SHOOT_BALL_X + BALL_SIZE / 2) / s;
    // Height at which the overhead ball sits right on the rim: where the slam ends and the hang begins.
    const reach = -(SHOOT_BALL_TOP + BALL_SIZE) / s;
    const roll = Math.random();
    const outcome = roll < DUNK.shatterChance ? 'shatter' : roll < DUNK.shatterChance + DUNK.hangChance ? 'hang' : 'normal';
    // The float ends hovering short of the rim (back along the approach), so the slam swoops forward into it.
    const to = { x: hoop.x - p.facing * ballAhead, y: hoop.y };
    const ax = to.x - p.x;
    const ay = to.y - p.y;
    const approachLen = Math.hypot(ax, ay);
    const back = Math.min(DUNK.slamReach, approachLen) / Math.max(approachLen, 0.001);
    const hover = approachLen > 0.001
      ? { x: to.x - ax * back, y: to.y - ay * back }
      : { x: to.x - p.facing * DUNK.slamReach, y: to.y };
    p.vx = 0;
    p.vy = 0;
    p.shot = {
      dunk: true,
      t: 0,
      rise: DUNK.rise + dist * DUNK.risePerUnit,
      // A rim hang lasts until the dunk key is pressed again (see updateDunk).
      hang: { normal: DUNK.hang, hang: Infinity, shatter: DUNK.shatterHang }[outcome],
      bend: { normal: DUNK.bend, hang: DUNK.hangBend, shatter: DUNK.shatterBend }[outcome],
      outcome,
      rimZ: HOOP.rimZ + 1 - reach,
      released: false,
      falling: false,
      fallFrom: 0,
      hoop,
      from: { x: p.x, y: p.y },
      hover,
      to,
    };
    game.meter = null;
  }

  function updateDunk(dt, game, letGo) {
    const p = game.player;
    const shot = p.shot;
    const hoop = shot.hoop;
    shot.t += dt;
    const t = shot.t;
    const { height } = DUNK;
    // Phase boundaries: float up, hold at the top, slam down, hang on the rim, drop.
    const apexAt = shot.rise;
    const slamAt = apexAt + DUNK.apexHold;
    const hangAt = slamAt + DUNK.slamTime;
    const fallAt = hangAt + shot.hang;
    const endAt = fallAt + DUNK.fall;

    // Glide up to the hover point short of the rim, easing in and out. After the slam the player stays at the rim.
    const k = Math.min(t / shot.rise, 1);
    const glide = k * k * (3 - 2 * k);
    const at = t < slamAt ? { x: lerp(shot.from.x, shot.hover.x, glide), y: lerp(shot.from.y, shot.hover.y, glide) } : shot.to;
    p.x = at.x;
    p.y = at.y;

    if (t < apexAt) {
      // A quick jump to most of the height, then a slow float up the rest of the way, well above the rim.
      const j = DUNK.jumpShare;
      p.z = k < j
        ? height * DUNK.jumpPart * Math.sin(((k / j) * Math.PI) / 2)
        : height * lerp(DUNK.jumpPart, 1, (k - j) / (1 - j));
    } else if (t < slamAt) {
      p.z = height;
    } else if (t < hangAt) {
      // Slam: drop down and forward into the rim, accelerating until the ball meets it.
      const s = (t - slamAt) / DUNK.slamTime;
      p.x = lerp(shot.hover.x, shot.to.x, s);
      p.y = lerp(shot.hover.y, shot.to.y, s);
      p.z = lerp(height, shot.rimZ, s * s);
    } else if (t < fallAt) {
      if (!shot.released) slam(game, shot);
      // On the rim: it bends under the player's weight and pulls them down with it, and the player swings
      // like a pendulum (first forward with their momentum), dragging the rim sideways with them.
      const s = scaleAtY(hoop.y);
      const ht = t - hangAt;
      hoop.hanging = true;
      hoop.hangBend = shot.bend;
      hoop.sway = p.facing * DUNK.swayPx * Math.sin((2 * Math.PI * ht) / DUNK.swayPeriod) * Math.exp(-DUNK.swayDecay * ht);
      p.hangSway = hoop.sway;
      p.x = shot.to.x + hoop.sway / s;
      p.z = shot.rimZ - (hoop.bend + hoopFlex(hoop).drop) / s;
      // Holding on: pressing the dunk key again lets go, starting the drop next tick.
      if (shot.hang === Infinity && letGo) shot.hang = ht;
    } else {
      if (!shot.falling) {
        shot.falling = true;
        shot.fallFrom = p.z;
        shot.fallX = shot.to.x + p.hangSway / scaleAtY(hoop.y);
        p.hangSway = 0;
        hoop.hanging = false;
        if (shot.outcome === 'shatter') shatterRim(game, hoop);
      }
      p.x = shot.fallX;
      p.z = shot.fallFrom * Math.cos((Math.min((t - fallAt) / DUNK.fall, 1) * Math.PI) / 2);
    }

    if (t >= endAt) {
      p.z = 0;
      p.shot = null;
      if (shot.outcome === 'shatter') fadeToReset();
    }
  }

  // Impact: drive the ball through, knock the rim down, and freeze the game for a split second.
  function slam(game, shot) {
    const p = game.player;
    const hoop = shot.hoop;
    shot.released = true;
    game.ball.slam(hoop.x, hoop.y, p.shootingBallPosition().z, DUNK.slamSpeed, { hoop, points: 2, dist: 0, dunk: true });
    p.hasBall = false;
    game.stats.fga++;
    hoop.bendV += DUNK.slamKick;
    game.hitStop = DUNK.hitStop;
  }

  function shatterRim(game, hoop) {
    hoop.broken = true;
    hoop.bend = 0;
    hoop.bendV = 0;
    spawnRimDebris(game, hoop);
    camera.shake = DUNK.shatterShake;
    addPopup(game, 'RIM SHATTERED!', COLORS.bad, hoop.x, hoop.y, HOOP.rimZ + 30);
  }

  return { update };
})();
