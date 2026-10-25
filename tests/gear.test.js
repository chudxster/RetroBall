// Cosmetics: locked until their trophy's metal, picked in the Gear tab, worn by your team in games (never in the
// demo), and the ball, rim, banner and dunk trail set for your games.
test(() => {
  ok(Cosmetics.pick('band') === null && Cosmetics.row('band', 0).value === 'Locked', 'locked at first');
  Trophies.count(null, null, 'steals', 10);
  Menu.openTab('gear-view');
  const row = [...document.querySelectorAll('#gear-player .gear-row')][0];
  row.querySelectorAll('.step')[1].click();
  ok(Cosmetics.pick('band', 0).name === 'BRONZE' && row.querySelector('.gear-value').textContent === 'BRONZE', 'Pickpocket bronze unlocks the bronze headband');
  ok(Cosmetics.pick('band', 1) === null, 'worn per player');
  ok(state.players.every((p) => !p.gear), 'nothing in the demo');
  Title.hide();
  startMode('3v3');
  const me = state.roster.find((p) => p.team === 0 && p.role === 0);
  ok(me.gear && me.gear.band && me.colors.wrist === '#b86f50', 'your player wears it, wristbands too');
  ok(me.bodyParts().some((r) => r[4] === '#b86f50'), 'drawn on the sprite');
  ok(state.roster.filter((p) => p.team === 1).every((p) => !p.gear), 'not the other team');

  testing.allGear();
  // From none, n steps lands on the n-th style.
  const steps = { ball: 3, rim: 4, banner: 3, trail: 3, kit: 4, shoes: 4, goggles: 4, sleeve: 2 };
  for (const [id, n] of Object.entries(steps)) for (let i = 0; i < n; i++) Cosmetics.step(id, 0, 1);
  dressUp();
  ok(Cosmetics.pick('ball').name === 'ABA' && ballSprite(0, 0, 3).some((r) => r[4] === '#e43b44'), 'the ABA ball rolls its panels');
  ok(defendHoop(0).skin && !attackHoop(0).skin && defendHoop(0).skin.crack, 'the rim pack on your home basket only (Cracked)');
  ok(arenaBanner && arenaBanner.tier === 2, 'your banner in the rafters (gold)');
  ok(me.colors.jersey === '#5d275d' && me.thigh() === 3, 'the road kit, short shorts and all');
  ok(!colorsClash(awayJersey(state.look.jersey), me.colors.jersey), 'the away team doesn\'t clash with the kit');
  me.trail = [{ x: 100, y: 100, t: state.time }];
  for (const view of ['side', 'frontQ', 'backQ', 'front', 'back']) {
    me.view = view;
    me.bodyParts();
  }
  sim(1);
  render(1);
  ok(true, 'renders with every cosmetic on');
});
