const LOOK_STORAGE_KEY = 'retroball.look';
const LOOK_COLOR_KEYS = ['skin', 'hair', 'jersey', 'shorts', 'shoe', 'laces'];
const RANDOM_HAIR = ['#1a1c2c', '#3b2a20', '#7a4a32', '#5d275d', '#b13e53', '#ffcd75', '#94b0c2', '#f4f4f4'];
const HEX_RE = /^#[0-9a-f]{6}$/i;

// Saved look merged over the defaults; anything missing or malformed falls back to DEFAULT_LOOK.
function loadLook() {
  const saved = loadStored(LOOK_STORAGE_KEY) || {};
  const look = { ...DEFAULT_LOOK };
  for (const key of LOOK_COLOR_KEYS) {
    if (HEX_RE.test(saved[key])) look[key] = saved[key].toLowerCase();
  }
  // Looks saved before shorts had their own color keep shorts matching the jersey.
  if (!HEX_RE.test(saved.shorts)) look.shorts = look.jersey;
  if (HAIR_STYLE_NAMES.includes(saved.hairStyle)) look.hairStyle = saved.hairStyle;
  if (/^\d{1,2}$/.test(saved.number)) look.number = saved.number;
  return look;
}

const TEAM_STORAGE_KEY = 'retroball.team';
const OLD_UPGRADE_STORAGE_KEY = 'retroball.upgrades'; // the user's player's levels, from before each player had their own
const UPGRADE_KEYS = ['speed', 'shooting', 'dunking', 'defense', 'dash'];
const NAME_MAX = 12;
const MODE_STORAGE_KEY = 'retroball.mode';
const MODES = ['3v3', 'free', 'world'];
const RULES_STORAGE_KEY = 'retroball.rules';
const DEFAULT_RULES = { freeThrows: true, halfMinutes: GAME.halfMinutes, shotClock: true, shotSeconds: GAME.shotClock };
const UI_STORAGE_KEY = 'retroball.ui';
const DEFAULT_UI = { stats: true };

// Settings saved as one object of on/off switches and numbers: anything saved that isn't the same kind as its
// default (or isn't a finite number) falls back to `defaults`.
function loadPrefs(key, defaults) {
  const saved = loadStored(key) || {};
  const prefs = { ...defaults };
  for (const k of Object.keys(defaults)) {
    const v = saved[k];
    if (typeof v === typeof defaults[k] && (typeof v !== 'number' || Number.isFinite(v))) prefs[k] = v;
  }
  return prefs;
}

// Upgrade levels, each a whole number from 0 to UPGRADES.max (anything else counts as 0).
function cleanLevels(saved) {
  const levels = {};
  for (const key of UPGRADE_KEYS) {
    const v = saved && saved[key];
    levels[key] = Number.isInteger(v) && v >= 0 && v <= UPGRADES.max ? v : 0;
  }
  return levels;
}

function cleanName(name) {
  return String(name).replace(/\s+/g, ' ').trimStart().slice(0, NAME_MAX);
}

function defaultName(i) {
  return `Player ${i + 1}`;
}

// A player's own look (the team kit is shared, see LOOK_KIT_KEYS): anything missing or malformed comes from
// `fallback`.
function cleanPersonalLook(saved, fallback) {
  const s = saved || {};
  return {
    skin: HEX_RE.test(s.skin) ? s.skin.toLowerCase() : fallback.skin,
    hair: HEX_RE.test(s.hair) ? s.hair.toLowerCase() : fallback.hair,
    hairStyle: HAIR_STYLE_NAMES.includes(s.hairStyle) ? s.hairStyle : fallback.hairStyle,
    number: /^\d{1,2}$/.test(s.number) ? s.number : fallback.number,
  };
}

