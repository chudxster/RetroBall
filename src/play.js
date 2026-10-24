// Everything between players: passing, steals, contest jumps and blocks, who picks up a loose ball (and so who has
// possession), and keeping players from standing inside each other.
const Play = (() => {
  // Carry out the non-shooting buttons for one player this tick: dash, pass, steal, jump.
  function act(game, p, ctl) {
    if (ctl.dash) p.dash(ctl.dash);
    if (ctl.pass && p.hasBall && !p.shot) pass(game, p, ctl.pass);
    if (ctl.steal) trySteal(game, p);
    if (ctl.jump) startJump(p);
  }

  // A flat, quick throw led toward where the receiver is heading.
  function pass(game, from, to) {
    const { ball } = game;
    const sx = from.x + from.facing * 6;
    const sy = from.y;
    let tx = to.x;
    let ty = to.y;
    let time = PASS.minTime;
    // Two rounds of aiming at the receiver's future spot are plenty.
    for (let i = 0; i < 2; i++) {
      time = Math.max(PASS.minTime, Math.hypot(tx - sx, ty - sy) / PASS.speed);
      tx = to.x + to.vx * time * PASS.lead;
      ty = to.y + to.vy * time * PASS.lead;
    }
    ball.launch(sx, sy, PASS.fromZ, { x: tx, y: ty, z: PASS.toZ }, time, null);
    ball.thrower = from;
    ball.lastTeam = from.team;
    ball.pass = { to, team: from.team, target: { x: tx, y: ty }, rolls: new Map() };
    from.hasBall = false;
    if (Math.abs(tx - from.x) > 1) from.facing = Math.sign(tx - from.x);
  }

  // Who the user's pass goes to: the teammate closest to the held direction, or with no direction held, the most
  // open one (nearer is a little better).
  function passTarget(game, from, move) {
    const mates = teammates(game, from).filter((q) => !q.sitting);
    const mx = move.x;
    const my = move.y * PLAYER.depthSpeed;
    const len = Math.hypot(mx, my);
    let best = null;
    let bestScore = -Infinity;
    for (const q of mates) {
      const d = Math.max(courtDist(from, q), 0.01);
      const score = len > 0.3
        ? ((q.x - from.x) * mx + (q.y - from.y) * my) / (d * len)
        : Math.min(openness(game, q), 60) - d * 0.15;
      if (len > 0.3 && score < PASS.aimCone) continue;
      if (score > bestScore) {
        bestScore = score;
        best = q;
      }
    }
    // Nobody in the held direction: fall back to the most open teammate.
    return best || (len > 0.3 ? passTarget(game, from, { x: 0, y: 0 }) : null);
  }

  // Reach for the ball. Close enough to the ball side of the handler, it may get knocked loose onto the floor and
  // the handler is left stunned; a miss leaves the defender off balance for a moment instead. A handler still in
  // their own backcourt (not yet over half court) can't be stolen from.
  function trySteal(game, p) {
    if (p.stealCD > 0 || p.hasBall || p.airborne() || p.sitting) return;
    p.stealCD = DEFENSE.stealCooldown;
    p.reachT = DEFENSE.reachTime;
    const h = game.ball.holder;
    if (!h || h.team === p.team || h.shot) return;
    if (Math.abs(h.x - p.x) > 1) p.facing = Math.sign(h.x - p.x);
    const ballX = h.x + h.facing * 8;
    const inRange = Math.hypot(ballX - p.x, h.y - p.y) <= stealReach(p);
    const backcourt = (h.x - COURT.length / 2) * attackHoop(h.team).dir > 0;
    const chance = p === game.user ? lerp(...DEFENSE.userStealChance, AI.level) : aiValue(p, AI.stealChance);
    if (inRange && !backcourt && Math.random() < chance) {
      poke(game, h, p);
      addPopup(game, 'STEAL!', COLORS.okay, p.x, p.y, 56);
    } else {
      p.stunT = DEFENSE.stealStun;
    }
  }

  // How far a player can reach for a steal, and how well they block, with their defense upgrade.
  function stealReach(p) {
    return DEFENSE.stealRange * (1 + UPGRADES.stealRange * p.upgrades.defense);
  }

  function blockBonus(p) {
    return UPGRADES.blockChance * p.upgrades.defense;
  }

  // Knock the ball out of `h`'s hands onto the floor, roughly toward `by`, and stun `h`.
  function poke(game, h, by) {
    const { ball } = game;
    const fromX = h.x + h.facing * 8;
    let dx = by.x - fromX;
    let dy = by.y - h.y;
    const l = Math.hypot(dx, dy) || 1;
    const a = Math.atan2(dy / l, dx / l) + rand(-0.6, 0.6);
    const d = rand(...DEFENSE.pokeDist);
    dx = Math.cos(a) * d;
    dy = Math.sin(a) * d;
    h.hasBall = false;
    h.stunT = DEFENSE.stolenStun;
    h.dazedT = DEFENSE.stolenStun;
    h.vx = 0;
    h.vy = 0;
    ball.launch(fromX, h.y, 12, { x: fromX + dx, y: clamp(h.y + dy, 0, COURT.width), z: 0 }, 0.4, null);
    ball.thrower = h;
    ball.lastTeam = by.team;
    ball.noPickup = DEFENSE.stolenStun;
  }

  function startJump(p) {
    if (p.airborne() || p.sitting || p.hasBall) return;
    p.jump = { t: 0 };
    p.vx = 0;
    p.vy = 0;
  }

  // How much defenders are bothering a shooter (0..contestMax), scaled down for fadeaways.
  function contest(game, shooter) {
    let worst = 0;
    for (const d of opponents(game, shooter)) {
      const dist = courtDist(d, shooter);
      if (dist > DEFENSE.contestRange || d.sitting) continue;
      let k = 1 - clamp((dist - 8) / (DEFENSE.contestRange - 8), 0, 1);
      if (!d.jump) k *= DEFENSE.contestGround;
      worst = Math.max(worst, k);
    }
    return worst * DEFENSE.contestMax * shooter.shot.contest;
  }

  // At the release: an opponent up in the air right on the shooter may swat it away.
  function tryBlock(game, shooter, from) {
    for (const d of opponents(game, shooter)) {
      const range = DEFENSE.blockRange * (1 + UPGRADES.blockRange * d.upgrades.defense);
      if (!d.jump || d.z < DEFENSE.blockMinZ || courtDist(d, shooter) > range) continue;
      const base = d === game.user ? DEFENSE.userBlockChance : aiValue(d, AI.blockChance);
      const chance = (base + blockBonus(d)) * shooter.shot.contest;
      if (Math.random() >= chance) continue;
      // Knocked back the way the shooter came from, landing loose.
      const hoop = shooter.shot.hoop;
      const away = -hoop.dir;
      const to = { x: from.x + away * rand(30, 60), y: from.y + rand(-30, 30), z: 0 };
      game.ball.launch(from.x, from.y, from.z, to, 0.6, null);
      game.ball.thrower = shooter;
      game.ball.lastTeam = d.team;
      addPopup(game, 'BLOCKED!', COLORS.bad, d.x, d.y, 60);
      return true;
    }
    return false;
  }

  // Opponents in position to meet a dunker at the rim: near the rim itself, or right on the dunker at takeoff.
  function rimGuards(game, p, hoop) {
    return opponents(game, p).filter((q) => !q.sitting
      && (courtDist(q, hoop) < DEFENSE.rimGuard || courtDist(q, p) < DEFENSE.rimGuard * 0.7));
  }

  // A dunk attempt into a guarded rim may get stuffed: the dunker goes up, the ball comes back out loose.
  function tryStuff(game, p, hoop) {
    for (const d of rimGuards(game, p, hoop)) {
      const chance = (d === game.user ? DEFENSE.userStuffChance : DEFENSE.stuffChance + aiValue(d, AI.blockChance) * 0.5) + blockBonus(d);
      if (Math.random() >= chance) continue;
      p.hasBall = false;
      p.jump = { t: 0 };
      p.vx = 0;
      p.vy = 0;
      game.stats[p.team].fga++;
      // Swatted back out toward the court.
      const to = { x: p.x + hoop.dir * rand(20, 45), y: p.y + rand(-25, 25), z: 0 };
      game.ball.launch(p.x, p.y, 40, to, 0.55, null);
      game.ball.thrower = p;
      game.ball.lastTeam = d.team;
      if (Math.abs(d.x - p.x) > 1) d.facing = Math.sign(p.x - d.x);
      startJump(d);
      addPopup(game, 'STUFFED!', COLORS.bad, d.x, d.y, 60);
      return true;
    }
    return false;
  }

  // Getting back on defense: a player whose team doesn't have the ball, still beyond their pick-up line and heading
  // back toward their own hoop, runs DEFENSE.retreatSpeed times faster.
  function retreatBoost(game, p, move) {
    if (game.mode === 'free' || game.possession === p.team || p.hasBall) return 1;
    const hoop = defendHoop(p.team);
    const limit = COURT.length / 2 - hoop.dir * AI.pickupLine;
    const back = (p.x - limit) * hoop.dir > 0 && move.x * hoop.dir < 0;
    return back ? DEFENSE.retreatSpeed : 1;
  }

  // Hand the ball to `p`: their team now has it. The user always plays the home ball handler; when the other
  // team gets it, the user's control jumps to whoever is nearest the ball.
  function give(game, p) {
    const { ball } = game;
    if (ball.holder && ball.holder !== p) ball.holder.hasBall = false;
    ball.held = true;
    ball.holder = p;
    ball.shot = null;
    ball.pass = null;
    ball.reserved = null;
    ball.lastTeam = p.team;
    p.hasBall = true;
    p.mind.holdT = 0;
    game.possession = p.team;
    if (p.team === 0) game.user = p;
    else game.user = nearestTo(game, 0, p, game.user);
  }

  // The player on `team` nearest to spot `at` (preferring to stay on `fallback` if it's a tie).
  function nearestTo(game, team, at, fallback, exclude = null) {
    let best = fallback;
    let bestD = fallback && fallback !== exclude ? courtDist(fallback, at) : Infinity;
    for (const q of game.players) {
      if (q.team !== team || q === exclude || q.sitting) continue;
      const d = courtDist(q, at);
      if (d < bestD - 0.5) {
        bestD = d;
        best = q;
      }
    }
    return best;
  }

  // Q without the ball: switch to the teammate nearest the ball (or the next nearest if that's already you).
  function switchPlayer(game) {
    const at = game.ball.holder || game.ball;
    game.user = nearestTo(game, 0, at, null, game.user) || game.user;
  }

  // Whoever is in reach of a loose ball grabs it, nearest first. A pass's receiver reaches further; opponents in
  // its path get one try each at picking it off.
  function pickups(game) {
    const { ball } = game;
    if (ball.held) return;
    let best = null;
    let bestD = Infinity;
    for (const p of game.players) {
      if (p.shot || p.sitting) continue;
      if (ball.reserved !== null && p.team !== ball.reserved) continue;
      if (ball.noPickup > 0 && p === ball.thrower) continue;
      const receiver = ball.pass && ball.pass.to === p;
      const radius = receiver ? PASS.catchRadius : PICKUP.radius;
      const reach = (receiver ? PASS.catchReach : PICKUP.reach) + p.z;
      if (ball.z > reach || Math.abs(ball.x - p.x) > radius || Math.abs(ball.y - p.y) > radius) continue;
      if (ball.pass && p.team !== ball.pass.team) {
        const rolls = ball.pass.rolls;
        if (!rolls.has(p)) {
          const chance = p === game.user ? DEFENSE.userIntercept : aiValue(p, AI.interceptChance);
          rolls.set(p, Math.random() < chance);
        }
        if (!rolls.get(p)) continue;
      }
      const d = Math.hypot(ball.x - p.x, ball.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (!best) return;
    const picked = ball.pass && best.team !== ball.pass.team;
    give(game, best);
    if (picked) addPopup(game, 'PICKED OFF!', COLORS.okay, best.x, best.y, 56);
  }

  // Players closer than DEFENSE.separation push each other apart (anyone mid-shot or dunk holds their ground).
  function separate(game) {
    const S = DEFENSE.separation;
    const ps = game.players;
    for (let i = 0; i < ps.length; i++) {
      for (let j = i + 1; j < ps.length; j++) {
        const a = ps[i];
        const b = ps[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d >= S) continue;
        if (d < 0.01) {
          dx = rand(-1, 1);
          dy = rand(-1, 1);
          d = Math.hypot(dx, dy);
        }
        const push = S - d;
        const aFixed = !!a.shot || a.sitting;
        const bFixed = !!b.shot || b.sitting;
        if (aFixed && bFixed) continue;
        const ka = aFixed ? 0 : bFixed ? 1 : 0.5;
        const kb = 1 - ka;
        a.x -= (dx / d) * push * ka;
        a.y -= (dy / d) * push * ka;
        b.x += (dx / d) * push * kb;
        b.y += (dy / d) * push * kb;
      }
    }
  }

  return { act, pass, passTarget, trySteal, startJump, contest, tryBlock, rimGuards, tryStuff, retreatBoost, stealReach, give, nearestTo, switchPlayer, pickups, separate };
})();
