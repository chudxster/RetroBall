// Trophies: repetition counts for people's players only, metals by threshold, secrets, saving, the shelf.
test(() => {
  startMode('3v3');
  const u = state.user;
  const ai = state.roster.find((p) => p.team === 1);
  countStat(state, ai, 'fga');
  ok((Trophies.list().families.find((f) => f.id === 'shots').count) === 0, 'the AI\'s shots don\'t count');
  for (let i = 0; i < 50; i++) countStat(state, u, 'fga');
  const shots = Trophies.list().families.find((f) => f.id === 'shots');
  ok(shots.count === 50 && shots.metal === 0 && shots.next === 250, 'the user\'s 50th shot earns Shooter bronze');
  ok(Trophies.toast() && Trophies.toast().text.includes('SHOOTER: BRONZE'), 'a banner announces it');
  ok(Trophies.shelf().length === 1, 'one cup on the shelf');
  for (let i = 0; i < 30; i++) Trophies.count(null, null, 'randomize');
  ok(Trophies.list().secrets.some((s) => s.name === 'Fashion Week' && s.earned), 'a secret: Fashion Week');
  ok(Trophies.list().secrets.filter((s) => !s.earned).every((s) => s.name === '???'), 'unearned secrets read ???');
  ok(loadStored(TROPHY_STORAGE_KEY).metals.shots === 0, 'saved with the new trophy');
  toTitle();
  const before = Trophies.list().families.find((f) => f.id === 'shots').count;
  countStat(state, state.roster[0], 'fga');
  ok(Trophies.list().families.find((f) => f.id === 'shots').count === before, 'nothing counts in the demo');
  state.rules.halfMinutes = 0.5;
  startMode('3v3');
  sim(1);
  Clock.finish(state);
  sim(0.1);
  ok(Trophies.list().families.find((f) => f.id === 'games').count === 1, 'a finished game counts once');
  render(0);
  ok(true, 'renders with the shelf and banner');
});
