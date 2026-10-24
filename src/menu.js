const LOOK_STORAGE_KEY = 'retroball.look';
const LOOK_COLOR_KEYS = ['skin', 'hair', 'jersey', 'shorts', 'shoe', 'laces'];
const HEX_RE = /^#[0-9a-f]{6}$/i;

// Saved look merged over the defaults; anything missing or malformed falls back to DEFAULT_LOOK.
function loadLook() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(LOOK_STORAGE_KEY)) || {};
  } catch (e) {
    // Storage blocked or corrupt: just use the defaults.
  }
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

function saveLook(look) {
  try {
    localStorage.setItem(LOOK_STORAGE_KEY, JSON.stringify(look));
  } catch (e) {
    // Not fatal; the look just won't persist.
  }
}

const TEAM_STORAGE_KEY = 'retroball.team';
const OLD_UPGRADE_STORAGE_KEY = 'retroball.upgrades'; // the user's player's levels, from before each player had their own
const UPGRADE_KEYS = ['speed', 'shooting', 'dunking', 'defense', 'dash'];
const NAME_MAX = 12;
const MODE_STORAGE_KEY = 'retroball.mode';
const MODES = ['3v3', 'free'];
const RULES_STORAGE_KEY = 'retroball.rules';
const DEFAULT_RULES = { freeThrows: true };
const UI_STORAGE_KEY = 'retroball.ui';
const DEFAULT_UI = { stats: true };

// On/off settings saved as one object: anything saved that isn't a boolean falls back to `defaults`.
function loadPrefs(key, defaults) {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(key)) || {};
  } catch (e) {
    // Storage blocked or corrupt: use the defaults.
  }
  const prefs = { ...defaults };
  for (const k of Object.keys(defaults)) if (typeof saved[k] === 'boolean') prefs[k] = saved[k];
  return prefs;
}

