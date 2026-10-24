// Keyboard input with rebindable keys (Controls tab), in key sets: 'solo' for one player, and 'p1' / 'p2' for the
// two players of 2 Player mode (Input.setTwoPlayer switches which are live). In solo play the arrow keys always
// move too, so a bad rebind can't lock the player out; Esc always pauses (see menu.js).
const Input = (() => {
  const STORAGE_KEY = 'retroball.controls';
  const DEFAULT_BINDS = {
    solo: {
      up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD',
      shoot: 'Space', action: 'KeyE', pass: 'KeyQ', pause: 'KeyP',
    },
    p1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', shoot: 'KeyR', action: 'KeyE', pass: 'KeyQ' },
    p2: { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', shoot: 'KeyP', action: 'KeyO', pass: 'KeyU' },
  };
  const SETS = Object.keys(DEFAULT_BINDS);
  const ARROWS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

  const down = new Set();
  const copyDefaults = () => Object.fromEntries(SETS.map((s) => [s, { ...DEFAULT_BINDS[s] }]));
  let binds = copyDefaults();
  let twoPlayer = false;
  // Seconds allowed between the two taps of a double-tap dash.
  const settings = { doubleTap: DASH.doubleTap };

  // Left and right Shift/Ctrl/Alt/Meta count as the same key.
  const family = (code) => code.replace(/^(Shift|Control|Alt|Meta)(Left|Right)$/, '$1');
  const isBound = (set, name, code) => family(binds[set][name]) === family(code) || (set === 'solo' && ARROWS[name] === code);
  const liveSets = () => (twoPlayer ? ['p1', 'p2'] : ['solo']);
  function held(set, name) {
    for (const code of down) if (isBound(set, name, code)) return true;
    return false;
  }

  // Anything missing or malformed keeps its default. The solo keys are saved as `binds` (as before 2 Player mode),
  // the two players' as `binds2`.
  function load() {
    const saved = loadStored(STORAGE_KEY) || {};
    const from = { solo: saved.binds, p1: saved.binds2?.p1, p2: saved.binds2?.p2 };
    for (const set of SETS) {
      for (const name of Object.keys(DEFAULT_BINDS[set])) {
        if (typeof from[set]?.[name] === 'string' && from[set][name]) binds[set][name] = from[set][name];
      }
    }
    if (Number.isFinite(saved.doubleTap)) settings.doubleTap = clamp(saved.doubleTap, 0.05, 0.4);
  }

  function save() {
    saveStored(STORAGE_KEY, { binds: binds.solo, binds2: { p1: binds.p1, p2: binds.p2 }, doubleTap: settings.doubleTap });
  }

  // Bind `code` to `name` in `set`; whatever action had that key takes this action's old key instead (a swap). The
  // two players' sets count as one here, so they can never share a key.
  function setBind(set, name, code) {
    const group = set === 'solo' ? ['solo'] : ['p1', 'p2'];
    for (const s of group) {
      const other = Object.keys(binds[s]).find((n) => (s !== set || n !== name) && family(binds[s][n]) === family(code));
      if (other) binds[s][other] = binds[set][name];
    }
    binds[set][name] = code;
    save();
  }

  function reset() {
    binds = copyDefaults();
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
  function moveLabel(set = 'solo') {
    const keys = ['up', 'left', 'down', 'right'].map((n) => label(binds[set][n]));
    return keys.every((k) => k.length === 1) ? keys.join('') : keys.join('/');
  }

  // Double-tapping a move key (up, down, left or right) queues a dash that way, picked up by takeDash. Each set
  // keeps its own taps.
  const TAP_DIRS = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } };
  const taps = Object.fromEntries(SETS.map((s) => [s, { last: { name: null, t: -Infinity }, dash: { dir: null, t: -Infinity } }]));
  const now = () => performance.now() / 1000;

  window.addEventListener('keydown', (e) => {
    // Typing (and Space / Enter on buttons) in the pause menu or the main menu shouldn't move a player or be blocked.
    if (e.target instanceof Element && e.target.closest('#menu, #title')) return;
    const sets = liveSets();
    const ours = sets.some((s) => Object.keys(binds[s]).some((n) => isBound(s, n, e.code)));
    if (ours) e.preventDefault();
    for (const set of sets) {
      const name = Object.keys(TAP_DIRS).find((n) => isBound(set, n, e.code));
      if (!name || e.repeat) continue;
      const tap = taps[set];
      const t = now();
      if (tap.last.name === name && t - tap.last.t < settings.doubleTap) {
        tap.dash = { dir: TAP_DIRS[name], t };
        tap.last = { name: null, t: -Infinity };
      } else {
        tap.last = { name, t };
      }
    }
    down.add(e.code);
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => down.clear());

  load();

  // One player's controls: what their keys in `set` say right now.
  function pad(set) {
    return {
      move() {
        return {
          x: (held(set, 'right') ? 1 : 0) - (held(set, 'left') ? 1 : 0),
          y: (held(set, 'down') ? 1 : 0) - (held(set, 'up') ? 1 : 0),
        };
      },
      shoot: () => held(set, 'shoot'),
      // Dunk with the ball (and let go of the rim), steal on defense.
      action: () => held(set, 'action'),
      // Pass with the ball, switch player on defense.
      pass: () => held(set, 'pass'),
      // A just-made double tap's direction ({ x, y }), once, or null. Stale ones (e.g. tapped while paused) are dropped.
      takeDash() {
        const tap = taps[set];
        const d = now() - tap.dash.t < 0.2 ? tap.dash.dir : null;
        tap.dash = { dir: null, t: -Infinity };
        return d;
      },
    };
  }
  const pads = Object.fromEntries(SETS.map((s) => [s, pad(s)]));

  return {
    settings,
    setBind,
    reset,
    save,
    keyLabel: (name, set = 'solo') => label(binds[set][name]),
    moveLabel,
    // The solo pause key (in 2 Player mode only Esc pauses: the keys belong to the players).
    isPause: (code) => !twoPlayer && isBound('solo', 'pause', code),
    setTwoPlayer(on) {
      twoPlayer = on;
    },
    pad: (set) => pads[set],
    // The solo keys, as `Input.move()` etc.
    ...pads.solo,
  };
})();
