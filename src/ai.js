// Computer players. Each tick every AI player fills in a control object, the same shape as the user's:
// { move, shoot, dunk, pass, steal, jump, switch, face }. Their memory lives on `p.mind`.
//
// With the ball: drive at the rim when the lane is open, dunk in range, shoot when open (or when held too long),
// pass out of pressure. Off the ball on offense: spread to spots around the arc, sometimes cutting to the rim.
// On defense: stay between your man and the hoop, tighter on the ball handler, reach for steals and jump to
// contest shots. Loose balls: the nearest player on each team chases it.
const AIBrain = (() => {
  // Floor spots relative to the hoop being attacked: `a` = distance out from the hoop toward center court.
  const SPOTS = [
    { a: 125, y: 125 }, // top of the key
    { a: 85, y: 35 },   // wings
    { a: 85, y: 215 },
    { a: 12, y: 10 },   // corners (behind the three-point line)
    { a: 12, y: 240 },
    { a: 55, y: 70 },   // elbows
    { a: 55, y: 180 },
  ];

  function blank() {
    return { move: { x: 0, y: 0 }, shoot: false, dunk: false, pass: null, steal: false, jump: false, switch: false, face: 0 };
  }

  function think(dt, game, ctls, frozen) {
    for (const p of game.players) {
      if (p === game.user) continue;
      const ctl = blank();
      if (!frozen) decide(dt, game, p, ctl);
      ctls.set(p, ctl);
    }
  }

  // What the AI would do as `p` this tick (also lets the user's player be played by the AI, e.g. in tests).
  function controlFor(dt, game, p) {
    const ctl = blank();
    decide(dt, game, p, ctl);
    return ctl;
  }

  function decide(dt, game, p, ctl) {
    const { ball } = game;
    if (p.sitting) return;
    if (p.shot) {
      inShot(dt, p, ctl);
      return;
    }
    p.mind.releaseAt = null;
    if (p.jump) return;
    if (ball.holder === p) withBall(dt, game, p, ctl);
    else if (ball.pass && ball.pass.to === p) moveTo(ctl, p, ball.pass.target);
    else if (!ball.held && !ball.pass && chasing(game, p)) moveTo(ctl, p, landing(ball));
    else if (game.possession === p.team) offBall(dt, game, p, ctl);
    else defend(dt, game, p, ctl);
  }

  // Mid jump shot: keep holding until the meter reaches the release point picked at the start, which lands around
  // the middle of the green, give or take the AI level's error.
  function inShot(dt, p, ctl) {
    const shot = p.shot;
    // Hanging on the rim until told to let go (only when playing the user's player): tap the button.
    if (shot.dunk && shot.hang === Infinity && shot.released && shot.t > shot.rise + 1.2) ctl.dunk = !p.prevDunk;
    if (shot.dunk || shot.released) return;
    const m = p.mind;
    if (m.releaseAt == null) m.releaseAt = shot.center + randn() * aiValue(p, AI.shotError);
    ctl.shoot = shot.fill + dt / shot.meterTime < m.releaseAt;
  }

  function withBall(dt, game, p, ctl) {
    const m = p.mind;
    m.holdT = (m.holdT || 0) + dt;
    const hoop = attackHoop(p.team);
    const d = courtDist(p, hoop);
    const gap = openness(game, p);
    m.t = (m.t || 0) - dt;
    if (m.t <= 0) {
      m.t = aiValue(p, AI.think) * rand(0.7, 1.3);

      // Dunk if nobody is guarding the rim; with a defender there, pull up for a short jumper more often.
      if (Shooting.dunkRange(p, hoop).ok && Math.random() < (Play.rimGuards(game, p, hoop).length ? 0.3 : 0.9)) {
        ctl.dunk = true;
        return;
      }
      const forced = m.holdT > AI.maxHold;
      const layup = d < 45 && gap > 10 && m.holdT > 0.3;
      const open = d < AI.shootRange && gap > AI.openGap && m.holdT > AI.minHold;
      const want = isThreePoint(p.x, p.y, hoop) ? 0.7 : 0.4;
      if (forced || layup || (open && Math.random() < want)) {
        ctl.shoot = true;
        // Crowded: sometimes fade away from the defender.
        if (gap < AI.pressureGap * 1.5 && Math.random() < 0.35) ctl.move = toward(p, { x: p.x - (hoop.x - p.x), y: p.y - (hoop.y - p.y) });
        return;
      }
      if (gap < AI.pressureGap && m.holdT > 0.6 && Math.random() < 0.45) {
        const to = openMate(game, p);
        if (to && openness(game, to) > gap + 8) {
          ctl.pass = to;
          return;
        }
      }
      m.target = driveTarget(game, p, hoop);
    }
    moveTo(ctl, p, m.target || p);
  }

  // Straight at the rim if nobody is in the way, otherwise a sidestep to find a new angle.
  function driveTarget(game, p, hoop) {
    const dx = hoop.x - p.x;
    const dy = hoop.y - p.y;
    const l = Math.hypot(dx, dy) || 1;
    const ux = dx / l;
    const uy = dy / l;
    const probe = { x: p.x + ux * 25, y: p.y + uy * 25 };
    const blocked = opponents(game, p).some((q) => courtDist(q, probe) < 16);
    if (!blocked) return { x: hoop.x + hoop.dir * 12, y: hoop.y + rand(-10, 10) };
    const side = Math.random() < 0.5 ? 1 : -1;
    return {
      x: clamp(p.x + ux * 10 - uy * side * 35, 10, COURT.length - 10),
      y: clamp(p.y + uy * 10 + ux * side * 35, 15, COURT.width - 15),
    };
  }

  // The most open teammate with a clear passing lane.
  function openMate(game, p) {
    let best = null;
    let bestGap = -Infinity;
    for (const q of teammates(game, p)) {
      if (q.sitting || !laneClear(game, p, q)) continue;
      const g = openness(game, q);
      if (g > bestGap) {
        bestGap = g;
        best = q;
      }
    }
    return best;
  }

  function offBall(dt, game, p, ctl) {
    const m = p.mind;
    const hoop = attackHoop(p.team);
    const holder = game.ball.holder;
    m.spotT = (m.spotT || 0) - dt;
    if (m.spot == null || m.spotT <= 0) {
      const taken = new Set(teammates(game, p).map((q) => q.mind.spot));
      const free = SPOTS.map((_, i) => i).filter((i) => !taken.has(i) && !(holder && courtDist(spotPos(hoop, SPOTS[i]), holder) < 40));
      m.spot = free.length ? free[Math.floor(Math.random() * free.length)] : 0;
      m.spotT = rand(2.5, 5);
      m.cut = Math.random() < 0.2;
      m.cutY = hoop.y + rand(-15, 15);
    }
    const target = m.cut ? { x: hoop.x + hoop.dir * 15, y: m.cutY } : spotPos(hoop, SPOTS[m.spot]);
    moveTo(ctl, p, target);
    const look = holder || game.ball;
    if (Math.abs(look.x - p.x) > 2) ctl.face = Math.sign(look.x - p.x);
  }

  // No opponent within `width` of the straight line between two players.
  function laneClear(game, from, to, width = 14) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len2 = dx * dx + dy * dy || 1;
    return opponents(game, from).every((q) => {
      const t = ((q.x - from.x) * dx + (q.y - from.y) * dy) / len2;
      if (t <= 0 || t >= 1) return true;
      return Math.hypot(from.x + dx * t - q.x, from.y + dy * t - q.y) >= width;
    });
  }

  function spotPos(hoop, s) {
    return { x: hoop.x + hoop.dir * s.a, y: s.y };
  }

  function defend(dt, game, p, ctl) {
    const m = p.mind;
    const opp = opponents(game, p);
    const man = opp.find((q) => q.role === p.role) || opp[0];
    if (!man) return;
    const hoop = defendHoop(p.team);
    const holder = game.ball.holder;
    const onBall = man === holder;

    // Between the man and the hoop; off the ball, sagging a little toward the ball.
    const gap = onBall ? AI.guardGapBall : AI.guardGapOff;
    const dx = hoop.x - man.x;
    const dy = hoop.y - man.y;
    const l = Math.hypot(dx, dy) || 1;
    let target = { x: man.x + (dx / l) * gap, y: man.y + (dy / l) * gap };
    if (!onBall && holder) target = { x: lerp(target.x, holder.x, 0.2), y: lerp(target.y, holder.y, 0.2) };
    // Help defense: when the ball handler drives inside AI.helpRange, the off-ball defender nearest the hoop drops
    // in front of the rim.
    if (!onBall && holder && holder.team !== p.team && courtDist(holder, hoop) < AI.helpRange && helper(game, p, hoop) === p) {
      const hx = holder.x - hoop.x;
      const hy = holder.y - hoop.y;
      const hl = Math.hypot(hx, hy) || 1;
      target = { x: hoop.x + (hx / hl) * AI.helpDepth, y: hoop.y + (hy / hl) * AI.helpDepth };
    }

    // Half-court defense: nobody follows the offense past the half-court line; they wait on their own half and pick
    // their man up once he crosses.
    const limit = COURT.length / 2 - hoop.dir * AI.pickupLine;
    if ((target.x - limit) * hoop.dir > 0) target = { x: limit, y: target.y };

    // A shooter nearby: close out on them and jump to contest after a reaction delay.
    const shooter = opp.find((q) => q.shot && !q.shot.dunk && !q.shot.released && courtDist(q, p) < DEFENSE.contestRange * 1.5);
    if (shooter) {
      target = { x: shooter.x, y: shooter.y };
      if (m.contestFor !== shooter.shot) {
        m.contestFor = shooter.shot;
        m.contestT = aiValue(p, AI.reaction) * rand(0.8, 1.2);
      }
      m.contestT -= dt;
      if (m.contestT <= 0 && courtDist(p, shooter) < DEFENSE.contestRange * 0.75) {
        ctl.jump = true;
        m.contestT = Infinity;
      }
    }

    moveTo(ctl, p, target);
    if (Math.abs(man.x - p.x) > 2) ctl.face = Math.sign(man.x - p.x);

    if (onBall && !man.shot && p.stealCD <= 0 && courtDist(p, man) < DEFENSE.stealRange + 4 && Math.random() < aiValue(p, AI.stealRate) * dt) {
      ctl.steal = true;
    }
  }

  // The off-ball defender (not the user's player) closest to the hoop being attacked.
  function helper(game, p, hoop) {
    const holder = game.ball.holder;
    let best = null;
    let bestD = Infinity;
    for (const q of game.players) {
      if (q.team !== p.team || q === game.user || q.sitting) continue;
      const man = opponents(game, q).find((o) => o.role === q.role);
      if (man === holder) continue;
      const d = courtDist(q, hoop);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    return best;
  }

  // The player on this team nearest to where a loose ball will come down chases it. After a basket only the team
  // bringing it back in goes for it.
  function chasing(game, p) {
    const { ball } = game;
    if (ball.reserved !== null && ball.reserved !== p.team) return false;
    const at = landing(ball);
    let best = null;
    let bestD = Infinity;
    for (const q of game.players) {
      if (q.team !== p.team || q === game.user || q.sitting) continue;
      const d = courtDist(q, at);
      if (d < bestD) {
        bestD = d;
        best = q;
      }
    }
    return best === p;
  }

  // Where a loose ball will next be low enough to grab (roughly: ignores rim bounces).
  function landing(ball) {
    const reach = PICKUP.reach - 5;
    let t = 0;
    if (ball.z > reach || ball.vz > 0) {
      const disc = ball.vz * ball.vz + 2 * BALL.gravity * (ball.z - reach);
      t = disc > 0 ? Math.min((ball.vz + Math.sqrt(disc)) / BALL.gravity, 1.5) : 0;
    }
    return {
      x: clamp(ball.x + ball.vx * t, 0, COURT.length),
      y: clamp(ball.y + ball.vy * t, 0, COURT.width),
    };
  }

  // Control input that heads for `t`, easing off on arrival. Depth input is scaled down because the player's
  // depth speed is boosted (see PLAYER.depthSpeed).
  function moveTo(ctl, p, t) {
    const dist = Math.hypot(t.x - p.x, t.y - p.y);
    if (dist < 3) return;
    const dir = toward(p, t);
    const k = Math.min(1, dist / 15);
    ctl.move = { x: dir.x * k, y: dir.y * k };
  }

  function toward(p, t) {
    const dx = t.x - p.x;
    const dy = (t.y - p.y) / PLAYER.depthSpeed;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  // Standard normal random number.
  function randn() {
    const u = 1 - Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * Math.random());
  }

  return { think, controlFor, blank };
})();