// The user's team: a name, upgrade levels and (for players 2 and 3) their own look, by role. Player 1's look is
// the saved look itself (loadLook). Levels saved before players had their own carry over to player 1.
function loadTeam() {
  let saved = loadStored(TEAM_STORAGE_KEY);
  if (!Array.isArray(saved)) saved = [{ upgrades: loadStored(OLD_UPGRADE_STORAGE_KEY) }];
  return ROSTER[0].map((_, i) => {
    const s = saved[i] || {};
    const name = typeof s.name === 'string' ? cleanName(s.name).trim() : '';
    const look = i === 0 ? null : cleanPersonalLook(s.look, ROSTER[0][i]);
    return { name: name || defaultName(i), upgrades: cleanLevels(s.upgrades), look };
  });
}

function loadMode() {
  try {
    const saved = localStorage.getItem(MODE_STORAGE_KEY);
    if (MODES.includes(saved)) return saved;
  } catch (e) {
    // Storage blocked: use the default.
  }
  return '3v3';
}

function saveMode(mode) {
  try {
    localStorage.setItem(MODE_STORAGE_KEY, mode);
  } catch (e) {
    // Not fatal; the mode just won't persist.
  }
}

const Menu = (() => {
  const button = document.getElementById('pause-btn');
  const panel = document.getElementById('menu');
  const previewCanvas = document.getElementById('preview');
  const pctx = previewCanvas.getContext('2d');
  const numberInput = document.getElementById('number');
  const hairStyleName = document.getElementById('hair-style-name');
  const presetRow = document.getElementById('skin-presets');

  // The preview spins through all eight directions like a turntable so every side of the look is visible.
  const PREVIEW_POSES = [
    { facing: 1, view: 'side' },
    { facing: 1, view: 'frontQ' },
    { facing: 1, view: 'front' },
    { facing: -1, view: 'frontQ' },
    { facing: -1, view: 'side' },
    { facing: -1, view: 'backQ' },
    { facing: -1, view: 'back' },
    { facing: 1, view: 'backQ' },
  ];
  const POSE_SECONDS = 0.8;

  // What the menu edits, supplied by main.js: { look, setLook(look), team, upgradesChanged(), rules, ui, mode(),
  // setMode(mode), startCareerGame(choice) }, where team is the user's team as loadTeam() returns it, rules is
  // DEFAULT_RULES' shape and ui is { stats }.
  let game = null;
  let syncUpgradeView = () => {};
  let syncModeView = () => {};
  let showTab = () => {};
  let openCareerPanel = () => {};
  let preview = null;
  let look = null;  // player 1's look, which also carries the team kit
  let pick = 0;     // which home player (by role) the Player and Upgrades tabs show
  let open = false;
  let previewTime = 0;
  let lastFrame = 0;

  // In a career game the Upgrades tab shows the career team (names and bought levels); otherwise the free one.
  const inCareer = () => game.mode() === 'career';
  const activeTeam = () => (inCareer() ? Career.team() : game.team);

  // The look of player `i`: player 1's own, or a teammate's skin, hair and number in the team kit.
  function lookOf(i) {
    return i === 0 ? look : { ...look, ...game.team[i].look };
  }

  function init(target) {
    game = target;
    look = { ...target.look };
    preview = new Player({ x: 0, y: 0, look });

    for (const skin of SKINS) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'swatch';
      swatch.style.background = skin;
      swatch.dataset.skin = skin;
      swatch.setAttribute('aria-label', `Recommended skin tone ${skin}`);
      swatch.addEventListener('click', () => applyLook({ ...lookOf(pick), skin }));
      presetRow.appendChild(swatch);
    }

    for (const key of LOOK_COLOR_KEYS) {
      const picker = document.getElementById(key);
      const hex = panel.querySelector(`.hex[data-key="${key}"]`);
      picker.addEventListener('input', () => applyLook({ ...lookOf(pick), [key]: picker.value }));
      hex.addEventListener('change', () => {
        const value = `#${hex.value.trim().replace(/^#/, '')}`.toLowerCase();
        if (HEX_RE.test(value)) applyLook({ ...lookOf(pick), [key]: value });
        else syncControls();
      });
    }

    numberInput.addEventListener('input', () => {
      const digits = numberInput.value.replace(/\D/g, '').slice(0, 2);
      numberInput.value = digits;
      if (digits) applyLook({ ...lookOf(pick), number: digits });
    });
    numberInput.addEventListener('change', syncControls);

    for (const step of panel.querySelectorAll('.step[data-step]')) {
      step.addEventListener('click', () => {
        const n = HAIR_STYLE_NAMES.length;
        const i = HAIR_STYLE_NAMES.indexOf(lookOf(pick).hairStyle);
        applyLook({ ...lookOf(pick), hairStyle: HAIR_STYLE_NAMES[(i + Number(step.dataset.step) + n) % n] });
      });
    }
    document.getElementById('randomize-look').addEventListener('click', () => applyLook(randomLook()));

    initFaces();
    initTabs();
    initUpgradeView();
    initModeView();
    initControlsView();
    initToggle(document.getElementById('show-stats'), game.ui, 'stats', UI_STORAGE_KEY);
    initTuningView();
    initTestView();

    button.addEventListener('click', () => setOpen(!open));
    document.getElementById('resume').addEventListener('click', () => setOpen(false));
    // Player 1 goes back to the default look (kit included); a teammate to their roster skin, hair and number.
    document.getElementById('reset-look').addEventListener('click', () => {
      applyLook(pick === 0 ? { ...DEFAULT_LOOK } : { ...look, ...ROSTER[0][pick] });
    });
    document.getElementById('game').addEventListener('pointerdown', () => setOpen(false));
    window.addEventListener('keydown', (e) => {
      const typing = e.target instanceof HTMLInputElement;
      if (e.code === 'Escape' || (Input.isBound('pause', e.code) && !typing)) {
        e.preventDefault();
        setOpen(!open);
      }
    });

    syncControls();
  }

  // Faces of the user's team beside the Player-tab preview and atop the Upgrades tab: clicking one picks who both
  // tabs show.
  const FACE_W = 24;
  const FACE_H = 26;

  function initFaces() {
    for (const holder of panel.querySelectorAll('.faces')) {
      game.team.forEach((_, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'face';
        btn.dataset.face = i;
        const canvas = document.createElement('canvas');
        canvas.width = FACE_W;
        canvas.height = FACE_H;
        btn.append(canvas);
        btn.addEventListener('click', () => setPick(i));
        holder.append(btn);
      });
    }
    drawFaces();
  }

  // Each face is the player's sprite from the front, framed on the head and shoulders.
  function drawFaces() {
    for (const btn of panel.querySelectorAll('.face')) {
      const i = Number(btn.dataset.face);
      const p = new Player({ x: 0, y: 0, look: lookOf(i) });
      Object.assign(p, { hasBall: false, view: 'front', facing: 1, sx: FACE_W / 2, by: 76, scale: 1 });
      const fctx = btn.firstChild.getContext('2d');
      fctx.fillStyle = '#262b44';
      fctx.fillRect(0, 0, FACE_W, FACE_H);
      p.draw(fctx);
      btn.setAttribute('aria-pressed', String(i === pick));
      btn.setAttribute('aria-label', `Pick ${activeTeam()[i].name}`);
      btn.title = activeTeam()[i].name;
    }
  }

  function setPick(i) {
    pick = i;
    preview.setLook(lookOf(pick));
    syncControls();
    syncUpgradeView();
    drawFaces();
  }

  // A random skin tone (one of the recommended), hair style, hair color and number; the team kit stays.
  function randomLook() {
    const any = (list) => list[Math.floor(Math.random() * list.length)];
    return {
      ...lookOf(pick),
      skin: any(SKINS),
      hairStyle: any(HAIR_STYLE_NAMES),
      hair: any(RANDOM_HAIR),
      number: String(Math.floor(Math.random() * 100)),
    };
  }

  // Tabs: each shows its panel, plus the footer buttons tagged for it (data-for).
  function initTabs() {
    const tabs = [...panel.querySelectorAll('.tab')];
    const footButtons = [...panel.querySelectorAll('.menu-foot [data-for]')];
    const show = (tab) => {
      for (const t of tabs) {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        document.getElementById(t.dataset.panel).hidden = !on;
      }
      for (const b of footButtons) b.hidden = b.dataset.for !== tab.dataset.panel;
    };
    for (const t of tabs) t.addEventListener('click', () => show(t));
    show(tabs[0]);
    showTab = (id) => show(tabs.find((t) => t.dataset.panel === id));
  }

  // Upgrades: the picked player (faces at the top, name editable in place) with +/- per stat, shown as pips with
  // what the current level does. In a career game it's the career team, whose levels are bought with tokens (and
  // can't be sold back); otherwise the free testing levels.
  function initUpgradeView() {
    const rows = [...panel.querySelectorAll('.upgrade')];
    const nameInput = document.getElementById('player-name');
    const numberTag = document.getElementById('player-num');
    const note = document.getElementById('upgrade-note');
    const resetButton = document.getElementById('reset-upgrades');
    const picked = () => activeTeam()[pick];
    const effects = {
      speed: (n) => `+${Math.round(UPGRADES.speed * n * 100)}% speed`,
      shooting: (n) => n >= UPGRADES.max
        ? `+${Math.round(UPGRADES.threeGreen * n * 100)}% 3s, ${SHOT.deepFramesMax}f half court`
        : `+${Math.round(UPGRADES.threeGreen * n * 100)}% green on 3s`,
      dunking: (n) => `+${Math.round(UPGRADES.dunkRange * n * 100)}% range, rim odds up`,
      defense: (n) => `+${Math.round(UPGRADES.stealRange * n * 100)}% steal reach, block`,
      dash: (n) => `+${Math.round(UPGRADES.dashDistance * n * 100)}% dash distance`,
    };
    const saveTeam = () => {
      if (inCareer()) Career.save();
      else saveStored(TEAM_STORAGE_KEY, game.team);
    };
    const changed = () => {
      saveTeam();
      game.upgradesChanged();
      sync();
    };
    const sync = () => {
      const career = inCareer();
      const tokens = Career.get().tokens;
      note.textContent = career
        ? `Career: ${tokens} tokens. A level costs ${CAREER.levelCost} x its number; bought levels stay.`
        : 'Free while testing. Each AI opponent gets as many levels as your player in the same spot, at random.';
      resetButton.disabled = career;
      if (document.activeElement !== nameInput) nameInput.value = picked().name;
      numberTag.textContent = `#${lookOf(pick).number}`;
      for (const row of rows) {
        const key = row.dataset.upgrade;
        const n = picked().upgrades[key];
        const pips = row.querySelector('.pips');
        pips.replaceChildren(...Array.from({ length: UPGRADES.max }, (_, i) => {
          const pip = document.createElement('span');
          pip.className = i < n ? 'pip on' : 'pip';
          return pip;
        }));
        const price = career && n < UPGRADES.max ? Career.cost(n) : 0;
        const effect = n ? effects[key](n) : '';
        row.querySelector('.upgrade-effect').textContent = price ? `${effect}${effect ? ' - ' : ''}next ${price} tokens` : effect;
        row.querySelector('[data-delta="-1"]').disabled = career || n <= 0;
        row.querySelector('[data-delta="1"]').disabled = n >= UPGRADES.max || (career && tokens < price);
      }
    };
    for (const row of rows) {
      for (const step of row.querySelectorAll('.step')) {
        step.addEventListener('click', () => {
          const key = row.dataset.upgrade;
          if (inCareer()) {
            if (Number(step.dataset.delta) > 0) Career.buy(pick, key);
            sync();
            return;
          }
          const levels = picked().upgrades;
          levels[key] = clamp(levels[key] + Number(step.dataset.delta), 0, UPGRADES.max);
          changed();
        });
      }
    }
    nameInput.addEventListener('input', () => {
      nameInput.value = cleanName(nameInput.value);
      picked().name = nameInput.value.trim() || defaultName(pick);
      saveTeam();
      drawFaces(); // their face's tooltip shows the name
    });
    nameInput.addEventListener('change', sync);
    syncUpgradeView = () => {
      nameInput.blur();
      sync();
    };
    // Reset clears the picked player's levels; their name stays.
    document.getElementById('reset-upgrades').addEventListener('click', () => {
      for (const key of UPGRADE_KEYS) picked().upgrades[key] = 0;
      changed();
    });
    sync();
  }

  // An ON/OFF button for `prefs[key]`, saved under `storageKey` whenever it flips.
  function initToggle(button, prefs, key, storageKey) {
    const sync = () => {
      button.textContent = prefs[key] ? 'ON' : 'OFF';
      button.setAttribute('aria-pressed', String(prefs[key]));
    };
    button.addEventListener('click', () => {
      prefs[key] = !prefs[key];
      saveStored(storageKey, prefs);
      sync();
    });
    sync();
  }

  // A number box for `prefs[key]`, kept within the box's min/max and step and saved under `storageKey`.
  function initNumber(input, prefs, key, storageKey) {
    const sync = () => {
      input.value = String(prefs[key]);
    };
    input.addEventListener('change', () => {
      const step = Number(input.step) || 1;
      const v = Number(input.value);
      if (Number.isFinite(v)) {
        prefs[key] = clamp(Math.round(v / step) * step, Number(input.min), Number(input.max));
        saveStored(storageKey, prefs);
      }
      sync();
    });
    sync();
  }

  // Gamemode: picking a different mode starts a new game in it. Rule toggles below apply right away.
  function initModeView() {
    const options = [...panel.querySelectorAll('.mode-option')];
    initToggle(document.getElementById('free-throws'), game.rules, 'freeThrows', RULES_STORAGE_KEY);
    initToggle(document.getElementById('shot-clock'), game.rules, 'shotClock', RULES_STORAGE_KEY);
    initNumber(document.getElementById('half-minutes'), game.rules, 'halfMinutes', RULES_STORAGE_KEY);
    initNumber(document.getElementById('shot-seconds'), game.rules, 'shotSeconds', RULES_STORAGE_KEY);
    document.getElementById('restart-game').addEventListener('click', () => {
      game.setMode('3v3');
      saveMode('3v3');
      sync();
      setOpen(false);
    });
    // The arrow beside a mode opens its game options underneath.
    for (const arrow of panel.querySelectorAll('.mode-expand')) {
      const settings = document.getElementById(arrow.getAttribute('aria-controls'));
      arrow.addEventListener('click', () => {
        settings.hidden = !settings.hidden;
        arrow.setAttribute('aria-expanded', String(!settings.hidden));
      });
    }
    const worldBest = document.getElementById('world-best');
    const careerPanel = document.getElementById('career-panel');
    const careerArrow = panel.querySelector('.mode-expand[aria-controls="career-panel"]');
    const sync = () => {
      for (const o of options) o.setAttribute('aria-pressed', String(o.dataset.mode === game.mode()));
      const best = Practice.best();
      worldBest.textContent = best === null ? 'Best: none yet' : `Best: ${Practice.format(best)}`;
      if (!careerPanel.hidden) renderCareer(careerPanel);
    };
    openCareerPanel = () => {
      careerPanel.hidden = false;
      careerArrow.setAttribute('aria-expanded', 'true');
      sync();
    };
    careerArrow.addEventListener('click', sync); // (the shared arrow handler above shows or hides it)
    // Picking the mode already being played does nothing, except Around the World, which starts over. Career opens
    // its panel instead: a career game starts from a challenge picked there.
    for (const o of options) {
      o.addEventListener('click', () => {
        if (o.dataset.mode === 'career') {
          openCareerPanel();
          return;
        }
        if (o.dataset.mode === game.mode() && o.dataset.mode !== 'world') return;
        game.setMode(o.dataset.mode);
        saveMode(o.dataset.mode);
        sync();
      });
    }
    syncModeView = sync; // the best time may have changed since the menu was last open
    sync();
  }

  // A new element with a class and text (text, never HTML: team names come from the user).
  function el(tag, className, text = '') {
    const e = document.createElement(tag);
    if (className) e.className = className;
    e.textContent = text;
    return e;
  }

  // Career panel: season and tokens, the team's name, the next game with its three challenges (picking one starts
  // it) or the season's result, the last game and the standings.
  let confirmRestart = false;
  function renderCareer(box) {
    const c = Career.get();
    const next = Career.next();
    const items = [];

    const head = el('div', 'career-head');
    const week = next ? next.label : 'SEASON OVER';
    head.append(el('span', '', `Season ${c.season} - ${week}`), el('span', 'career-tokens', `${c.tokens} tokens`));
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
      const playing = game.mode() === 'career';
      items.push(el('p', 'mode-desc', playing
        ? 'Pick a challenge to tip off (this restarts the game in progress):'
        : 'Pick a challenge to tip off. Complete it to multiply that game\'s tokens:'));
      Career.offer(game.rules).forEach((ch, i) => {
        const tier = CAREER.tiers[ch.tier];
        const btn = el('button', `mode-option challenge tier-${ch.tier}`);
        btn.type = 'button';
        btn.append(el('span', 'mode-name', `${tier.name} x${tier.mult}`), el('span', 'mode-desc', Career.challengeText(ch)));
        btn.addEventListener('click', () => {
          game.startCareerGame(i);
          syncModeView();
          setOpen(false);
        });
        items.push(btn);
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
      const nextSeason = el('button', 'btn', `Start season ${c.season + 1}`);
      nextSeason.type = 'button';
      nextSeason.addEventListener('click', () => {
        Career.nextSeason();
        renderCareer(box);
      });
      items.push(nextSeason);
    }

    if (c.last) {
      const l = c.last;
      const vs = Career.teamOf(l.opp).abbr;
      items.push(el('p', 'mode-desc', `Last game: ${l.won ? 'W' : 'L'} ${l.us}-${l.them} vs ${vs}, +${l.tokens} tokens${l.challenge ? ` (challenge ${l.done ? 'done' : 'missed'})` : ''}`));
    }

    // Standings: best record first; during the playoffs the seeds are marked.
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

    const restart = el('button', 'btn btn-quiet', confirmRestart ? 'Sure? Click again to start over' : 'New career');
    restart.type = 'button';
    restart.addEventListener('click', () => {
      if (confirmRestart) Career.restart();
      confirmRestart = !confirmRestart;
      renderCareer(box);
    });
    items.push(restart);

    box.replaceChildren(...items);
  }

  // Controls: the double-tap dash window and a key button per action. Clicking a button waits for the next key
  // (Esc cancels); a key already used elsewhere swaps over. Saved by Input.
  const KEYBIND_NAMES = {
    up: 'Up', down: 'Down', left: 'Left', right: 'Right',
    shoot: 'Shoot/block', action: 'Dunk/steal', pass: 'Pass/switch', pause: 'Pause',
  };

  function initControlsView() {
    const slider = document.getElementById('double-tap');
    const value = document.getElementById('double-tap-value');
    const list = document.getElementById('keybinds');
    const buttons = {};
    let listening = null;
    let swallowUp = null;

    const sync = () => {
      slider.value = Math.round(Input.settings.doubleTap * 1000);
      value.textContent = `${slider.value}ms`;
      for (const [name, btn] of Object.entries(buttons)) {
        btn.textContent = listening === name ? '...' : Input.keyLabel(name);
        btn.setAttribute('aria-pressed', String(listening === name));
      }
    };

    for (const [name, text] of Object.entries(KEYBIND_NAMES)) {
      const row = document.createElement('div');
      row.className = 'keybind';
      const label = document.createElement('span');
      label.className = 'keybind-label';
      label.textContent = text;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'key-btn';
      btn.setAttribute('aria-label', `Key for ${text}`);
      btn.addEventListener('click', () => {
        listening = listening === name ? null : name;
        sync();
      });
      row.append(label, btn);
      list.append(row);
      buttons[name] = btn;
    }

    // While waiting for a key, grab it before the game or the pause shortcut sees it (and swallow its key-up so
    // Space doesn't also click the focused button).
    window.addEventListener('keydown', (e) => {
      if (!listening) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code !== 'Escape') Input.setBind(listening, e.code);
      swallowUp = e.code;
      listening = null;
      sync();
    }, true);
    window.addEventListener('keyup', (e) => {
      if (e.code !== swallowUp) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      swallowUp = null;
    }, true);

    slider.addEventListener('input', () => {
      Input.settings.doubleTap = Number(slider.value) / 1000;
      Input.save();
      sync();
    });
    document.getElementById('reset-controls').addEventListener('click', () => {
      Input.reset();
      listening = null;
      sync();
    });
    sync();
  }

  // Player tuning (bottom of the Gamemode tab): a number box per TUNING entry with its tip and default. A changed
  // value is highlighted and gets a button back to its default; "Reset all" restores every one.
  function initTuningView() {
    const list = document.getElementById('tuning-list');
    const fmt = (v) => String(Number(v.toFixed(4)));
    const syncs = TUNING.map((entry) => {
      const item = document.createElement('div');
      item.className = 'tuning-item';
      const top = document.createElement('div');
      top.className = 'tuning-top';
      const input = document.createElement('input');
      Object.assign(input, { type: 'number', min: entry.min, max: entry.max, step: entry.step, className: 'num tuning-num' });
      input.id = `tune-${entry.path.replace(/\./g, '-')}`;
      const label = document.createElement('label');
      label.className = 'tuning-label';
      label.htmlFor = input.id;
      label.textContent = entry.label;
      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'step tuning-reset';
      reset.textContent = '↺';
      reset.title = 'Back to default';
      reset.setAttribute('aria-label', `Reset ${entry.label} to default`);
      const tip = document.createElement('span');
      tip.className = 'tuning-tip';
      tip.textContent = `${entry.tip} (default ${fmt(Tuning.defaultOf(entry))})`;
      top.append(label, input, reset);
      item.append(top, tip);
      list.append(item);

      const sync = () => {
        const v = Tuning.get(entry.path);
        input.value = fmt(v);
        item.classList.toggle('changed', v !== Tuning.defaultOf(entry));
      };
      input.addEventListener('change', () => {
        Tuning.change(entry, input.value);
        sync();
      });
      reset.addEventListener('click', () => {
        Tuning.reset(entry);
        sync();
      });
      sync();
      return sync;
    });
    document.getElementById('reset-tuning').addEventListener('click', () => {
      Tuning.resetAll();
      for (const sync of syncs) sync();
    });
  }

  // Testing sliders (bottom of the Gamemode tab): the dunk outcome odds, edited live on DUNK. Shatter is rolled first, so if the two
  // add up past 100% the hang share shrinks; "normal" shows whatever is left. Plus the AI level (live on AI) and the
  // crowd density (live on CROWD).
  const DEFAULT_ODDS = { hangChance: DUNK.hangChance, shatterChance: DUNK.shatterChance };
  const DEFAULT_CROWD = { density: CROWD.density };
  const DEFAULT_AI = { level: AI.level };

  function initTestView() {
    const testView = document.getElementById('test-view');
    const resetOdds = document.getElementById('reset-odds');
    const sliders = [...testView.querySelectorAll('input[data-odds]')];
    const crowd = document.getElementById('crowd-density');
    const aiLevel = document.getElementById('ai-level');

    const sync = () => {
      for (const s of sliders) {
        s.value = Math.round(DUNK[s.dataset.odds] * 100);
        document.getElementById(`${s.id}-value`).textContent = `${s.value}%`;
      }
      const normal = Math.max(0, 100 - Math.round((DUNK.hangChance + DUNK.shatterChance) * 100));
      document.getElementById('normal-chance-value').textContent = `${normal}%`;
      crowd.value = Math.round(CROWD.density * 100);
      document.getElementById('crowd-density-value').textContent = `${crowd.value}%`;
      aiLevel.value = Math.round(AI.level * 100);
      document.getElementById('ai-level-value').textContent = `${aiLevel.value}%`;
    };

    for (const s of sliders) {
      s.addEventListener('input', () => {
        DUNK[s.dataset.odds] = Number(s.value) / 100;
        sync();
      });
    }
    crowd.addEventListener('input', () => {
      CROWD.density = Number(crowd.value) / 100;
      sync();
    });
    aiLevel.addEventListener('input', () => {
      AI.level = Number(aiLevel.value) / 100;
      sync();
    });
    resetOdds.addEventListener('click', () => {
      Object.assign(DUNK, DEFAULT_ODDS);
      Object.assign(CROWD, DEFAULT_CROWD);
      Object.assign(AI, DEFAULT_AI);
      sync();
    });
    sync();
  }

  // `next` is the picked player's whole look. For a teammate, their own skin/hair/number stay with them and the kit
  // colors go to the whole team (kept in player 1's look).
  function applyLook(next) {
    if (pick === 0) {
      look = next;
    } else {
      look = { ...look };
      for (const key of LOOK_KIT_KEYS) look[key] = next[key];
      game.team[pick].look = cleanPersonalLook(next, game.team[pick].look);
      saveStored(TEAM_STORAGE_KEY, game.team);
    }
    game.setLook(look);
    preview.setLook(lookOf(pick));
    saveStored(LOOK_STORAGE_KEY, look);
    syncControls();
    syncUpgradeView();
    drawFaces();
  }

  function syncControls() {
    const shown = lookOf(pick);
    for (const key of LOOK_COLOR_KEYS) {
      document.getElementById(key).value = shown[key];
      const hex = panel.querySelector(`.hex[data-key="${key}"]`);
      if (document.activeElement !== hex) hex.value = shown[key];
    }
    if (document.activeElement !== numberInput) numberInput.value = shown.number;
    hairStyleName.textContent = shown.hairStyle;
    for (const swatch of presetRow.querySelectorAll('.swatch')) {
      swatch.setAttribute('aria-pressed', String(swatch.dataset.skin === shown.skin));
    }
  }

  function setOpen(value) {
    if (open === value) return;
    open = value;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      lastFrame = 0;
      syncModeView();
      syncUpgradeView(); // tokens may have come in, or the mode (free or career levels) changed
      requestAnimationFrame(drawPreview);
    } else {
      document.getElementById('game').focus();
    }
  }

  function drawPreview(now) {
    if (!open) return;
    const dt = lastFrame ? Math.min((now - lastFrame) / 1000, 0.1) : 0;
    lastFrame = now;
    previewTime += dt;

    const pose = PREVIEW_POSES[Math.floor(previewTime / POSE_SECONDS) % PREVIEW_POSES.length];
    preview.facing = pose.facing;
    preview.view = pose.view;
    preview.dribbleT += dt * 2;
    preview.sx = 40;
    preview.sy = 86;
    preview.by = 86;

    for (let y = 0; y < previewCanvas.height; y++) {
      pctx.fillStyle = Math.floor(y / 8) % 2 ? COLORS.woodA : COLORS.woodB;
      pctx.fillRect(0, y, previewCanvas.width, 1);
    }
    pctx.globalAlpha = SHADOW.alpha;
    preview.drawShadow(pctx);
    pctx.globalAlpha = 1;
    preview.draw(pctx);

    requestAnimationFrame(drawPreview);
  }

  // After a career game: the menu opens on the career panel, ready to pick the next game's challenge.
  function openCareer() {
    setOpen(true);
    showTab('mode-view');
    openCareerPanel();
  }

  return {
    init,
    isOpen: () => open,
    openCareer,
  };
})();
