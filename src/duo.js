// 2 Player mode: two people on one keyboard (key sets 'p1' and 'p2', see Input), in one of three formats:
//   vs3  - versus 3v3: each plays their own team (home and away) with two AI teammates
//   vs1  - versus 1v1: just the two of them on the full court
//   coop - co-op: both on the home team (plus an AI teammate) against three AI players
// Before tip-off both get the same random number of upgrade points to spend on their side (their whole team in
// versus, their own player in co-op), on a split screen with their own keys; at halftime they get more. After the
// final buzzer player 1's shoot key runs it back (same pre-game upgrades), player 2's starts over with a new draft.
const DUO_STORAGE_KEY = 'retroball.duo';

const Duo = (() => {
  const FORMATS = ['vs3', 'vs1', 'coop'];
  const PADS = ['p1', 'p2'];
  const prefs = loadPrefs(DUO_STORAGE_KEY, { format: 'vs3' });
  if (!FORMATS.includes(prefs.format)) prefs.format = 'vs3';

  let levels = null;    // each side's upgrade levels for the game being played
  let preLevels = null; // ...as they stood after the pre-game draft (what "run it back" restores)
  let afterReady = false; // after the buzzer: both shoot keys let go, so a press counts

  const zeros = () => cleanLevels(null);
  const total = (l) => Object.values(l).reduce((a, b) => a + b, 0);
  const randInt = ([lo, hi]) => lo + Math.floor(Math.random() * (hi - lo + 1));

  // The people playing and which player each starts on: [{ pad, team, start }].
  function humans(roster) {
    if (prefs.format === 'coop') return [{ pad: 'p1', team: 0, start: roster[0] }, { pad: 'p2', team: 0, start: roster[1] }];
    return [{ pad: 'p1', team: 0, start: roster[0] }, { pad: 'p2', team: 1, start: roster[3] }];
  }

  // Who's on the court: everyone, or just the two in 1v1.
  function players(roster) {
    return prefs.format === 'vs1' ? [roster[0], roster[3]] : roster;
  }

  // A new 2 Player game: a fresh draft, or (running it back) the same pre-game upgrades straight to tip-off.
  function start(game, runBack) {
    afterReady = false;
    if (runBack && preLevels) {
      levels = preLevels.map((l) => ({ ...l }));
      apply(game);
      return;
    }
    levels = [zeros(), zeros()];
    apply(game);
    startDraft(game, 'pre');
  }

  function startDraft(game, phase) {
    const points = randInt(phase === 'pre' ? DUO.prePoints : DUO.halfPoints);
    game.draft = {
      phase,
      points,
      // `prev` starts from the keys held right now, so a key already down when the draft opens doesn't count.
      sides: PADS.map((set) => {
        const pad = Input.pad(set);
        return { left: points, cursor: 0, ready: false, bought: zeros(), prev: { ...pad.move(), shoot: pad.shoot() } };
      }),
    };
  }

  // Each side's levels onto its players. Versus: the whole team. Co-op: each person's own player, with the AI
  // teammate and the opponents getting the two players' average, spread at random.
  function apply(game) {
    const roster = game.roster;
    if (prefs.format === 'coop') {
      roster[0].upgrades = levels[0];
      roster[1].upgrades = levels[1];
      const avg = Math.round((total(levels[0]) + total(levels[1])) / 2);
      for (const p of roster.slice(2)) p.upgrades = randomUpgrades(avg);
      return;
    }
    for (const p of roster) p.upgrades = levels[p.team];
  }

  // The split-screen draft, read from each player's keys: up/down picks a stat, right buys a level, left takes back
  // one bought in this draft, shoot says ready (or not). Once both are ready the game goes on.
  function updateDraft(game) {
    const d = game.draft;
    d.sides.forEach((s, i) => {
      const pad = Input.pad(PADS[i]);
      const move = pad.move();
      const shoot = pad.shoot();
      const pressed = (now, before) => now !== 0 && now !== before;
      if (!s.ready) {
        if (pressed(move.y, s.prev.y)) s.cursor = (s.cursor + move.y + UPGRADE_KEYS.length) % UPGRADE_KEYS.length;
        const key = UPGRADE_KEYS[s.cursor];
        if (pressed(move.x, s.prev.x) && move.x > 0 && s.left > 0 && levels[i][key] < UPGRADES.max) {
          levels[i][key]++;
          s.bought[key]++;
          s.left--;
        } else if (pressed(move.x, s.prev.x) && move.x < 0 && s.bought[key] > 0) {
          levels[i][key]--;
          s.bought[key]--;
          s.left++;
        }
      }
      if (shoot && !s.prev.shoot) s.ready = !s.ready;
      s.prev = { x: move.x, y: move.y, shoot };
    });
    if (!d.sides.every((s) => s.ready)) return;
    // Both ready: on with the game. Nobody's shot starts from the ready press still being held.
    game.draft = null;
    apply(game);
    for (const h of game.humans) h.player.prevShoot = true;
    if (d.phase === 'pre') preLevels = levels.map((l) => ({ ...l }));
    if (d.phase === 'pre') game.countdown = COUNTDOWN.seconds; // then the 3-2-1 before tip-off
    else Clock.startPeriod(game);
  }

  // After the final buzzer: player 1's shoot runs it back, player 2's starts a new draft.
  function updateAfter(game, newGame) {
    const [p1, p2] = PADS.map((s) => Input.pad(s).shoot());
    if (!p1 && !p2) afterReady = true;
    else if (afterReady) newGame('duo', p1);
  }

  function setFormat(format) {
    if (!FORMATS.includes(format)) return;
    prefs.format = format;
    saveStored(DUO_STORAGE_KEY, prefs);
  }

  return {
    FORMATS,
    format: () => prefs.format,
    setFormat,
    versus: () => prefs.format !== 'coop',
    humans,
    players,
    start,
    startDraft,
    updateDraft,
    updateAfter,
    levels: () => levels,
  };
})();
