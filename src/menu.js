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
const RULES_STORAGE_KEY = 'retroball.rules';
const DEFAULT_RULES = { freeThrows: true, halfMinutes: GAME.halfMinutes, shotClock: true, shotSeconds: GAME.shotClock, difficulty: 1 };
const UI_STORAGE_KEY = 'retroball.ui';
const DEFAULT_UI = { stats: true, trophies: true };

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

// A new element with a class and text (text, never HTML: team names come from the user).
function el(tag, className, text = '') {
  const e = document.createElement(tag);
  if (className) e.className = className;
  e.textContent = text;
  return e;
}

// An ON/OFF button for `prefs[key]`, saved under `storageKey` whenever it flips (then `changed` runs).
function initToggle(button, prefs, key, storageKey, changed = () => {}) {
  const sync = () => {
    button.textContent = prefs[key] ? 'ON' : 'OFF';
    button.setAttribute('aria-pressed', String(prefs[key]));
  };
  button.addEventListener('click', () => {
    prefs[key] = !prefs[key];
    saveStored(storageKey, prefs);
    changed();
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

// What each upgrade's level `n` does, for the Upgrades tab and the career screen.
const UPGRADE_EFFECTS = {
  speed: (n) => `+${Math.round(UPGRADES.speed * n * 100)}% speed`,
  shooting: (n) => n >= UPGRADES.max
    ? `+${Math.round(UPGRADES.threeGreen * n * 100)}% 3s, ${SHOT.deepFramesMax}f half court`
    : `+${Math.round(UPGRADES.threeGreen * n * 100)}% green on 3s`,
  dunking: (n) => `+${Math.round(UPGRADES.dunkRange * n * 100)}% range, rim odds up`,
  defense: (n) => `+${Math.round(UPGRADES.stealRange * n * 100)}% steal reach, block`,
  dash: (n) => `+${Math.round(UPGRADES.dashDistance * n * 100)}% dash distance`,
};

// Level pips, filled up to `n`.
function pips(n) {
  return Array.from({ length: UPGRADES.max }, (_, i) => el('span', i < n ? 'pip on' : 'pip'));
}

// The menus' pixel icons (the main menu's dock and road, the pause menu's rail), one letter per pixel in the
// game's palette ('.' is see-through).
const ICON_COLORS = { k: '#1a1c2c', h: '#e43b44', r: '#b13e53', o: '#ef7d57', y: '#ffcd75', w: '#f4f4f4', v: '#94b0c2', s: '#41a6f6', b: '#3b5dc9', g: '#38b764', l: '#a7f070', t: '#257179', u: '#333c57' };
const ICONS = {
  trophy: ['y.yyyyy.y', 'y.yyyyy.y', '.yyyyyyy.', '..yyyyy..', '...yyy...', '....y....', '....y....', '..ooooo..', '..ooooo..'],
  ball: ['..ookoo..', '.oookooo.', 'ooookoooo', 'ooookoooo', 'kkkkkkkkk', 'ooookoooo', 'ooookoooo', '.oookooo.', '..ookoo..'],
  duo: ['.........', '.ooo.sss.', '.ooo.sss.', '.........', 'oooo.ssss', 'oooo.ssss', 'oooo.ssss', 'oo.o.s.ss', 'oo.o.s.ss'],
  cone: ['....o....', '...ooo...', '...www...', '..ooooo..', '..ooooo..', '.wwwwwww.', '.ooooooo.', 'ooooooooo', 'uuuuuuuuu'],
  globe: ['...sss...', '.ssbsbss.', '.sbbsbbs.', 'sssssssss', 'sbbsbsbbs', 'sssssssss', '.sbbsbbs.', '.ssbsbss.', '...sss...'],
  jersey: ['.bb...bb.', '.bbb.bbb.', '.bbbbbbb.', '.bbwwwbb.', '.bbbwbbb.', '.bbbwbbb.', '.bbwwwbb.', '.bbbbbbb.', '.bbbbbbb.'],
  gear: ['...vvv...', '.v.vvv.v.', '..vvvvv..', 'vvv...vvv', 'vvv...vvv', 'vvv...vvv', '..vvvvv..', '.v.vvv.v.', '...vvv...'],
  full: ['www...www', 'w.......w', 'w.......w', '.........', '.........', '.........', 'w.......w', 'w.......w', 'www...www'],
  coin: ['..ggg..', '.gllgg.', 'glgggtg', 'glgggtg', 'glgggtg', '.gggtt.', '..ttt..'],
  go: ['k....', 'kkk..', 'kkkkk', 'kkk..', 'k....'],
  star: ['...y...', '...y...', 'yyyyyyy', '.yyyyy.', '..yyy..', '.yy.yy.', 'yy...yy'],
  pad: ['.........', '.vvvvvvv.', 'vvwvvvrvv', 'vwwwvrvrv', 'vvwvvvrvv', 'vvvvvvvvv', 'vv.....vv'],
  check: ['.....', '....k', '...kk', 'k.kk.', 'kkk..', '.k...'],
  cross: ['h...h', '.h.h.', '..h..', '.h.h.', 'h...h'],
  locker: ['uuuuuuuuu', 'ubbbubbbu', 'ukkkukkku', 'ubbbubbbu', 'ubbbubbbu', 'ubbyubbyu', 'ubbbubbbu', 'ubbbubbbu', 'uuuuuuuuu'],
};

// An icon as a little canvas, sized in game pixels (--u, see style.css).
function pixelIcon(name) {
  const rows = ICONS[name];
  const c = document.createElement('canvas');
  c.width = rows[0].length;
  c.height = rows.length;
  c.className = 'ico';
  c.style.width = `calc(var(--u) * ${c.width})`;
  c.style.height = `calc(var(--u) * ${c.height})`;
  c.setAttribute('aria-hidden', 'true');
  const ctx = c.getContext('2d');
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    ctx.fillStyle = ICON_COLORS[ch];
    ctx.fillRect(x, y, 1, 1);
  }));
  return c;
}

