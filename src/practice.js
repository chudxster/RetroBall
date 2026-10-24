// Practice drills (Gamemode tab, under Practice). Around the World: 15 shots at the right hoop in order - three
// spots across under the hoop, two from each elbow, three free throws, then five threes around the arc from corner to corner. The
// player is put on each spot with the ball and can only shoot; a make moves on to the next spot, a miss means
// shooting from the same spot again. The clock starts with the first shot; the best time is saved.
const WORLD_RECORD_KEY = 'retroball.records';

const Practice = (() => {
  // Spots as [distance out from the hoop, offset across the court from its middle] (negative = far sideline).
  const ELBOW = COURT.keyDepth - COURT.hoopX;
  const ARC = COURT.threeR + 5;
  const WING = Math.round(ARC * Math.SQRT1_2);
  const CORNER_Y = COURT.width / 2 - COURT.threeCornerY + 3;
  const WORLD = [
    [14, -22], [14, 0], [14, 22],
    [ELBOW, -COURT.keyHalfWidth], [ELBOW, -COURT.keyHalfWidth],
    [ELBOW, COURT.keyHalfWidth], [ELBOW, COURT.keyHalfWidth],
    [ELBOW + FOUL.ftBack, 0], [ELBOW + FOUL.ftBack, 0], [ELBOW + FOUL.ftBack, 0],
    [10, -CORNER_Y], [WING, -WING], [ARC, 0], [WING, WING], [10, CORNER_Y],
  ];
  const WAIT = 0.5; // seconds after a shot is decided before the player is put on the next spot

  function best() {
    const v = (loadStored(WORLD_RECORD_KEY) || {}).world;
    return Number.isFinite(v) ? v : null;
  }

  function start(game) {
    game.drill = { i: 0, t: 0, started: false, inFlight: false, made: false, waitT: 0, done: false, record: false, best: best(), ready: false };
    place(game, true);
  }

  // Put the player on the current spot, facing the hoop, with the ball.
  function place(game, instant = false) {
    const p = game.user;
    const hoop = attackHoop(0);
    const [a, dy] = WORLD[game.drill.i];
    const x = hoop.x + hoop.dir * a;
    const y = COURT.width / 2 + dy;
    Object.assign(p, { x, y, prevX: x, prevY: y, vx: 0, vy: 0, z: 0, shot: null, jump: null, meter: null });
    p.facing = Math.sign(hoop.x - x) || -hoop.dir;
    Play.give(game, p);
    if (instant) camera.snap(x);
  }

  // Only the shoot key does anything during the drill (and, once it's done, starts the next run).
  function controls(game, ctls) {
    const c = ctls.get(game.user);
    ctls.set(game.user, { ...AIBrain.blank(), shoot: c.shoot });
  }

  function scored(game) {
    if (game.drill && game.drill.inFlight) game.drill.made = true;
  }

  function update(dt, game) {
    const d = game.drill;
    if (!d) return;
    const p = game.user;
    if (d.done) {
      // A fresh press of the shoot key goes again.
      if (!Input.shoot()) d.ready = true;
      else if (d.ready) start(game);
      return;
    }
    if (d.started) d.t += dt;
    if (p.shot && p.shot.released && !d.inFlight && !d.waitT) {
      d.started = true;
      d.inFlight = true;
      d.made = false;
    }
    // The shot is decided once the ball has gone in or come down.
    if (d.inFlight && (d.made || !game.ball.shot)) {
      d.inFlight = false;
      d.waitT = WAIT;
      if (d.made) addPopup(game, `${d.i + 1}/${WORLD.length}`, COLORS.good, p.x, p.y, 60);
    }
    if (d.waitT > 0) {
      d.waitT -= dt;
      if (d.waitT > 0) return;
      d.waitT = 0;
      if (d.made) d.i++;
      if (d.i >= WORLD.length) finish(game);
      else place(game);
    }
  }

  function finish(game) {
    const d = game.drill;
    d.done = true;
    d.ready = false;
    d.record = d.best === null || d.t < d.best;
    if (d.record) {
      d.best = d.t;
      saveStored(WORLD_RECORD_KEY, { world: d.t });
    }
  }

  // m:ss.t (tenths rounded down, so 59.96 shows as 0:59.9, never 0:60.0)
  function format(t) {
    const tenths = Math.floor(t * 10);
    const m = Math.floor(tenths / 600);
    const s = (tenths % 600) / 10;
    return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
  }

  return { start, controls, scored, update, best, format, spots: WORLD.length };
})();
