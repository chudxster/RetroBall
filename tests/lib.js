// Loaded before the game's scripts in every test page (see run.ps1): collects errors, stops the real frame loop
// (tests call update() themselves), starts from empty storage unless the page asks to keep it (?keep), seeds
// Math.random (?seed=n) so runs repeat, and gives tests ok() / done().
window.ERRS = [];
window.onerror = (m, s, l) => { ERRS.push(`${m} @${(s || '').split('/').pop()}:${l}`); };
window.requestAnimationFrame = () => 0;
const params = new URLSearchParams(location.search);
if (!params.has('keep')) try { localStorage.clear(); } catch (e) {}
(() => {
  let s = Number(params.get('seed')) || 12345;
  Math.random = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
})();
const RESULTS = [];
function ok(cond, msg) {
  RESULTS.push(`${cond ? 'PASS' : 'FAIL'} ${msg}`);
}
// Run the test body; the runner reads the results from the page title.
function test(body) {
  window.addEventListener('load', () => {
    try {
      body();
    } catch (e) {
      RESULTS.push(`FAIL threw: ${e.message} ${(e.stack || '').split('\n')[1] || ''}`);
    }
    for (const e of ERRS) RESULTS.push(`FAIL error: ${e}`);
    document.title = `RES|${RESULTS.join('|')}`;
  });
}
const sim = (seconds) => { for (let i = 0; i < seconds * 60; i++) update(STEP); };
const key = (code, down) => window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, bubbles: true }));
// The next career game, started as a player does: this week's first challenge on the main menu's road, then Tip off.
function tipOff() {
  Title.show('home');
  document.querySelector('#home-pop .challenge').click();
  document.querySelector('[data-focus="home-tip-off"]').click();
}
// Tests start games and play them right away: no 3-2-1 (countdown.test.js turns it back on).
window.addEventListener('load', () => { COUNTDOWN.seconds = 0; });
