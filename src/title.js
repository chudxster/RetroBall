// Main menu: the game always opens here, with the AI playing itself behind it (main.js runs a 'demo' game while
// it's up). One view shows at a time: home (the modes, plus Customize and Settings, which open the pause menu's
// tabs), Career (the season, the next game's challenges, buying upgrades, the standings), Quick game (the game
// options, then tip off), 2 Player (the formats) and Practice. Esc goes back to home; the arrow keys (or WASD) move
// between buttons, Enter or Space presses one.
const Title = (() => {
  const box = document.getElementById('title');
  const views = [...box.querySelectorAll('.title-view')];
  const careerBox = document.getElementById('career-panel');
  const pauseButton = document.getElementById('pause-btn');
  const stage = document.getElementById('stage');

  // Supplied by main.js: { rules, start(mode), startCareer(choice), openTab(panelId) }.
  let game = null;
  let view = 'home';
  let open = false;
  let upgradePick = 0;       // which career player the Career screen's upgrades show
  let confirmRestart = false;

  const current = () => views.find((v) => v.id === `title-${view}`);

  function init(target) {
    game = target;
    for (const b of box.querySelectorAll('[data-go]')) {
      b.addEventListener('click', () => {
        const go = b.dataset.go;
        if (go === 'customize' || go === 'settings') {
          hide();
          game.openTab(go === 'customize' ? 'player-view' : 'controls-view');
        } else {
          show(go);
        }
      });
    }
    for (const b of box.querySelectorAll('.title-back')) b.addEventListener('click', () => show('home'));
    for (const b of box.querySelectorAll('.title-start')) b.addEventListener('click', () => start(b.dataset.mode));
    for (const b of box.querySelectorAll('.duo-format')) {
      b.addEventListener('click', () => {
        Duo.setFormat(b.dataset.format);
        start('duo');
      });
    }

    document.getElementById('daily-start').addEventListener('click', () => start('daily'));
    for (const b of box.querySelectorAll('[data-difficulty]')) {
      b.addEventListener('click', () => {
        game.rules.difficulty = Number(b.dataset.difficulty);
        saveStored(RULES_STORAGE_KEY, game.rules);
        render();
      });
    }
    initToggle(document.getElementById('free-throws'), game.rules, 'freeThrows', RULES_STORAGE_KEY);
    initToggle(document.getElementById('shot-clock'), game.rules, 'shotClock', RULES_STORAGE_KEY);
    initNumber(document.getElementById('half-minutes'), game.rules, 'halfMinutes', RULES_STORAGE_KEY);
    initNumber(document.getElementById('shot-seconds'), game.rules, 'shotSeconds', RULES_STORAGE_KEY);

    const fullscreen = document.getElementById('fullscreen');
    fullscreen.hidden = !document.fullscreenEnabled;
    fullscreen.addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else stage.requestFullscreen();
    });

    initOnline();
    window.addEventListener('keydown', onKey);
  }

  // Esc: back to home. Arrows / WASD: to the nearest button that way. (Not while typing in a box.)
  const MOVES = {
    ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1],
    ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0],
  };
  function onKey(e) {
    if (!open || e.defaultPrevented) return;
    const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
    if (e.code === 'Escape') {
      e.preventDefault();
      if (view !== 'home') show('home');
      return;
    }
    const dir = MOVES[e.code];
    if (!dir || typing) return;
    e.preventDefault();
    moveFocus(dir);
  }

  // The button nearest the focused one in direction `dir` (off to the side counts double), or the first one.
  function moveFocus([dx, dy]) {
    const buttons = [...current().querySelectorAll('button')].filter((b) => !b.disabled && b.offsetParent);
    const from = buttons.includes(document.activeElement) ? document.activeElement : null;
    if (!from) {
      if (buttons.length) buttons[0].focus();
      return;
    }
    const center = (b) => {
      const r = b.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    };
    const a = center(from);
    let best = null;
    let bestScore = Infinity;
    for (const b of buttons) {
      if (b === from) continue;
      const c = center(b);
      const along = (c.x - a.x) * dx + (c.y - a.y) * dy;
      if (along <= 1) continue;
      const side = Math.abs((c.x - a.x) * dy) + Math.abs((c.y - a.y) * dx);
      const score = along + side * 2;
      if (score < bestScore) {
        bestScore = score;
        best = b;
      }
    }
    if (best) {
      best.focus();
      Sfx.play('tick');
    }
  }

  function show(next = 'home', { focus = true } = {}) {
    // Leaving the Online screen before the match starts closes the lobby (or the pending join).
    if (view === 'online' && next !== 'online' && Net.role() && !Net.playing()) Net.leave();
    view = next;
    open = true;
    box.hidden = false;
    pauseButton.hidden = true;
    confirmRestart = false;
    for (const v of views) v.hidden = v !== current();
    render();
    if (focus) {
      // The view's main button (Tip off, the first challenge), else its first one past Back.
      const first = current().querySelector('.btn.title-start, .challenge') || current().querySelector('button:not(.title-back):not(:disabled)');
      if (first) first.focus();
    }
  }

  function hide() {
    open = false;
    box.hidden = true;
    pauseButton.hidden = false;
  }

  function start(mode) {
    hide();
    game.start(mode);
  }

  function render() {
    if (view === 'home') {
      const c = Career.get();
      const next = Career.next();
      document.getElementById('title-career-desc').textContent = `Season ${c.season} - ${next ? next.label : 'season over'} - ${c.tokens} tokens`;
    } else if (view === 'quick') {
      const d = Daily.status();
      const played = d.played ? (d.played.done ? 'Goal met today.' : 'Played today, goal missed.') : 'Not played yet today.';
      document.getElementById('daily-text').textContent = `Today: vs ${d.opp.name}. Goal: ${d.goalText.toLowerCase()}. ${played} `
        + `Streak ${d.streak} (best ${d.best}). Same game for everyone, 1.5-minute halves, no upgrades.`;
      const picked = difficultyOf(game.rules);
      for (const b of box.querySelectorAll('[data-difficulty]')) b.setAttribute('aria-pressed', String(Number(b.dataset.difficulty) === picked));
    } else if (view === 'career') {
      renderCareer();
    } else if (view === 'duo') {
      for (const f of box.querySelectorAll('.duo-format')) f.setAttribute('aria-pressed', String(f.dataset.format === Duo.format()));
      const keys = (set) => ['shoot', 'action', 'pass'].map((n) => Input.keyLabel(n, set)).join(' ');
      document.getElementById('duo-keys').textContent = `P1: ${Input.moveLabel('p1')} + ${keys('p1')}. `
        + `P2: ${Input.moveLabel('p2')} + ${keys('p2')} (shoot, dunk/steal, pass/switch; change them in Settings). Esc pauses.`;
    } else if (view === 'online') {
      renderOnline();
    } else if (view === 'practice') {
      const best = Practice.best();
      document.getElementById('world-best').textContent = best === null ? 'Best: none yet' : `Best: ${Practice.format(best)}`;
    }
  }

  // Online (see Net): pick the format, then host (your code shows, and the game is listed in other players' lobby
  // finders until someone joins) or join by code or from the list. A guest's screen switches to the host's game
  // as soon as the host lets them in.
  function initOnline() {
    for (const b of box.querySelectorAll('[data-network]')) {
      b.addEventListener('click', () => {
        Net.setNetwork(b.dataset.network);
        render();
      });
    }
    for (const b of box.querySelectorAll('[data-online-format]')) {
      b.addEventListener('click', () => {
        Duo.setFormat(b.dataset.onlineFormat);
        render();
      });
    }
    const codeBox = document.getElementById('online-join-code');
    document.getElementById('online-host').addEventListener('click', () => {
      Net.host(Career.get().teamName);
      render();
    });
    const join = (c) => {
      if (c.length === 4) Net.join(c, Career.get().teamName);
      render();
    };
    document.getElementById('online-join').addEventListener('click', () => join(codeBox.value.trim().toUpperCase()));
    document.getElementById('online-start').addEventListener('click', () => Net.start());
    codeBox.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') join(codeBox.value.trim().toUpperCase());
    });
    Net.onChange = () => {
      if (Net.isGuest() && open) {
        hide();
        stage.querySelector('canvas').focus();
      }
      if (open && view === 'online') renderOnline();
    };
  }

  function renderOnline() {
    Net.listen();
    const format = Duo.format() === 'vs1' ? 'vs1' : 'vs3';
    if (Duo.format() !== format) Duo.setFormat(format);
    for (const b of box.querySelectorAll('[data-online-format]')) b.setAttribute('aria-pressed', String(b.dataset.onlineFormat === format));
    for (const b of box.querySelectorAll('[data-network]')) b.setAttribute('aria-pressed', String(b.dataset.network === Net.network()));
    const role = Net.role();
    // In a lobby: who's in, and Start for the host (the game runs on the host's computer).
    const lobby = Net.lobby();
    document.getElementById('online-lobby').hidden = !lobby;
    if (lobby) {
      const fmt = lobby.format === 'vs1' ? '1v1' : '3v3';
      document.getElementById('online-lobby-title').textContent = `Lobby ${lobby.code} - ${fmt}`;
      document.getElementById('online-lobby-text').textContent = `${lobby.host} (host) vs ${lobby.guest}. `
        + (lobby.isHost ? 'Start when you\'re ready: the game runs on this computer.' : `Waiting for ${lobby.host} to start...`);
      document.getElementById('online-start').hidden = !lobby.isHost;
    }
    document.getElementById('online-host').disabled = !!lobby;
    document.getElementById('online-join').disabled = !!lobby;
    document.getElementById('online-code').textContent = role === 'host' && !lobby ? `Your code: ${Net.code()} (waiting for a player)` : '';
    document.getElementById('online-status').textContent = [role === 'guest' && !lobby ? `Joining ${Net.code()}...` : '', Net.status()].filter(Boolean).join(' ');
    const list = document.getElementById('online-lobbies');
    const games = Net.lobbyList().filter((l) => l.code !== Net.code());
    list.replaceChildren(...(games.length ? games.map((l) => {
      const b = el('button', 'key-btn lobby', `${l.code}  ${l.name}  ${l.format === 'vs1' ? '1v1' : '3v3'}`);
      b.type = 'button';
      b.addEventListener('click', () => {
        Net.join(l.code, Career.get().teamName);
        render();
      });
      return b;
    }) : [el('span', 'upgrade-effect', 'None open right now')]));
  }

  // A button that keeps the keyboard focus when the Career screen is rebuilt around it (by `id`).
  function button(className, text, id, onClick) {
    const b = el('button', className, text);
    b.type = 'button';
    b.dataset.focus = id;
    b.addEventListener('click', onClick);
    return b;
  }

  // Career: season and tokens, the team's name, the next game with its three challenges (picking one tips off) or
  // the season's result, the last game, upgrades to buy, the standings, whether it's saving, and New career.
  function renderCareer() {
    const c = Career.get();
    const next = Career.next();
    const items = [];
    const focused = document.activeElement && careerBox.contains(document.activeElement) ? document.activeElement.dataset.focus : null;

    const head = el('div', 'career-head');
    head.append(el('span', '', `Season ${c.season} - ${next ? next.label : 'SEASON OVER'}`), el('span', 'career-tokens', `${c.tokens} tokens`));
    items.push(head);

    const nameRow = el('div', 'row');
    const nameLabel = el('label', '', 'Team name');
    const nameInput = el('input', 'name');
    Object.assign(nameInput, { id: 'career-team-name', maxLength: Career.TEAM_NAME_MAX, spellcheck: false, autocomplete: 'off', value: c.teamName });
    nameLabel.htmlFor = nameInput.id;
    nameInput.addEventListener('input', () => Career.setTeamName(nameInput.value));
    nameInput.addEventListener('change', () => {
      if (!nameInput.value.trim()) Career.setTeamName('Home');
      nameInput.value = Career.get().teamName;
    });
    nameRow.append(nameLabel, nameInput, el('span', 'upgrade-effect', `Titles: ${c.titles}`));
    items.push(nameRow);

    if (next) {
      const opp = Career.teamOf(next.opp);
      items.push(el('p', 'test-note', `Next: vs ${opp.name} (${Career.record(next.opp)})`));
      items.push(el('p', 'mode-desc', 'Pick a challenge to tip off. Complete it to multiply that game\'s tokens:'));
      Career.offer(game.rules).forEach((ch, i) => {
        const tier = CAREER.tiers[ch.tier];
        const b = button(`mode-option challenge tier-${ch.tier}`, '', `challenge-${i}`, () => {
          hide();
          game.startCareer(i);
        });
        b.append(el('span', 'mode-name', `${tier.name} x${tier.mult}`), el('span', 'mode-desc', Career.challengeText(ch)));
        items.push(b);
      });
    } else {
      const results = {
        champion: 'Champions!',
        final: 'Lost in the final',
        semis: 'Lost in the semifinal',
        missed: 'Missed the playoffs',
      };
      const champ = c.playoff && c.playoff.champion !== null ? Career.teamOf(c.playoff.champion).name : '';
      items.push(el('p', 'test-note', `Season ${c.season}: ${results[c.result]}${c.result !== 'champion' && champ ? ` (${champ} won it all)` : ''}`));
      items.push(button('btn', `Start season ${c.season + 1}`, 'next-season', () => {
        Career.nextSeason();
        renderCareer();
      }));
    }

    if (c.last) {
      const l = c.last;
      const vs = Career.teamOf(l.opp).abbr;
      items.push(el('p', 'mode-desc', `Last game: ${l.won ? 'W' : 'L'} ${l.us}-${l.them} vs ${vs}, +${l.tokens} tokens${l.forfeit ? ' (forfeit)' : l.challenge ? ` (challenge ${l.done ? 'done' : 'missed'})` : ''}`));
    }

    items.push(...upgradeSection(c));

    // Standings: best record first; during the playoffs the seeds are marked.
    items.push(el('p', 'test-note', 'Standings'));
    const table = el('div', 'standings');
    for (const text of ['#', 'Team', 'W-L', '+/-']) table.append(el('span', 'standings-head', text));
    Career.standings().forEach((i, rank) => {
      const t = c.league[i];
      const seeded = c.playoff && c.playoff.seeds.includes(i);
      const cls = i === 0 ? 'standings-you' : '';
      const diff = t.pf - t.pa;
      table.append(
        el('span', cls, `${rank + 1}${seeded ? '*' : ''}`),
        el('span', cls, Career.teamOf(i).name),
        el('span', cls, Career.record(i)),
        el('span', cls, `${diff > 0 ? '+' : ''}${diff}`),
      );
    });
    items.push(table);

    // Progress saves itself after every game and purchase; some browsers (private windows) can't.
    items.push(canStore()
      ? el('p', 'save-ok', 'Progress saves automatically after every game and upgrade.')
      : el('p', 'save-warn', 'This browser isn\'t saving (private window or blocked storage): progress is lost when you leave.'));

    items.push(button('btn btn-quiet', confirmRestart ? 'Sure? Click again to start over' : 'New career', 'restart', () => {
      if (confirmRestart) Career.restart();
      confirmRestart = !confirmRestart;
      renderCareer();
    }));

    careerBox.replaceChildren(...items);
    const refocus = focused && careerBox.querySelector(`[data-focus="${focused}"]`);
    if (refocus) refocus.focus();
  }

  // Career upgrades: pick a player (and rename them), then buy their next level of each stat with tokens. Bought
  // levels stay for good.
  function upgradeSection(c) {
    const items = [el('p', 'test-note', `Upgrades (a level costs ${CAREER.levelCost} x its number)`)];
    const picks = el('div', 'row career-picks');
    c.team.forEach((p, i) => {
      const b = button('key-btn', p.name, `pick-${i}`, () => {
        upgradePick = i;
        renderCareer();
      });
      b.setAttribute('aria-pressed', String(i === upgradePick));
      picks.append(b);
    });
    items.push(picks);

    const player = c.team[upgradePick];
    const nameRow = el('div', 'row');
    const nameLabel = el('label', '', 'Name');
    const nameInput = el('input', 'name');
    Object.assign(nameInput, { id: 'career-player-name', maxLength: NAME_MAX, spellcheck: false, autocomplete: 'off', value: player.name });
    nameLabel.htmlFor = nameInput.id;
    nameInput.addEventListener('input', () => {
      nameInput.value = cleanName(nameInput.value);
      player.name = nameInput.value.trim() || defaultName(upgradePick);
      Career.save();
    });
    nameInput.addEventListener('change', () => renderCareer());
    nameRow.append(nameLabel, nameInput);
    items.push(nameRow);

    for (const key of UPGRADE_KEYS) {
      const n = player.upgrades[key];
      const price = n < UPGRADES.max ? Career.cost(n) : 0;
      const buy = button('btn btn-quiet career-buy', price ? `+ ${price}` : 'Max', `buy-${key}`, () => {
        Career.buy(upgradePick, key);
        renderCareer();
      });
      buy.disabled = !price || c.tokens < price;
      buy.setAttribute('aria-label', price ? `Buy ${key} level ${n + 1} for ${price} tokens` : `${key} is maxed`);
      const row = el('div', 'row upgrade');
      const levels = el('span', 'pips');
      levels.append(...pips(n));
      row.append(el('span', 'label', key), levels, buy, el('span', 'upgrade-effect', n ? UPGRADE_EFFECTS[key](n) : ''));
      items.push(row);
    }
    return items;
  }

  return {
    init,
    show,
    hide,
    isOpen: () => open,
  };
})();
