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
