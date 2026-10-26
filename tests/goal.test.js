// A career challenge met mid-game: a jingle, and its box flashes and floats up out of the way (stat goals only; the
// others can still come undone until the buzzer).
test(() => {
  tipOff();
  state.challenge = Career.challengeFor(0, 2, 1); // GET 2 STEALS
  sim(0.5);
  ok(state.mode === 'career' && !state.goalMet, 'nothing yet');
  state.stats[0].stl = 2;
  sim(0.1);
  ok(state.goalMet && state.goalMet.t > 0, 'met: it starts floating away');
  const t = state.goalMet.t;
  sim(0.5);
  ok(state.goalMet.t > t, 'and keeps going');
  state.challenge = Career.challengeFor(0, 0, 1); // WIN THE GAME: can come undone, so no celebration mid-game
  state.goalMet = null;
  state.score = [10, 0];
  sim(0.2);
  ok(!state.goalMet, 'a win goal waits for the buzzer');
  sim(2);
  render();
});
