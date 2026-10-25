// Box score bookkeeping, popups and challenge texts.
test(() => {
  isHuman = () => false;
  state.rules.halfMinutes = 1;
  startMode('3v3');
  sim(100);
  for (const t of [0, 1]) {
    const keys = Object.keys(newStats());
    const sums = keys.map((k) => state.roster.filter((p) => p.team === t).reduce((a, p) => a + p.stats[k], 0));
    ok(keys.every((k, i) => sums[i] === state.stats[t][k]), `team ${t}: players' lines add up to the team's`);
  }
  isHuman = (game, p) => game.humans.some((h) => h.player === p);

  // Popups: stacking, merging, colors.
  startMode('3v3');
  state.popups = [];
  addPopup(state, 'A', '#fff', 100, 100, 50);
  addPopup(state, 'B', '#fff', 105, 100, 52);
  addPopup(state, 'C', '#fff', 105, 100, 50);
  ok(state.popups.map((p) => p.z).join() === '50,62,80', 'overlapping popups stack a line apart');
  addPopup(state, 'A', '#fff', 100, 100, 50);
  ok(state.popups.length === 3, 'the same popup again merges');
  ok(playColor(state, 0) === COLORS.okay && playColor(state, 1) === COLORS.bad, 'popup colors: yours yellow, theirs red');
  Duo.setFormat('vs3');
  startMode('duo');
  ok(playColor(state, 1) === DUO.markers[1], 'versus popups in the player colors');

  // A stuffed dunk counts as a block.
  startMode('3v3');
  const p = state.roster.find((q) => q.team === 1 && q.role === 0);
  const d = state.roster.find((q) => q.team === 0 && q.role === 0);
  const hoop = attackHoop(1);
  Object.assign(d, { x: hoop.x + hoop.dir * 5, y: hoop.y });
  Object.assign(p, { x: hoop.x + hoop.dir * 10, y: hoop.y });
  DEFENSE.stuffOdds = 100;
  Play.give(state, p);
  ok(Play.tryStuff(state, p, hoop) && state.stats[0].blk === 1 && d.stats.blk === 1, 'a stuff is a block');
  DEFENSE.stuffOdds = 1;

  // Challenge texts pluralize.
  ok(Career.challengeText({ tier: 0, index: 1, n: 1 }) === 'MAKE 1 THREE', 'MAKE 1 THREE');
  ok(Career.challengeText({ tier: 1, index: 3, n: 1 }) === 'DUNK ONCE', 'DUNK ONCE');
});