// The testing sliders and player tuning (the Dev tab) only show with ?dev=1 in the address.
const DEV = new URLSearchParams(location.search).get('dev') === '1';

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

  // What the menu edits, supplied by main.js: { look, setLook(look), team, upgradesChanged(), ui, mode(),
  // inTitle(), restart(), toTitle(), closed(), testing }, where team is the user's team as loadTeam() returns it and
  // ui is { stats }. inTitle() says the main menu is up (the menu was opened from it, and closing goes back to it).
  // testing has the Testing tab's tools by name, plus can(name): whether one applies right now.
  let game = null;
  let syncUpgradeView = () => {};
  let syncFoot = () => {};
  let syncTools = () => {};
  let syncGearView = () => {};
  let showGroups = () => {};
  let showTab = () => {};
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
    document.getElementById('randomize-look').addEventListener('click', () => {
      applyLook(randomLook());
      Trophies.count(null, null, 'randomize');
    });

    initFaces();
    initTabs();
    initUpgradeView();
    initGearView();
    initControlsView();
    initToggle(document.getElementById('show-stats'), game.ui, 'stats', UI_STORAGE_KEY);
    initToggle(document.getElementById('show-trophies'), game.ui, 'trophies', UI_STORAGE_KEY);
    initSoundView();
    initTuningView();
    initTestView();
    initTestingTools();
    initFoot();
    panel.querySelector('.tab[data-panel="dev-view"]').hidden = !DEV;

    button.addEventListener('click', () => setOpen(!open));
    // Player 1 goes back to the default look (kit included); a teammate to their roster skin, hair and number.
    document.getElementById('reset-look').addEventListener('click', () => {
      applyLook(pick === 0 ? { ...DEFAULT_LOOK } : { ...look, ...ROSTER[0][pick] });
    });
    document.getElementById('game').addEventListener('pointerdown', () => setOpen(false));
    window.addEventListener('keydown', (e) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;
      if (game.inTitle() && !open) return; // the main menu has its own keys (see Title)
      if (e.code === 'Escape' || (Input.isPause(e.code) && !typing)) {
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
      p.setGear(Cosmetics.gearFor(i));
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
    syncGearView();
    dressPreview();
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
    // The rail: up/down from a tab opens the next one.
    for (const t of tabs) {
      t.addEventListener('keydown', (e) => {
        const step = { ArrowUp: -1, ArrowDown: 1 }[e.code];
        if (!step) return;
        e.preventDefault();
        const live = tabs.filter((x) => !x.hidden);
        const next = live[(live.indexOf(t) + step + live.length) % live.length];
        show(next);
        next.focus();
      });
    }
    for (const s of panel.querySelectorAll('span.ico[data-icon]')) s.replaceWith(pixelIcon(s.dataset.icon));
    show(tabs[0]);
    showTab = (id) => show(tabs.find((t) => t.dataset.panel === id));
    // Which groups' tabs show (Customize, Settings; see index.html), and the rail's title. If the open tab is hidden,
    // the first one showing opens.
    showGroups = (groups, title) => {
      for (const t of tabs) t.hidden = !groups.includes(t.dataset.group) || (t.dataset.panel === 'dev-view' && !DEV);
      document.getElementById('rail-head').textContent = title;
      const current = tabs.find((t) => t.getAttribute('aria-selected') === 'true');
      if (!current || current.hidden) show(tabs.find((t) => !t.hidden));
    };
  }

  // Gear: a row per cosmetic, stepping through none and the unlocked styles (worn items for the picked player), with
  // what unlocks the next style. A change shows on the preview, the faces and in the game right away.
  function initGearView() {
    const lists = { player: 'gear-player', team: 'gear-team', game: 'gear-game' };
    const rows = Cosmetics.items.map((item) => {
      const row = el('div', 'row gear-row');
      const step = (text, dir, label) => {
        const b = el('button', 'step', text);
        b.type = 'button';
        b.setAttribute('aria-label', `${label} ${item.name.toLowerCase()}`);
        b.addEventListener('click', () => {
          Cosmetics.step(item.id, pick, dir);
          game.gearChanged();
          dressPreview();
          syncGearView();
        });
        return b;
      };
      const prev = step('<', -1, 'Previous');
      const next = step('>', 1, 'Next');
      const value = el('span', 'value gear-value');
      const hint = el('span', 'upgrade-effect gear-hint');
      row.append(el('span', 'label', item.name), prev, value, next, hint);
      document.getElementById(lists[item.per]).append(row);
      return { item, value, hint, prev, next };
    });
    syncGearView = () => {
      for (const r of rows) {
        const s = Cosmetics.row(r.item.id, pick);
        r.value.textContent = s.value;
        r.hint.textContent = s.hint;
        r.prev.disabled = !s.open;
        r.next.disabled = !s.open;
      }
    };
    syncGearView();
  }

  // The preview and the faces wear what's picked.
  function dressPreview() {
    preview.setGear(Cosmetics.gearFor(pick));
    drawFaces();
  }

  // Upgrades: the picked player (faces at the top, name editable in place) with +/- per stat, shown as pips with
  // what the current level does. In a career game it's the career team, shown but not changed here (levels are
  // bought on the main menu's Career screen); otherwise the free testing levels.
  function initUpgradeView() {
    const rows = [...panel.querySelectorAll('.upgrade')];
    const nameInput = document.getElementById('player-name');
    const numberTag = document.getElementById('player-num');
    const note = document.getElementById('upgrade-note');
    const resetButton = document.getElementById('reset-upgrades');
    const picked = () => activeTeam()[pick];
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
      note.textContent = career
        ? 'Career levels: buy more with tokens on the Career screen (main menu) between games.'
        : 'Free while testing. Each AI opponent gets as many levels as your player in the same spot, at random.';
      resetButton.disabled = career;
      if (document.activeElement !== nameInput) nameInput.value = picked().name;
      numberTag.textContent = `#${lookOf(pick).number}`;
      for (const row of rows) {
        const key = row.dataset.upgrade;
        const n = picked().upgrades[key];
        row.querySelector('.pips').replaceChildren(...pips(n));
        row.querySelector('.upgrade-effect').textContent = n ? UPGRADE_EFFECTS[key](n) : '';
        row.querySelector('[data-delta="-1"]').disabled = career || n <= 0;
        row.querySelector('[data-delta="1"]').disabled = career || n >= UPGRADES.max;
      }
    };
    for (const row of rows) {
      for (const step of row.querySelectorAll('.step')) {
        step.addEventListener('click', () => {
          const key = row.dataset.upgrade;
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

  // Controls: the double-tap dash window and the keybinds, for one key set at a time (1 Player, or player 1 or 2 of
  // 2 Player). A drawn keyboard shows each action's keys in its color; the legend lists the actions with their key.
  // Click an action, then press a key (or click one on the keyboard; Esc cancels); a key already used elsewhere
  // swaps over. Saved by Input.
  const KEYBIND_NAMES = {
    up: 'Up', down: 'Down', left: 'Left', right: 'Right',
    shoot: 'Shoot/block', action: 'Dunk/steal', pass: 'Pass/switch', pause: 'Pause',
  };
  // Each action's color on the keyboard (style.css .act-*).
  const KEY_ACTION_KINDS = { up: 'move', down: 'move', left: 'move', right: 'move', shoot: 'shoot', action: 'dunk', pass: 'pass', pause: 'pause' };
  // The drawn keyboard: rows of [code, label, width in keys]; every row is 15 keys wide (null code: a gap).
  const letters = (s) => [...s].map((ch) => [`Key${ch}`, ch, 1]);
  const KEYBOARD = [
    [['Escape', 'Esc', 1], ...[...'1234567890'].map((d) => [`Digit${d}`, d, 1]), ['Minus', '-', 1], ['Equal', '=', 1], ['Backspace', 'Bksp', 2]],
    [['Tab', 'Tab', 1.5], ...letters('QWERTYUIOP'), ['BracketLeft', '[', 1], ['BracketRight', ']', 1], ['Backslash', '\\', 1.5]],
    [['CapsLock', 'Caps', 1.75], ...letters('ASDFGHJKL'), ['Semicolon', ';', 1], ['Quote', "'", 1], ['Enter', 'Enter', 2.25]],
    [['ShiftLeft', 'Shift', 2.25], ...letters('ZXCVBNM'), ['Comma', ',', 1], ['Period', '.', 1], ['Slash', '/', 1], ['ShiftRight', 'Shift', 0.75], ['ArrowUp', '↑', 1], [null, '', 1]],
    [['ControlLeft', 'Ctrl', 1.5], ['AltLeft', 'Alt', 1.5], ['Space', 'Space', 7], ['AltRight', 'Alt', 2], ['ArrowLeft', '←', 1], ['ArrowDown', '↓', 1], ['ArrowRight', '→', 1]],
  ];

  function initControlsView() {
    const slider = document.getElementById('double-tap');
    const value = document.getElementById('double-tap-value');
    const keyboard = document.getElementById('keyboard');
    const legend = document.getElementById('key-legend');
    const hint = document.getElementById('key-hint');
    const setButtons = [...panel.querySelectorAll('[data-key-set]')];
    let set = 'solo';
    let listening = null; // the action waiting for a key
    let swallowUp = null;
    const caps = []; // { code, btn }
    const rows = {}; // action name -> legend row

    const bind = (code) => {
      Input.setBind(set, listening, code);
      listening = null;
      sync();
    };

    const sync = () => {
      slider.value = Math.round(Input.settings.doubleTap * 1000);
      value.textContent = `${slider.value}ms`;
      for (const b of setButtons) b.setAttribute('aria-pressed', String(b.dataset.keySet === set));
      // Only Esc pauses in 2 Player (the players' keys are all in use).
      rows.pause.hidden = set !== 'solo';
      for (const [name, row] of Object.entries(rows)) {
        row.querySelector('.key-name').textContent = listening === name ? '...' : Input.keyLabel(name, set);
        row.setAttribute('aria-pressed', String(listening === name));
      }
      for (const { code, btn } of caps) {
        const name = code === 'Escape' ? 'pause' : Input.actionFor(set, code);
        btn.className = `keycap${name ? ` act-${KEY_ACTION_KINDS[name]}` : ''}`;
        btn.title = name ? KEYBIND_NAMES[name] : '';
      }
      keyboard.classList.toggle('picking', !!listening);
      hint.textContent = listening
        ? `Press a key (or click one) for ${KEYBIND_NAMES[listening]}. Esc cancels.`
        : `Click an action to change its key.${set === 'solo' ? ' The arrow keys always move, and Esc always pauses.' : ' Esc pauses.'}`;
    };

    for (const row of KEYBOARD) {
      const line = el('div', 'keyboard-row');
      for (const [code, text, width] of row) {
        let cap;
        if (code) {
          cap = el('button', 'keycap', text);
          cap.type = 'button';
          cap.tabIndex = -1; // the legend is the keyboard way in; the caps are for the mouse
          cap.addEventListener('click', () => {
            if (listening) {
              if (code !== 'Escape') bind(code);
              return;
            }
            // Not picking: clicking a used key picks its action.
            const name = Input.actionFor(set, code);
            if (name && KEYBIND_NAMES[name]) {
              listening = name;
              sync();
            }
          });
          caps.push({ code, btn: cap });
        } else {
          cap = el('span', 'keycap-gap');
        }
        cap.style.gridColumn = `span ${width * 4}`;
        line.append(cap);
      }
      keyboard.append(line);
    }

    for (const [name, text] of Object.entries(KEYBIND_NAMES)) {
      const row = el('button', `legend-row act-${KEY_ACTION_KINDS[name]}`);
      row.type = 'button';
      row.append(el('span', 'legend-swatch'), el('span', 'legend-label', text), el('span', 'key-name'));
      row.addEventListener('click', () => {
        listening = listening === name ? null : name;
        sync();
      });
      rows[name] = row;
      legend.append(row);
    }

    for (const b of setButtons) {
      b.addEventListener('click', () => {
        set = b.dataset.keySet;
        listening = null;
        sync();
      });
    }

    // While waiting for a key, grab it before the game or the pause shortcut sees it (and swallow its key-up so
    // Space doesn't also click the focused button).
    window.addEventListener('keydown', (e) => {
      if (!listening) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      swallowUp = e.code;
      if (e.code === 'Escape') {
        listening = null;
        sync();
      } else {
        bind(e.code);
      }
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

  // Player tuning (the Dev tab): a number box per TUNING entry with its tip and default. A changed
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

  // Testing sliders (top of the Dev tab): the dunk outcome odds, edited live on DUNK. Shatter is rolled first, so if the two
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

  // Sound (UI tab): on/off and the volume (Sfx saves them and applies them right away).
  function initSoundView() {
    initToggle(document.getElementById('sound-on'), Sfx.prefs, 'on', SOUND_STORAGE_KEY, Sfx.save);
    const slider = document.getElementById('sound-volume');
    const value = document.getElementById('sound-volume-value');
    const sync = () => {
      slider.value = Math.round(Sfx.prefs.volume * 100);
      value.textContent = `${slider.value}%`;
    };
    slider.addEventListener('input', () => {
      Sfx.prefs.volume = Number(slider.value) / 100;
      Sfx.save();
      sync();
    });
    slider.addEventListener('change', () => Sfx.play('swish')); // a sample at the new volume
    sync();
  }

  // Footer: in a game, Main menu (in a career game that isn't over, after an "are you sure": it's a forfeit loss) and
  // Restart (not in career: no do-overs); opened from the main menu, just Back.
  // UI tab: each trophy family (metal so far, count, next goal), then the secrets.
  function renderTrophies() {
    const { families, secrets } = Trophies.list();
    const rows = families.map((f) => {
      const row = el('div', 'trophy-row');
      const metal = f.metal >= 0 ? TROPHY_TIERS[f.metal] : null;
      const cup = el('span', 'trophy-cup');
      cup.style.background = metal ? metal.color : 'transparent';
      row.append(cup, el('span', 'trophy-name', f.name), el('span', 'upgrade-effect',
        `${f.count} ${f.what}${f.next ? `, next at ${f.next}` : ', all metals'}${metal ? ` (${metal.name.toLowerCase()})` : ''}`));
      return row;
    });
    for (const s of secrets) {
      const row = el('div', 'trophy-row');
      const cup = el('span', 'trophy-cup');
      cup.style.background = s.earned ? s.color : 'transparent';
      row.append(cup, el('span', 'trophy-name', s.name), el('span', 'upgrade-effect', s.earned ? s.what : 'A secret'));
      rows.push(row);
    }
    document.getElementById('trophy-list').replaceChildren(...rows);
  }

  // Testing tab tools: each button runs main.js's tool of the same name; the game ones close the menu so the result
  // plays out. Buttons that don't apply right now (no game clock, the main menu...) are disabled.
  const STAYS_OPEN = ['tokens', 'allGear'];
  function initTestingTools() {
    const buttons = [...document.querySelectorAll('#testing-tools [data-tool]')];
    syncTools = () => {
      for (const b of buttons) b.disabled = !game.testing.can(b.dataset.tool);
    };
    for (const b of buttons) {
      b.addEventListener('click', () => {
        const tool = b.dataset.tool;
        if (!game.testing.can(tool)) return;
        game.testing[tool]();
        if (STAYS_OPEN.includes(tool)) {
          syncTools();
          syncGearView();
          dressPreview();
        }
        else setOpen(false);
      });
    }
  }

  function initFoot() {
    const toTitle = document.getElementById('to-title');
    const restart = document.getElementById('restart-game');
    const resume = document.getElementById('resume');
    let confirming = false;
    // (Each time the menu opens the "are you sure" starts over.)
    syncFoot = (fresh = false) => {
      if (fresh) confirming = false;
      const title = game.inTitle();
      toTitle.hidden = title;
      restart.hidden = title || game.mode() === 'career' || game.mode() === 'daily';
      toTitle.textContent = confirming ? 'Sure? Forfeit (a loss)' : 'Main menu';
      resume.textContent = title ? 'Back' : 'Resume';
    };
    toTitle.addEventListener('click', () => {
      if ((game.mode() === 'career' || game.mode() === 'daily') && !game.over() && !confirming) {
        confirming = true;
        syncFoot();
        return;
      }
      setOpen(false);
      game.toTitle();
    });
    restart.addEventListener('click', () => {
      setOpen(false);
      game.restart();
    });
    resume.addEventListener('click', () => setOpen(false));
  }

  function setOpen(value) {
    if (open === value) return;
    open = value;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      lastFrame = 0;
      // Paused in a game: Settings, plus Customize in a Quick game (casual) only.
      if (!game.inTitle()) showGroups(game.mode() === '3v3' ? ['customize', 'settings'] : ['settings'], 'Paused');
      syncFoot(true);
      syncTools();
      renderTrophies();
      syncUpgradeView(); // the mode (free or career levels) may have changed
      syncGearView(); // new trophies may have unlocked more
      dressPreview();
      requestAnimationFrame(drawPreview);
    } else {
      document.getElementById('game').focus();
      game.closed();
    }
  }

  // From the main menu: the menu opened on one of its tabs, showing just that tab's group (Customize or Settings).
  function openTab(id) {
    setOpen(true);
    if (game.inTitle()) {
      const group = panel.querySelector(`.tab[data-panel="${id}"]`).dataset.group;
      showGroups([group], group === 'customize' ? 'Customize' : 'Settings');
    }
    showTab(id);
  }

  return {
    init,
    isOpen: () => open,
    openTab,
  };
})();
