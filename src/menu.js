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

const Menu = (() => {
  const button = document.getElementById('pause-btn');
  const panel = document.getElementById('menu');
  const previewCanvas = document.getElementById('preview');
  const pctx = previewCanvas.getContext('2d');
  const numberInput = document.getElementById('number');
  const hairStyleName = document.getElementById('hair-style-name');
  const presetRow = document.getElementById('skin-presets');

  // The preview turns through these poses so every side of the look is visible.
  const PREVIEW_POSES = [
    { facing: 1, turn: 0 },
    { facing: 1, turn: -1 },
    { facing: -1, turn: 0 },
    { facing: 1, turn: 1 },
  ];
  const POSE_SECONDS = 1.2;

  let player = null;
  let preview = null;
  let look = null;
  let open = false;
  let previewTime = 0;
  let lastFrame = 0;

  function init(target) {
    player = target;
    look = { ...target.look };
    preview = new Player({ x: 0, y: 0, look });

    for (const skin of SKINS) {
      const swatch = document.createElement('button');
      swatch.type = 'button';
      swatch.className = 'swatch';
      swatch.style.background = skin;
      swatch.dataset.skin = skin;
      swatch.setAttribute('aria-label', `Skin tone ${skin}`);
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

    for (const step of panel.querySelectorAll('.step')) {
      step.addEventListener('click', () => {
        const n = HAIR_STYLE_NAMES.length;
        const i = HAIR_STYLE_NAMES.indexOf(look.hairStyle);
        applyLook({ ...look, hairStyle: HAIR_STYLE_NAMES[(i + Number(step.dataset.step) + n) % n] });
      });
    }

    initTestView();

    button.addEventListener('click', () => setOpen(!open));
    document.getElementById('resume').addEventListener('click', () => setOpen(false));
    document.getElementById('reset-look').addEventListener('click', () => applyLook({ ...DEFAULT_LOOK }));
    document.getElementById('game').addEventListener('pointerdown', () => setOpen(false));
    window.addEventListener('keydown', (e) => {
      const typing = e.target instanceof HTMLInputElement;
      if (e.code === 'Escape' || (e.code === 'KeyP' && !typing)) {
        e.preventDefault();
        setOpen(!open);
      }
    });

    syncControls();
  }

  // Testing view: sliders for the dunk outcome odds, edited live on DUNK. Shatter is rolled first, so if the two
  // add up past 100% the hang share shrinks; "normal" shows whatever is left.
  const DEFAULT_ODDS = { hangChance: DUNK.hangChance, shatterChance: DUNK.shatterChance };

  function initTestView() {
    const playerView = document.getElementById('player-view');
    const testView = document.getElementById('test-view');
    const toggle = document.getElementById('test-toggle');
    const resetLook = document.getElementById('reset-look');
    const resetOdds = document.getElementById('reset-odds');
    const sliders = [...testView.querySelectorAll('input[type="range"]')];

    const sync = () => {
      for (const s of sliders) {
        s.value = Math.round(DUNK[s.dataset.odds] * 100);
        document.getElementById(`${s.id}-value`).textContent = `${s.value}%`;
      }
      const normal = Math.max(0, 100 - Math.round((DUNK.hangChance + DUNK.shatterChance) * 100));
      document.getElementById('normal-chance-value').textContent = `${normal}%`;
    };

    for (const s of sliders) {
      s.addEventListener('input', () => {
        DUNK[s.dataset.odds] = Number(s.value) / 100;
        sync();
      });
    }
    resetOdds.addEventListener('click', () => {
      Object.assign(DUNK, DEFAULT_ODDS);
      sync();
    });
    toggle.addEventListener('click', () => {
      const testing = testView.hidden;
      testView.hidden = !testing;
      playerView.hidden = testing;
      resetLook.hidden = testing;
      resetOdds.hidden = !testing;
      toggle.textContent = testing ? 'Back' : 'Test';
    });
    sync();
  }

  function applyLook(next) {
    look = next;
    player.setLook(look);
    preview.setLook(look);
    saveLook(look);
    syncControls();
  }

  function syncControls() {
    for (const key of LOOK_COLOR_KEYS) {
      document.getElementById(key).value = look[key];
      const hex = panel.querySelector(`.hex[data-key="${key}"]`);
      if (document.activeElement !== hex) hex.value = look[key];
    }
    if (document.activeElement !== numberInput) numberInput.value = look.number;
    hairStyleName.textContent = look.hairStyle;
    for (const swatch of presetRow.children) {
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
    preview.turn = pose.turn;
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
