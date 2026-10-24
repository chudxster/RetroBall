// The referee (3v3 only). Not one of the players: nobody guards, passes to or bumps into them. Most of the time
// they wander in front of the scorer's table on the ball's side of the court; at a free throw they hold the ball in
// the lane and pass it to the shooter after REF.passDelay (see startFreeThrow in main.js).
const Ref = (() => {
  const LOOK = {
    skin: SKINS[1],
    hairStyle: 'buzz',
    hair: '#566c86',
    jersey: '#f4f4f4',
    shorts: '#1a1c2c',
    shoe: '#1a1c2c',
    laces: '#f4f4f4',
    number: '',
    stripes: true,
  };

  function make() {
    const ref = new Player({ x: COURT.length / 2, y: REF.y, look: LOOK });
    ref.hasBall = false;
    ref.mind = { t: 0, drift: 0 };
    return ref;
  }

  function update(dt, game, frozen) {
    const ref = game.ref;
    if (!ref) return;
    const ft = game.freeThrow;
    let target = ref;
    // A held ball's own position isn't kept up to date; whoever holds it is where it is.
    const ball = game.ball.holder || game.ball;
    if (ft && ref.hasBall) {
      ft.refT -= dt;
      if (ft.refT <= 0) passIn(game, ref, ft.shooter);
    } else {
      const m = ref.mind;
      m.t -= dt;
      if (m.t <= 0) {
        m.t = rand(...REF.rethink);
        m.drift = rand(-REF.wander, REF.wander);
      }
      const cx = COURT.length / 2;
      target = { x: cx + clamp((ball.x - cx) * REF.follow, -REF.range, REF.range) + m.drift, y: REF.y };
    }
    ref.update(dt, frozen ? { x: 0, y: 0 } : heading(ref, target), REF.speed);
    // Standing around, they keep an eye on the ball.
    if (!ref.moving && !ref.hasBall && Math.abs(ball.x - ref.x) > 4) ref.facing = Math.sign(ball.x - ref.x);
  }

  // Walk toward `t`, easing off on arrival (depth input scaled like the AI's, see AIBrain moveTo).
  function heading(ref, t) {
    const dx = t.x - ref.x;
    const dy = (t.y - ref.y) / PLAYER.depthSpeed;
    const dist = Math.hypot(t.x - ref.x, t.y - ref.y);
    if (dist < 3) return { x: 0, y: 0 };
    const k = Math.min(1, dist / 15) / (Math.hypot(dx, dy) || 1);
    return { x: dx * k, y: dy * k };
  }

  // A soft toss to the shooter, only catchable by them.
  function passIn(game, ref, shooter) {
    const { ball } = game;
    ref.hasBall = false;
    ball.launch(ref.x + ref.facing * 6, ref.y, PASS.fromZ, { x: shooter.x, y: shooter.y, z: PASS.toZ }, REF.passTime, null);
    ball.pass = { to: shooter, team: shooter.team, target: { x: shooter.x, y: shooter.y }, rolls: new Map() };
    ball.reserved = shooter.team;
    ball.lastTeam = shooter.team;
  }

  return { make, update };
})();
