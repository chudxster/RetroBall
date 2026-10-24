const Input = (() => {
  const down = new Set();

  // Keys the game owns; we stop the browser (or a parent page around an iframe) from scrolling on them.
  const GAME_KEYS = new Set([
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'KeyW', 'KeyA', 'KeyS', 'KeyD',
    'ShiftLeft', 'ShiftRight', 'Space', 'KeyE', 'KeyQ',
  ]);

  window.addEventListener('keydown', (e) => {
    // Typing in the pause menu shouldn't move the player or be blocked.
    if (e.target instanceof Element && e.target.closest('#menu')) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
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
    sprint() {
      return any('ShiftLeft', 'ShiftRight');
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
  };
})();
