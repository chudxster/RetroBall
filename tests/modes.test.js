// Difficulty, 2 Player fairness, call for the ball, save versioning.
test(() => {
  Title.show('quick');
  document.querySelector('[data-difficulty="2"]').click();
  document.querySelector('.btn.title-start[data-mode="3v3"]').click();
  ok(opponentAILevel === DIFFICULTY[2].ai, 'All-Star sets the opponents\' level');
  Career.offer(state.rules);
  Career.begin(0, state.rules);
  startMode('career');
  ok(opponentAILevel === Career.setup().aiLevel, 'career keeps its own level');
  Career.forfeit();

  Duo.setFormat('vs3');
  startMode('duo');
  const away = state.roster.find((p) => p.team === 1);
  ok(aiValue(away, [0, 1]) === AI.teammateLevel, 'versus: both sides\' AI at the teammate level');
  crowdHype.t = 0;
  cheerCrowd(0.5, away);
  ok(crowdHype.peak === 0.5, 'versus: the crowd cheers both alike');

  // Call for the ball: an open caller gets it.
  startMode('3v3');
  sim(2);
  const mate = state.roster.find((p) => p.team === 0 && p.role === 1);
  const u = state.user;
  Play.give(state, mate);
  state.humans[0].player = u;
  Object.assign(u, { x: 300, y: 125 });
  Object.assign(mate, { x: 250, y: 125 });
  for (const d of state.roster.filter((p) => p.team === 1)) Object.assign(d, { x: 60, y: 30 + d.role * 80 });
  key('KeyQ', true);
  update(STEP);
  key('KeyQ', false);
  let t = 0;
  while (!u.hasBall && t++ < 120) update(STEP);
  ok(u.hasBall, 'calling for the ball gets it from an AI teammate');

  ok(loadStored(SAVE_VERSION_KEY) === SAVE_VERSION, 'saves are stamped with the current version');
});
