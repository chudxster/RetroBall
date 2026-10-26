// After a career game: Main menu (left), Next game (middle), Upgrades (right). Next game shows the challenges and
// picking one tips off; the others go to the main menu and the Upgrades screen.
test(() => {
  const box = document.getElementById('after-game');
  const finish = () => {
    tipOff();
    state.score = [21, 14];
    testing.endGame();
    sim(1.5);
  };
  finish();
  const labels = [...box.querySelectorAll('.after-row .btn')].map((b) => b.textContent).join(' / ');
  ok(!box.hidden && labels === 'Main menu / Next game / Upgrades', `the three buttons in order (${labels})`);
  ok(document.activeElement === box.querySelector('[data-focus="after-next"]'), 'Next game is picked first');
  box.querySelector('[data-focus="after-next"]').click();
  ok(box.querySelectorAll('.challenge').length === 3, 'Next game shows the three challenges');
  const week = Career.get().week;
  box.querySelectorAll('.challenge')[2].click();
  ok(box.hidden && state.mode === 'career' && !state.clock.over && Career.get().week === week && state.challenge === Career.get().current.challenge, 'picking one tips off the next game');
  state.score = [21, 14];
  testing.endGame();
  sim(1.5);
  box.querySelector('[data-focus="after-upgrades"]').click();
  ok(box.hidden && !document.getElementById('title-career').hidden && state.mode === 'demo', 'Upgrades opens the Upgrades screen');
  finish();
  box.querySelector('[data-focus="after-home"]').click();
  ok(box.hidden && !document.getElementById('title-home').hidden, 'Main menu goes home');
});