function savePrefs(key, prefs) {
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch (e) {
    // Not fatal; the settings just won't persist.
  }
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

// The user's team: a name and upgrade levels for each home player (by role). Levels saved before players had
// their own carry over to player 1.
function loadTeam() {
  let saved = null;
  let old = null;
  try {
    saved = JSON.parse(localStorage.getItem(TEAM_STORAGE_KEY));
    old = JSON.parse(localStorage.getItem(OLD_UPGRADE_STORAGE_KEY));
  } catch (e) {
    // Storage blocked or corrupt: start from nothing.
  }
  if (!Array.isArray(saved)) saved = [{ upgrades: old }];
  return ROSTER[0].map((_, i) => {
    const s = saved[i] || {};
    const name = typeof s.name === 'string' ? cleanName(s.name).trim() : '';
    return { name: name || defaultName(i), upgrades: cleanLevels(s.upgrades) };
  });
}

function saveTeam(team) {
  try {
    localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(team));
  } catch (e) {
    // Not fatal; names and levels just won't persist.
  }
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
  // setMode(mode) }, where team is the user's team as loadTeam() returns it, rules is { freeThrows } and ui is
  // { stats }.
  let game = null;
  let syncUpgradeView = () => {};
  let preview = null;
  let look = null;
  let open = false;
  let previewTime = 0;
  let lastFrame = 0;

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
      swatch.addEventListener('click', () => applyLook({ ...look, skin }));
      presetRow.appendChild(swatch);
    }

    for (const key of LOOK_COLOR_KEYS) {
      const picker = document.getElementById(key);
      const hex = panel.querySelector(`.hex[data-key="${key}"]`);
      picker.addEventListener('input', () => applyLook({ ...look, [key]: picker.value }));
      hex.addEventListener('change', () => {
        const value = `#${hex.value.trim().replace(/^#/, '')}`.toLowerCase();
        if (HEX_RE.test(value)) applyLook({ ...look, [key]: value });
        else syncControls();
      });
    }

    numberInput.addEventListener('input', () => {
      const digits = numberInput.value.replace(/\D/g, '').slice(0, 2);
      numberInput.value = digits;
      if (digits) applyLook({ ...look, number: digits });
    });
    numberInput.addEventListener('change', syncControls);

    for (const step of panel.querySelectorAll('.step[data-step]')) {
      step.addEventListener('click', () => {
        const n = HAIR_STYLE_NAMES.length;
        const i = HAIR_STYLE_NAMES.indexOf(look.hairStyle);
        applyLook({ ...look, hairStyle: HAIR_STYLE_NAMES[(i + Number(step.dataset.step) + n) % n] });
      });
    }

    initTabs();
    initUpgradeView();
    initModeView();
    initControlsView();
    initToggle(document.getElementById('show-stats'), game.ui, 'stats', UI_STORAGE_KEY);
    initTestView();

    button.addEventListener('click', () => setOpen(!open));
    document.getElementById('resume').addEventListener('click', () => setOpen(false));
    document.getElementById('reset-look').addEventListener('click', () => applyLook({ ...DEFAULT_LOOK }));
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
  }

  // Upgrades: pick one of the user's team (< >, name editable in place), then +/- per stat for that player, shown
  // as pips with what the current level does.
  function initUpgradeView() {
    const rows = [...panel.querySelectorAll('.upgrade')];
    const nameInput = document.getElementById('player-name');
    const numberTag = document.getElementById('player-num');
    let pick = 0;
    const picked = () => game.team[pick];
    const effects = {
      speed: (n) => `+${Math.round(UPGRADES.speed * n * 100)}% speed`,
      shooting: (n) => n >= UPGRADES.max
        ? `+${Math.round(UPGRADES.threeGreen * n * 100)}% 3s, ${SHOT.deepFramesMax}f half court`
        : `+${Math.round(UPGRADES.threeGreen * n * 100)}% green on 3s`,
      dunking: (n) => `+${Math.round(UPGRADES.dunkRange * n * 100)}% range, rim odds up`,
      defense: (n) => `+${Math.round(UPGRADES.stealRange * n * 100)}% steal reach, block`,
      dash: (n) => `+${Math.round(UPGRADES.dashDistance * n * 100)}% dash distance`,
    };
    const changed = () => {
      saveTeam(game.team);
      game.upgradesChanged();
      sync();
    };
    const sync = () => {
      if (document.activeElement !== nameInput) nameInput.value = picked().name;
      numberTag.textContent = `#${pick === 0 ? look.number : ROSTER[0][pick].number}`;
      for (const row of rows) {
        const key = row.dataset.upgrade;
        const n = picked().upgrades[key];
        const pips = row.querySelector('.pips');
        pips.replaceChildren(...Array.from({ length: UPGRADES.max }, (_, i) => {
          const pip = document.createElement('span');
          pip.className = i < n ? 'pip on' : 'pip';
          return pip;
        }));
        row.querySelector('.upgrade-effect').textContent = n ? effects[key](n) : '';
        row.querySelector('[data-delta="-1"]').disabled = n <= 0;
        row.querySelector('[data-delta="1"]').disabled = n >= UPGRADES.max;
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
    for (const step of panel.querySelectorAll('.step[data-pick]')) {
      step.addEventListener('click', () => {
        const n = game.team.length;
        pick = (pick + Number(step.dataset.pick) + n) % n;
        nameInput.blur();
        sync();
      });
    }
    nameInput.addEventListener('input', () => {
      nameInput.value = cleanName(nameInput.value);
      picked().name = nameInput.value.trim() || defaultName(pick);
      saveTeam(game.team);
    });
    nameInput.addEventListener('change', sync);
    syncUpgradeView = sync; // player 1's number follows the look
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
      savePrefs(storageKey, prefs);
      sync();
    });
    sync();
  }

  // Gamemode: picking a different mode starts a new game in it. Rule toggles below apply right away.
  function initModeView() {
    const options = [...panel.querySelectorAll('.mode-option')];
    initToggle(document.getElementById('free-throws'), game.rules, 'freeThrows', RULES_STORAGE_KEY);
    const sync = () => {
      for (const o of options) o.setAttribute('aria-pressed', String(o.dataset.mode === game.mode()));
    };
    for (const o of options) {
      o.addEventListener('click', () => {
        if (o.dataset.mode === game.mode()) return;
        game.setMode(o.dataset.mode);
        saveMode(o.dataset.mode);
        sync();
      });
    }
    sync();
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

  function applyLook(next) {
    look = next;
    game.setLook(look);
    preview.setLook(look);
    saveLook(look);
    syncControls();
    syncUpgradeView();
  }

  function syncControls() {
    for (const key of LOOK_COLOR_KEYS) {
      document.getElementById(key).value = look[key];
      const hex = panel.querySelector(`.hex[data-key="${key}"]`);
      if (document.activeElement !== hex) hex.value = look[key];
    }
    if (document.activeElement !== numberInput) numberInput.value = look.number;
    hairStyleName.textContent = look.hairStyle;
    for (const swatch of presetRow.querySelectorAll('.swatch')) {
      swatch.setAttribute('aria-pressed', String(swatch.dataset.skin === look.skin));
    }
  }

  function setOpen(value) {
    if (open === value) return;
    open = value;
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    if (open) {
      lastFrame = 0;
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

  return {
    init,
    isOpen: () => open,
  };
})();
