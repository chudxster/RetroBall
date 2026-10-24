const Input = (() => {
  const down = new Set();

  // Keys the game owns; we stop the browser (or a parent page around an iframe) from scrolling on them.
  const GAME_KEYS = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'Space', 'KeyE', 'KeyQ', 'ShiftLeft', 'ShiftRight',
  ]);

  // Shift queues a dash the way the player is moving; double-tapping left or right queues one that way.
  // Either is picked up by takeDash.
  const TAP_DIRS = { KeyA: -1, ArrowLeft: -1, KeyD: 1, ArrowRight: 1 };
  let lastTap = { dir: 0, t: -Infinity };
  let dash = { dir: 0, t: -Infinity };
  const now = () => performance.now() / 1000;

  window.addEventListener('keydown', (e) => {
    // Typing in the pause menu shouldn't move the player or be blocked.
    if (e.target instanceof Element && e.target.closest('#menu')) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if ((e.code === 'ShiftLeft' || e.code === 'ShiftRight') && !e.repeat) dash = { dir: 'held', t: now() };
    const dir = TAP_DIRS[e.code];
    if (dir && !e.repeat) {
      const t = now();
      if (lastTap.dir === dir && t - lastTap.t < DASH.doubleTap) {
        dash = { dir, t };
        lastTap = { dir: 0, t: -Infinity };
      } else {
        lastTap = { dir, t };
      }
    }
    down.add(e.code);
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => down.clear());

  const any = (...codes) => codes.some((c) => down.has(c));

  return {
    move() {
      return {
        x: (any('ArrowRight', 'KeyD') ? 1 : 0) - (any('ArrowLeft', 'KeyA') ? 1 : 0),
        y: (any('ArrowDown', 'KeyS') ? 1 : 0) - (any('ArrowUp', 'KeyW') ? 1 : 0),
      };
    },
    shoot() {
      return down.has('Space');
    },
    // E: dunk with the ball (and let go of the rim), steal on defense.
    action() {
      return down.has('KeyE');
    },
    // Q: pass with the ball, switch player on defense.
    pass() {
      return down.has('KeyQ');
    },
    // A just-requested dash, once: 'held' (Shift: go the way the player is moving), -1 / 1 (double tap left /
    // right), or 0 for none. Stale ones (e.g. pressed while paused) are dropped.
    takeDash() {
      const d = now() - dash.t < 0.2 ? dash.dir : 0;
      dash = { dir: 0, t: -Infinity };
      return d;
    },
  };
})();
