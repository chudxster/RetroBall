// The 3-2-1 before a game: nobody moves and the clock doesn't run until GO.
test(() => {
  COUNTDOWN.seconds = 3;
  Title.hide();
  startMode('3v3');
  const t0 = state.clock.t;
  key('KeyD', true);
  sim(2.5);
  ok(state.countdown > 0 && state.clock.t === t0 && Math.abs(state.user.vx) < 1, 'frozen during the countdown');
  sim(1);
  ok(state.countdown <= 0 && state.goT > 0, 'GO!');
  sim(1);
  key('KeyD', false);
  ok(state.clock.t < t0 && state.user.vx !== 0, 'then the game runs');
  render(1);
});
