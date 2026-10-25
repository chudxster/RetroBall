// The locker room: walk up to the coach, take a quest, finish it in a game, claim the tokens and the Locker Room
// trophy, then take that trophy off the scoreboard's shelf in the trophy case.
test(() => {
  const walk = (code, seconds) => {
    key(code, true);
    for (let i = 0; i < seconds * 60; i++) Locker.update(1 / 60);
    key(code, false);
  };
  const press = (code) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true }));
  };
  const toCoach = () => {
    document.querySelector('[data-go="locker"]').click();
    walk('KeyD', 0.3); // from just inside the door
    walk('KeyW', 0.6);
    press('KeyE');
  };
  const talk = document.getElementById('locker-talk');
  toCoach();
  ok(Locker.isOpen() && !Title.isOpen(), 'the locker room opens from the main menu');
  ok(!talk.hidden && document.getElementById('locker-talk-name').textContent === 'COACH', 'walk up to the coach and talk');
  talk.querySelector('.btn').click();
  ok(Quests.status('coach').state === 'active' && talk.hidden, 'take the quest');
  press('Escape');
  ok(!Locker.isOpen() && Title.isOpen(), 'Esc goes back to the main menu');

  startMode('3v3');
  state.stats[0].stl = 5;
  testing.endGame();
  sim(0.2);
  ok(Quests.status('coach').state === 'done', 'a game with 5 steals finishes it');
  toTitle();

  const tokens = Career.get().tokens;
  toCoach();
  talk.querySelector('.btn').click();
  ok(Career.get().tokens === tokens + 30 && Trophies.earned().some((t) => t.id === 'quests'), 'claim: 30 tokens and the Locker Room trophy');
  ok(Quests.status('coach').state === 'offer' && talk.textContent.includes('+30'), 'and the next quest is offered');
  ok(Trophies.shelf().some((t) => t.id === 'quests'), 'it stands on the shelf');
  Trophies.toggleShelf('quests');
  ok(!Trophies.shelf().some((t) => t.id === 'quests') && loadStored(TROPHY_STORAGE_KEY).shelf.length === 0, 'the trophy case takes it off (saved)');
  Locker.draw(document.getElementById('game').getContext('2d'));
});
// Walking out the black door on the left wall goes back to the main menu.
test(() => {
  document.querySelector('[data-go="locker"]').click();
  key('KeyA', true);
  for (let i = 0; i < 60 && Locker.isOpen(); i++) Locker.update(1 / 60);
  key('KeyA', false);
  ok(!Locker.isOpen() && Title.isOpen(), 'out the door: back at the main menu');
});
