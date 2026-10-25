// Online play over the real transport: online.html puts a host (#host) and a guest (#guest) side by side. Each
// reports to the outer page, which collects the results.
(() => {
  const who = location.hash.slice(1);
  const report = (m) => parent.postMessage(m, '*');
  window.addEventListener('load', () => {
    document.hasFocus = () => true;
    setInterval(() => frame(performance.now()), 16);
    Title.show('online');
    document.querySelector(`[data-network="${params.get('net') || 'local'}"]`).click();
    if (who === 'host') {
      document.querySelector('[data-online-format="vs1"]').click();
      document.getElementById('online-host').click();
      setTimeout(() => key('Space', true), 5500);
      setTimeout(() => key('Space', false), 5800);
      setTimeout(() => { window.x0 = state.humans[1].player.x; }, 7000);
      setTimeout(() => {
        report(`${state.mode === 'duo' && Net.online() ? 'PASS' : 'FAIL'} host: a 2 Player game started for the guest`);
        report(`${state.humans[1].player.x - window.x0 > 50 ? 'PASS' : 'FAIL'} host: the guest's keys move player 2`);
      }, 9500);
    } else {
      setTimeout(() => {
        const game = document.querySelector('#online-lobbies .lobby');
        report(`${game ? 'PASS' : 'FAIL'} guest: the lobby finder lists the host`);
        if (game) game.click();
      }, 2500);
      setTimeout(() => key('Space', true), 5500);
      setTimeout(() => key('Space', false), 5800);
      setTimeout(() => key('KeyD', true), 7000);
      setTimeout(() => report(`${Net.isGuest() && state.mode === 'duo' && !state.draft ? 'PASS' : 'FAIL'} guest: drawing the host's game`), 9400);
    }
    setTimeout(() => { for (const e of ERRS) report(`FAIL ${who} error: ${e}`); report('DONE'); }, 9800);
  });
})();
