// Keyboard input with rebindable keys (Controls tab). Arrow keys always move too, so a bad rebind can't lock the
// player out; Esc always pauses (see menu.js).
const Input = (() => {
  const STORAGE_KEY = 'retroball.controls';
  const DEFAULT_BINDS = {
    up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
    shoot: 'Space', action: 'KeyE', pass: 'KeyQ', pause: 'KeyP',
  };
  const ARROWS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

  const down = new Set();
  let binds = { ...DEFAULT_BINDS };
  // Seconds allowed between the two taps of a double-tap dash.
  const settings = { doubleTap: DASH.doubleTap };

  // Left and right Shift/Ctrl/Alt/Meta count as the same key.
  const family = (code) => code.replace(/^(Shift|Control|Alt|Meta)(Left|Right)$/, '$1');
  const isBound = (name, code) => family(binds[name]) === family(code) || ARROWS[name] === code;
  const held = (name) => [...down].some((code) => isBound(name, code));

  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
      for (const name of Object.keys(DEFAULT_BINDS)) {
        if (typeof saved.binds?.[name] === 'string' && saved.binds[name]) binds[name] = saved.binds[name];
      }
      if (Number.isFinite(saved.doubleTap)) settings.doubleTap = clamp(saved.doubleTap, 0.05, 0.4);
    } catch (e) {
      // Storage blocked or corrupt: keep the defaults.
    }
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ binds, doubleTap: settings.doubleTap }));
    } catch (e) {
      // Not fatal; the controls just won't persist.
    }
  }

  // Bind `code` to `name`; whatever action had that key takes this action's old key instead (a swap).
  function setBind(name, code) {
    const other = Object.keys(binds).find((n) => n !== name && family(binds[n]) === family(code));
    if (other) binds[other] = binds[name];
    binds[name] = code;
    save();
  }

  function reset() {
    binds = { ...DEFAULT_BINDS };
    settings.doubleTap = DASH.doubleTap;
    save();
  }

  // A short name for a key code, for the menu and the on-screen hints.
  function label(code) {
    const named = {
      Space: 'SPACE', Enter: 'ENTER', Tab: 'TAB', Backspace: 'BKSP', CapsLock: 'CAPS', Escape: 'ESC',
      ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT',
      Shift: 'SHIFT', Control: 'CTRL', Alt: 'ALT', Meta: 'META',
      Comma: ',', Period: '.', Slash: '/', Semicolon: ';', Quote: "'", Minus: '-', Equal: '=',
      BracketLeft: '[', BracketRight: ']', Backslash: '\\', Backquote: '`',
    };
    const c = family(code);
    if (named[c]) return named[c];
    if (/^Key[A-Z]$/.test(c)) return c.slice(3);
    if (/^Digit\d$/.test(c)) return c.slice(5);
    if (/^Numpad/.test(c)) return `NUM${c.slice(6).toUpperCase()}`;
    return c.toUpperCase();
  }

  // The move keys as one word when they're single letters (e.g. "WASD"), else listed.
  function moveLabel() {
    const keys = ['up', 'left', 'down', 'right'].map((n) => label(binds[n]));
    return keys.every((k) => k.length === 1) ? keys.join('') : keys.join('/');
  }

  // Double-tapping a move key (up, down, left or right) queues a dash that way, picked up by takeDash.
  const TAP_DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  let lastTap = { name: null, t: -Infinity };
  let dash = { dir: null, t: -Infinity };
  const now = () => performance.now() / 1000;

  window.addEventListener('keydown', (e) => {
    // Typing in the pause menu shouldn't move the player or be blocked.
    if (e.target instanceof Element && e.target.closest('#menu')) return;
    const ours = Object.keys(binds).some((n) => isBound(n, e.code));
    if (ours) e.preventDefault();
    const name = Object.keys(TAP_DIRS).find((n) => isBound(n, e.code));
    if (name && !e.repeat) {
      const t = now();
      if (lastTap.name === name && t - lastTap.t < settings.doubleTap) {
        dash = { dir: TAP_DIRS[name], t };
        lastTap = { name: null, t: -Infinity };
      } else {
        lastTap = { name, t };
      }
    }
    down.add(e.code);
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => down.clear());

  load();

  return {
    binds: () => binds,
    settings,
    defaults: DEFAULT_BINDS,
    isBound,
    setBind,
    reset,
    save,
    label,
    keyLabel: (name) => label(binds[name]),
    moveLabel,
    move() {
      return {
        x: (held('right') ? 1 : 0) - (held('left') ? 1 : 0),
        y: (held('down') ? 1 : 0) - (held('up') ? 1 : 0),
      };
    },
    shoot: () => held('shoot'),
    // Dunk with the ball (and let go of the rim), steal on defense.
    action: () => held('action'),
    // Pass with the ball, switch player on defense.
    pass: () => held('pass'),
    // A just-made double tap's direction ({ x, y }), once, or null. Stale ones (e.g. tapped while paused) are dropped.
    takeDash() {
      const d = now() - dash.t < 0.2 ? dash.dir : null;
      dash = { dir: null, t: -Infinity };
      return d;
    },
  };
})();
