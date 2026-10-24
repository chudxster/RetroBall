// Hold shoot to rise into a jump shot while the meter fills; let go in the green zone to make it.
// The dunk button leaps to the rim instead, from farther out the faster you're driving at it.
// Works the same for every player: `ctl` holds what they're pressing this tick (the keyboard for the user,
// the AI's choice for everyone else).
const Shooting = (() => {
  function update(dt, game, p, ctl) {
    const pressed = ctl.shoot && !p.prevShoot;
    const dunkPressed = ctl.dunk && !p.prevDunk;
    p.prevShoot = ctl.shoot;
    p.prevDunk = ctl.dunk;

    if (p.sitting || p.jump) {
      // Knocked down by a shattered rim, or up in a contest jump: nothing to do.
    } else if (!p.shot) {
      if (dunkPressed && p.hasBall) tryDunk(game, p);
      else if (pressed && p.hasBall) start(game, p, ctl.move);
    } else if (p.shot.dunk) {
      updateDunk(dt, game, p, dunkPressed);
    } else {
      const shot = p.shot;
      shot.t += dt;
      const k = Math.min(shot.t / shot.jumpTime, 1);
      p.z = SHOT.jumpHeight * Math.sin(Math.PI * k);
      if (shot.fade) {
        // Drift back fast off the floor, slowing toward the landing.
        const back = SHOT.fadeDist * Math.sin((k * Math.PI) / 2);
        const m = PLAYER.boundsMargin;
        p.x = clamp(shot.fade.x + shot.fade.dx * back, -m, COURT.length + m);
        p.y = clamp(shot.fade.y + shot.fade.dy * back, -m, COURT.width + m);
      }
      if (!shot.released) {
        // Defenders closing in shrink the green zone as it fills.
        const green = shot.baseGreen * (1 - Play.contest(game, p));
        p.meter.lo = shot.center - green / 2;
        p.meter.hi = shot.center + green / 2;
        shot.fill = Math.min(shot.t / shot.meterTime, 1);
        p.meter.fill = shot.fill;
        if (!ctl.shoot || shot.fill >= 1) release(game, p);
      }
      if (shot.t >= shot.jumpTime) {
        p.z = 0;
        p.shot = null;
      }
    }

    const m = p.meter;
    if (m && m.result) {
      m.hideIn -= dt;
      if (m.hideIn <= 0) p.meter = null;
    }
  }

  function start(game, p, move) {
    const hoop = shotHoop(game, p);
    const dist = Math.hypot(hoop.x - p.x, hoop.y - p.y);
    if (Math.abs(hoop.x - p.x) > 1) p.facing = Math.sign(hoop.x - p.x);
    const fade = fadeDirection(p, hoop, dist, move);

    // Closer shots are quicker: the meter (and the jump with it) speeds up near the rim.
    const t = clamp((dist - SHOT.quickRange.near) / (SHOT.quickRange.far - SHOT.quickRange.near), 0, 1);
    const meterTime = lerp(SHOT.meterTimeClose, SHOT.meterTimeFar, t);

    // The green zone shrinks the farther out the shot is, and is much wider right at the rim.
    const { near, far } = SHOT.closeRangeGreen;
    const closeness = 1 - clamp((dist - near) / (far - near), 0, 1);
    let green = clamp(SHOT.greenMax - dist * SHOT.greenShrink, SHOT.greenMin, SHOT.greenMax) + SHOT.greenCloseBonus * closeness;
    if (fade) green *= SHOT.fadeGreen;
    if (isThreePoint(p.x, p.y, hoop)) green *= 1 + UPGRADES.threeGreen * p.upgrades.shooting;
    // Beyond half court: a fixed sliver of the meter, a frame or two wide. `deep` measures how far back (0 at the
    // half-court line, 1 at the far baseline).
    const halfLine = COURT.length / 2 - COURT.hoopX;
    const fromHoop = Math.abs(p.x - hoop.x);
    const deep = fromHoop > halfLine ? clamp((fromHoop - halfLine) / (COURT.length - COURT.hoopX - halfLine), 0, 1) : null;
    if (deep !== null) green = (p.upgrades.shooting >= UPGRADES.max ? SHOT.deepFramesMax : SHOT.deepFrames) / (meterTime * 60);
    // Keep a wide green fully on the meter (with a sliver of "late" above it).
    const center = Math.min(SHOT.greenCenter, 0.97 - green / 2);
    p.shot = {
      t: 0,
      fill: 0,
      released: false,
      hoop,
      meterTime,
      jumpTime: meterTime * SHOT.jumpPerMeter,
      fade,
      deep,
      baseGreen: green,
      center,
      // How much defenders' contests count (a fadeaway is harder to bother).
      contest: fade ? SHOT.fadeContest : 1,
    };
    if (fade) {
      // The fade replaces any running momentum.
      p.vx = 0;
      p.vy = 0;
    }
    p.meter = {
      fill: 0,
      lo: center - green / 2,
      hi: center + green / 2,
      result: null,
      hideIn: 0,
    };
  }

  // Holding away from the hoop (within ~60 degrees of straight back) makes it a fadeaway: returns the takeoff spot and
  // the unit direction to drift in (the way the stick points), or null for a normal jump shot.
  function fadeDirection(p, hoop, dist, move) {
    // Same depth boost as running, so the drift goes the way the player would have moved.
    const mx = move.x;
    const my = move.y * PLAYER.depthSpeed;
    const len = Math.hypot(mx, my);
    if (len < 0.5 || dist < 0.01) return null;
    const dot = (mx * (hoop.x - p.x) + my * (hoop.y - p.y)) / (len * dist);
    if (dot > SHOT.fadeAway) return null;
    return { x: p.x, y: p.y, dx: mx / len, dy: my / len };
  }

  // Release timing decides make or miss; the aim below then sends the ball where physics will play that out.
  // `deep` (beyond half court, 0 at the half-court line .. 1 from the far baseline, or null): even a green release
  // only goes in with SHOT.deepMake odds, and outside the green only a SHOT.deepLuck chance.
  function grade(fill, lo, hi, deep) {
    if (fill >= lo && fill <= hi) {
      const make = deep === null || Math.random() < lerp(SHOT.deepMake.half, SHOT.deepMake.full, deep);
      return { label: 'PERFECT', color: COLORS.good, make };
    }
    deep = deep !== null;
    if (deep && Math.random() < SHOT.deepLuck) return { label: 'LUCKY!', color: COLORS.okay, make: true };
    const early = fill < lo;
    const off = early ? lo - fill : fill - hi;
    if (off <= SHOT.goodMargin) {
      const label = early ? 'SLIGHTLY EARLY' : 'SLIGHTLY LATE';
      return { label, color: COLORS.okay, make: !deep && Math.random() < SHOT.slightMakeChance, early };
    }
    if (early && fill < SHOT.airballFill) return { label: 'WAY EARLY', color: COLORS.bad, make: false, early, airball: true };
    return { label: early ? 'EARLY' : 'LATE', color: COLORS.bad, make: false, early };
  }

  // Where the ball should come down, relative to the rim center: `long` along the shot line (+ = past center), `side` across it.
  // Offsets come from simulating thousands of shots: landing 0-2.5 long always drops, 5-7.5 short/long always rims out.
  function aim(result, dist, deep) {
    if (result.make) return { long: rand(0, 2.5), side: rand(-0.5, 0.5) };
    if (result.airball) return { long: -rand(14, 22), side: rand(-2, 2) };
    // Heaves come down so steeply that a near miss can still rattle in, and long ones bank in off the board: miss
    // them clearly short of the rim.
    if (deep !== null) return { long: -rand(9, 12), side: rand(-2, 2) };
    const long = result.early ? -rand(5, 7) : rand(5.5, 7.5);
    // Up close the ball drops so steeply that front/back rim misses still fall in, so miss off the side instead.
    const side = dist < SHOT.closeRange ? (Math.random() < 0.5 ? -1 : 1) * rand(7, 9) : rand(-1.5, 1.5);
    return { long, side };
  }

  function release(game, p) {
    const { ball } = game;
    const shot = p.shot;
    const meter = p.meter;
    shot.released = true;
    meter.hideIn = SHOT.meterLinger;
    const stats = game.stats[p.team];
    const hoop = shot.hoop;
    const points = isThreePoint(p.x, p.y, hoop) ? 3 : 2;
    stats.fga++;
    if (points === 3) stats.tpa++;
    p.hasBall = false;
    const from = p.shootingBallPosition();

    if (Play.tryBlock(game, p, from)) {
      meter.result = { label: 'BLOCKED', color: COLORS.bad, make: false };
      return;
    }

    const result = grade(shot.fill, meter.lo, meter.hi, shot.deep);
    meter.result = result;

    // Aim along the line from the ball to the hoop, offset long/short and sideways by the result.
    const dx = hoop.x - from.x;
    const dy = hoop.y - from.y;
    const dist = Math.hypot(dx, dy);
    const ux = dist > 0.01 ? dx / dist : -hoop.dir;
    const uy = dist > 0.01 ? dy / dist : 0;
    const { long, side } = aim(result, dist, shot.deep);
    const target = {
      x: hoop.x + ux * long - uy * side,
      y: hoop.y + uy * long + ux * side,
      z: HOOP.rimZ - BALL.radius,
    };

    ball.launch(from.x, from.y, from.z, target, SHOT.baseTime + dist / SHOT.flightSpeed, { hoop, points, dist, team: p.team });
    ball.thrower = p;
    ball.lastTeam = p.team;
    if (p === game.user || p.team === 0) addPopup(game, result.label, result.color, p.x, p.y, p.z + 48);
  }

  // Dunk range grows with speed toward the hoop: a standing dunk needs to be under the rim, a run at top speed
  // can take off from much farther out. Must be on the court side of the hoop.
  function dunkRange(p, hoop) {
    const dx = hoop.x - p.x;
    const dy = hoop.y - p.y;
    const dist = Math.hypot(dx, dy);
    const approach = dist > 0.01 ? Math.max(0, (p.vx * dx + p.vy * dy) / dist) : 0;
    const range = (DUNK.baseRange + DUNK.rangePerSpeed * approach) * (1 + UPGRADES.dunkRange * p.upgrades.dunking);
    const inFront = (p.x - hoop.x) * hoop.dir > 0;
    return { dist, ok: dist <= range && inFront };
  }

  function tryDunk(game, p) {
    const hoop = shotHoop(game, p);
    const { dist, ok } = dunkRange(p, hoop);
    if (!ok) {
      if (p === game.user) addPopup(game, 'TOO FAR', COLORS.hint, p.x, p.y, 48);
      return;
    }
    if (Math.abs(hoop.x - p.x) > 1) p.facing = Math.sign(hoop.x - p.x);
    if (Play.tryStuff(game, p, hoop)) return;
    startDunk(game, p, hoop, dist);
  }

  // Leap to a spot where the overhead ball sits right above the rim, slam it at the top, hang, drop.
  // Most dunks hang briefly; some hang long and bend the rim; a rare one rips the rim off.
  function startDunk(game, p, hoop, dist) {
    const s = scaleAtY(hoop.y) / spriteScale(hoop.y);
    const ballAhead = (SHOOT_BALL_X + BALL_SIZE / 2) / s;
    // Height at which the overhead ball sits right on the rim: where the slam ends and the hang begins.
    const reach = -(SHOOT_BALL_TOP + BALL_SIZE) / s;
    const lvl = p.upgrades.dunking;
    const shatterChance = DUNK.shatterChance + UPGRADES.shatterChance * lvl;
    const hangChance = DUNK.hangChance + UPGRADES.hangChance * lvl;
    const roll = Math.random();
    const outcome = roll < shatterChance ? 'shatter' : roll < shatterChance + hangChance ? 'hang' : 'normal';
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
      // The user's rim hang lasts until the dunk button is pressed again (see updateDunk); the AI lets go on its own.
      hang: { normal: DUNK.hang, hang: p === game.user ? Infinity : AI.hangTime, shatter: DUNK.shatterHang }[outcome],
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
    p.meter = null;
  }

  function updateDunk(dt, game, p, letGo) {
    const shot = p.shot;
    const hoop = shot.hoop;
    shot.t += dt;
    const t = shot.t;
    const { height } = DUNK;
    const shatter = shot.outcome === 'shatter';
    const fallTime = shatter ? DUNK.shatterFall : DUNK.fall;
    // Phase boundaries: float up, hold at the top, slam down, hang on the rim, drop.
    const apexAt = shot.rise;
    const slamAt = apexAt + DUNK.apexHold;
    const hangAt = slamAt + DUNK.slamTime;
    const fallAt = hangAt + shot.hang;
    const endAt = fallAt + fallTime;
    p.pose = null;

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
      if (!shot.released) slam(game, p, shot);
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
      // Holding on: pressing the dunk button again lets go, starting the drop next tick.
      if (shot.hang === Infinity && letGo) shot.hang = ht;
      // A rim-shattering slam kicks the legs up: halfway, then straight out.
      if (shatter) p.pose = ht < DUNK.legKick ? 'legsDiag' : 'legsUp';
    } else {
      if (!shot.falling) {
        shot.falling = true;
        shot.fallFrom = p.z;
        shot.fallX = shot.to.x + p.hangSway / scaleAtY(hoop.y);
        p.hangSway = 0;
        hoop.hanging = false;
        if (shatter) shatterRim(game, hoop);
      }
      const f = Math.min((t - fallAt) / fallTime, 1);
      if (shatter) {
        // Dropping with the rim, legs still out, drifting back to land sitting down.
        p.pose = 'legsUp';
        p.x = shot.fallX - p.facing * DUNK.shatterDrift * f;
        p.z = shot.fallFrom * (1 - f * f);
      } else {
        p.x = shot.fallX;
        p.z = shot.fallFrom * Math.cos((f * Math.PI) / 2);
      }
    }

    if (t >= endAt) {
      p.z = 0;
      p.shot = null;
      if (shatter) {
        p.pose = 'sit';
        p.sitting = true;
        camera.shake = DUNK.sitShake;
        fadeToReset();
      }
    }
  }

  // Impact: drive the ball through, knock the rim down, and freeze the game for a split second.
  function slam(game, p, shot) {
    const hoop = shot.hoop;
    shot.released = true;
    game.ball.slam(hoop.x, hoop.y, p.shootingBallPosition().z, DUNK.slamSpeed, { hoop, points: 2, dist: 0, dunk: true, team: p.team });
    game.ball.thrower = p;
    game.ball.lastTeam = p.team;
    // While someone hangs on the rim (or tears it down) the ball stays dead.
    if (shot.outcome === 'hang') game.ball.lockT = DUNK.hangLock;
    if (shot.outcome === 'shatter') game.ball.lockT = Infinity;
    p.hasBall = false;
    game.stats[p.team].fga++;
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

  return { update, dunkRange };
})();
