// Every mode runs with the AI playing everyone (people included): no errors, nobody's position goes NaN, and the
// timed games reach the final buzzer.
test(() => {
  isHuman = () => false;
  const finite = () => [...state.players, state.ball, ...(state.ref ? [state.ref] : [])].every((o) => Number.isFinite(o.x + o.y + o.z));
  const run = (label, setup, seconds, mustEnd) => {
    setup();
    let good = true;
    for (let i = 0; i < seconds * 60; i++) {
      update(STEP);
      if (i % 30 === 0) {
        render(0);
        good = good && finite();
      }
    }
    ok(good, `${label}: positions stay finite`);
    if (mustEnd) ok(state.clock.over, `${label}: reaches the final buzzer (${state.score.join('-')})`);
  };
  state.rules.halfMinutes = 1;
  run('quick game', () => startMode('3v3'), 160, true);
  run('demo', () => toTitle('home'), 200, false);
  run('career', () => { Career.offer(state.rules); Career.begin(1, state.rules); startMode('career'); }, 160, true);
  for (const f of ['vs3', 'vs1', 'coop']) run(`2 player ${f}`, () => { Duo.setFormat(f); startMode('duo'); }, 40, false);
  run('free shot', () => startMode('free'), 40, false);
  run('around the world', () => startMode('world'), 40, false);
  state.rules.freeThrows = false;
  state.rules.shotClock = false;
  run('quick game, no FT or shot clock', () => startMode('3v3'), 160, true);
});
