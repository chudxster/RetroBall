// The main menu's Season Road: a stop for every game of the season, this week's challenges above its stop (picking
// one tips off), and a played week showing its score.
test(() => {
  Title.show('home');
  const stops = () => [...document.querySelectorAll('#home-road .stop')];
  const c = Career.get();
  ok(stops().length === c.schedule.length + 2, 'a stop for every week, the semifinal and the final');
  ok(stops()[0].classList.contains('now') && stops()[8].classList.contains('playoff'), 'week 1 is next, the playoffs at the end');
  const challenges = document.querySelectorAll('#home-pop .challenge');
  ok(challenges.length === 3, 'this week\'s three challenges');
  ok(document.activeElement === challenges[0], 'focus starts on the first challenge');
  challenges[1].click();
  ok(state.mode === 'career' && !Title.isOpen() && state.challenge === c.offer[1], 'picking one tips off with it');
  state.score = [21, 14];
  testing.endGame();
  sim(0.1); // the buzzer settles the career game on the next update
  toTitle();
  const first = stops()[0];
  ok(first.classList.contains('won') && first.querySelector('.stop-result').textContent.startsWith('21-14'), 'week 1 shows the win and its score');
  ok(stops()[1].classList.contains('now') && document.getElementById('title-career-desc').textContent.includes('week 2'), 'week 2 is next');
  ok(loadStored(CAREER_STORAGE_KEY).results.length === 1, 'results are saved');
  Career.get().phase = 'over';
  Career.get().result = 'missed';
  Title.show('home');
  ok(document.querySelector('#home-pop .btn').textContent === `Start season ${c.season + 1}`, 'a finished season offers the next one');
});
