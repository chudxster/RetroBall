// Courts: Quick game and Practice play on the court picked on their screens; career at home on Classic Hardwood and
// its Final on Finals Night with the spotlight; everything else on Classic Hardwood. Every court renders.
test(() => {
  Title.show('quick');
  ok(document.querySelector('#title-quick .court-name').textContent === 'Classic Hardwood', 'Classic Hardwood by default');
  document.querySelector('#title-quick [data-court-step="1"]').click();
  ok(Courts.picked().id === 'college' && document.querySelector('#title-practice .court-name').textContent === 'College Fieldhouse', 'pick the next one (Practice shows it too)');
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    Courts.step(1);
    seen.add(Courts.picked().id);
  }
  ok(seen.size === 9 && !seen.has('finals'), 'nine courts to pick from; Finals Night is the Final\'s');
  while (Courts.picked().id !== 'neon') Courts.step(1);
  Title.hide();
  startMode('3v3');
  ok(court.id === 'neon' && COLORS.woodA === '#1a1c2c', 'a Quick game on the picked court');
  startMode('career');
  ok(court.id === 'classic', 'career at home on Classic Hardwood');
  const c = Career.get();
  c.phase = 'final';
  c.playoff = { seeds: [0, 1, 2, 3], semis: [[0, 3], [1, 2]], final: [0, 1], champion: null };
  startMode('career');
  ok(court.id === 'finals' && court.spotlight, 'the Final on Finals Night');
  for (const theme of COURTS) {
    setCourt(theme);
    sim(0.2);
    render(1);
  }
  ok(true, 'every court renders');
});
