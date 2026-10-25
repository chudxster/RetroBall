// Online play over the real transport (?net=local or internet): the runner puts a host (#host) and a guest (#guest)
// side by side. The host makes a lobby, the guest finds it and joins, both see the lobby, the host starts, and the
// guest's keys play player 2 on the host's computer. Each side reports to the outer page, which collects the results.
(() => {
  const who = location.hash.slice(1);
  const report = (m) => parent.postMessage(m, '*');
  const check = (cond, m) => report(`${cond ? 'PASS' : 'FAIL'} ${who}: ${m}`);
  window.addEventListener('load', () => {
    document.hasFocus = () => true;
    setInterval(() => frame(performance.now()), 16);
    Title.show('online');
    document.querySelector(`[data-network="${params.get('net') || 'local'}"]`).click();
    if (who === 'host') {
      document.querySelector('[data-online-format="vs1"]').click();
      document.getElementById('online-host').click();
      setTimeout(() => {
        const lobby = Net.lobby();
        check(lobby && lobby.isHost && !document.getElementById('online-lobby').hidden && state.mode === 'demo', 'the lobby shows the guest, nothing started yet');
        document.getElementById('online-start').click();
      }, 4500);
      setTimeout(() => key('Space', true), 5500);
      setTimeout(() => key('Space', false), 5800);
      setTimeout(() => { window.x0 = state.humans[1].player.x; }, 6200);
      setTimeout(() => {
        check(state.mode === 'duo' && Net.online(), 'Start runs a 2 Player game here');
        check(state.humans[1].player.x - window.x0 > 20, 'the guest\'s keys move player 2');
      }, 9500);
    } else {
      setTimeout(() => {
        const game = document.querySelector('#online-lobbies .lobby');
        check(!!game, 'the lobby finder lists the host');
        if (game) game.click();
      }, 2500);
      setTimeout(() => {
        check(Net.lobby() && document.getElementById('online-start').hidden && !Net.isGuest(), 'in the lobby, waiting for the host');
      }, 4400);
      setTimeout(() => key('Space', true), 5500);
      setTimeout(() => key('Space', false), 5800);
      setTimeout(() => key('KeyD', true), 6300);
      setTimeout(() => check(Net.isGuest() && state.mode === 'duo' && !state.draft, 'drawing the host\'s game'), 9400);
    }
    setTimeout(() => { for (const e of ERRS) report(`FAIL ${who} error: ${e}`); report('DONE'); }, 9800);
  });
})();
