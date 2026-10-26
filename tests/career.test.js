// Career quit rule, across a reload: ?step=a quits one game from the menu and leaves another open; ?keep&step=b
// (same browser profile) finds that one forfeited.
test(() => {
  const step = params.get('step');
  if (step === 'a') {
    const week = Career.get().week;
    tipOff();
    sim(5);
    Menu.openTab('ui-view');
    const quit = document.getElementById('to-title');
    quit.click();
    ok(quit.textContent.includes('Forfeit'), 'Main menu asks: forfeit?');
    quit.click();
    const l = Career.get().last;
    ok(state.mode === 'demo' && l.forfeit && l.tokens === 0 && Career.get().week === week + 1, 'quitting is a forfeit loss, no tokens');
    tipOff();
    sim(2);
    ok(loadStored(CAREER_STORAGE_KEY).current !== null, 'a game in progress is saved');
  } else {
    const c = Career.get();
    ok(c.last && c.last.forfeit && c.week === 2 && c.current === null, 'reloading mid-game forfeits it');
  }
});
