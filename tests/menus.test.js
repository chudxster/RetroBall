// The pause menu's two groups: the main menu's Customize and Settings open just their own tabs; paused in a game it's
// Settings, plus Customize in a Quick game only.
test(() => {
  const showing = () => [...document.querySelectorAll('#menu .tab')].filter((t) => !t.hidden).map((t) => t.dataset.panel).join(' ');
  document.querySelector('[data-go="customize"]').click();
  ok(showing() === 'player-view upgrade-view gear-view' && document.getElementById('rail-head').textContent === 'Customize', 'Customize: Player, Upgrades, Gear');
  document.getElementById('resume').click();
  document.querySelector('[data-go="settings"]').click();
  ok(showing() === 'controls-view ui-view' && !document.getElementById('controls-view').hidden, 'Settings: Controls, UI');
  document.getElementById('resume').click();
  Title.hide();
  startMode('3v3');
  Menu.openTab('ui-view');
  ok(showing() === 'player-view upgrade-view gear-view controls-view ui-view', 'paused in a Quick game: both');
  document.getElementById('resume').click();
  tipOff();
  Menu.openTab('ui-view');
  ok(showing() === 'controls-view ui-view' && document.getElementById('rail-head').textContent === 'Paused', 'paused in a career game: Settings only');
});
// The main menu's drawers (the Dock Drawer design): Casual (a 3v3 game with its options, the daily game, practice)
// and 2 Player (Local and Online tabs) slide out beside the dock, which stays on screen; Close or Esc goes home.
test(() => {
  const showing = () => [...document.querySelectorAll('.title-view')].filter((v) => !v.hidden).map((v) => v.id).join(' ');
  document.querySelector('.dock-row[data-go="casual"]').click();
  ok(showing() === 'title-home title-casual' && document.getElementById('title').classList.contains('drawer-open'), 'Casual opens a drawer beside the dock');
  ok(document.querySelectorAll('#title-casual .title-start').length === 3 && document.activeElement === document.querySelector('#title-casual .title-start'), '3v3 game, Free shot, Around the world (3v3 focused)');
  const dock = document.querySelector('.home-dock').getBoundingClientRect();
  const drawer = document.querySelector('.title-panel').getBoundingClientRect();
  ok(drawer.left - dock.right > 5, 'a gap between the dock and the drawer');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  ok(showing() === 'title-home', 'Esc closes it');
  document.querySelector('.dock-row[data-go="versus"]').click();
  ok(!document.getElementById('versus-local').hidden && document.getElementById('versus-online').hidden, '2 Player: the Local tab');
  document.querySelector('[data-versus-tab="online"]').click();
  ok(document.getElementById('versus-local').hidden && !document.getElementById('versus-online').hidden, 'the Online tab');
  Title.show('duo');
  ok(showing() === 'title-home title-versus' && !document.getElementById('versus-local').hidden, 'the old screens open the drawers');
  document.querySelector('#title-versus .title-back').click();
  ok(showing() === 'title-home', 'Close goes home');
});
// The Upgrades screen: no challenges (they're on the main menu's road), and the picked player's face under the picker.
test(() => {
  Title.show('career');
  const panel = document.getElementById('career-panel');
  ok(!panel.querySelector('.challenge'), 'no challenges');
  ok(panel.querySelector('.career-picks + .career-player .career-face + .career-stats .upgrade'), 'the face and upgrades right under the player picker');
  panel.querySelector('[data-focus="pick-1"]').click();
  ok(panel.querySelector('[data-focus="pick-1"]').getAttribute('aria-pressed') === 'true' && panel.querySelector('.career-face'), 'picking another player redraws it');
});
