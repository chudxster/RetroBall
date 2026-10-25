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
  Title.show('career');
  document.querySelector('#career-panel .challenge').click();
  Menu.openTab('ui-view');
  ok(showing() === 'controls-view ui-view' && document.getElementById('rail-head').textContent === 'Paused', 'paused in a career game: Settings only');
});
// The main menu's bundles: Casual holds Quick game and Practice, 2 Player holds Local and Online; Back (or Esc)
// goes back to the bundle, then home.
test(() => {
  const at = () => [...document.querySelectorAll('.title-view')].find((v) => !v.hidden).id;
  document.querySelector('.dock-row[data-go="casual"]').click();
  ok(at() === 'title-casual' && document.querySelectorAll('#title-casual .mode-option').length === 2, 'Casual: Quick game, Practice');
  document.querySelector('#title-casual [data-go="quick"]').click();
  ok(at() === 'title-quick', 'Quick game opens its options');
  document.querySelector('#title-quick .title-back').click();
  ok(at() === 'title-casual', 'Back goes to Casual');
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', bubbles: true }));
  ok(at() === 'title-home', 'Esc goes home');
  document.querySelector('.dock-row[data-go="versus"]').click();
  document.querySelector('#title-versus [data-go="online"]').click();
  ok(at() === 'title-online', '2 Player > Online');
  document.querySelector('#title-online .title-back').click();
  ok(at() === 'title-versus', 'Back to 2 Player');
});
