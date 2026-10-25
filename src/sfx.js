// Sound effects, all made on the spot with Web Audio (oscillators and noise): no sound files, so nothing to license
// and nothing to load, and it works from file:// too. Sfx.play(name, { x, vol }) plays one: `x` (a world x) pans it
// toward that side of the screen, `vol` (0..1) scales it. Browsers only allow sound after the player clicks or
// presses a key, so the first one starts the audio. Settings (Sound on/off, volume) are in the UI tab.
const SOUND_STORAGE_KEY = 'retroball.sound';
const DEFAULT_SOUND = { on: true, volume: 0.7 };

const Sfx = (() => {
  const prefs = loadPrefs(SOUND_STORAGE_KEY, DEFAULT_SOUND);
  let ac = null;     // the AudioContext, made on the first click or key press
  let out = null;    // master gain
  let noise = null;  // 1 s of white noise, shared by every noisy sound
  let quiet = 1;     // extra volume factor (the demo behind the main menu plays quieter)
  let noiseAt = 0;
  const lastAt = {}; // when each sound last played, so a burst of the same one (rim rattles) doesn't stack up

  function unlock() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ac = new AC();
      out = ac.createGain();
      out.connect(ac.destination);
      // The noise comes from its own little generator, not Math.random, so sound never changes the game's dice.
      noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
      const data = noise.getChannelData(0);
      let s = 1;
      for (let i = 0; i < data.length; i++) {
        s = (s * 16807) % 2147483647;
        data[i] = (s / 2147483647) * 2 - 1;
      }
      syncVolume();
    }
    if (ac.state === 'suspended') ac.resume();
  }
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  // Every button in the pause menu and the main menu clicks.
  document.addEventListener('click', (e) => {
    if (e.target instanceof Element && e.target.closest('#menu button, #title button')) play('click');
  });

  function syncVolume() {
    if (out) out.gain.value = prefs.on ? prefs.volume * prefs.volume : 0; // squared: the slider feels even
  }

  // Building blocks. Each schedules itself from `t` (seconds, AudioContext time) into `dest`.
  // A tone sliding from f0 to f1 Hz over `len` seconds, fading out.
  function tone(dest, t, { type = 'square', f0, f1 = f0, len, vol = 0.3, attack = 0.004 }) {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(f1, 1), t + len);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + len + 0.02);
  }

  // A burst of filtered noise ('lowpass', 'highpass' or 'bandpass' at `freq`, sliding to `freq1`), fading in over
  // `attack` and out by `len`.
  function hiss(dest, t, { filter = 'bandpass', freq, freq1 = freq, q = 1, len, vol = 0.3, attack = 0.003 }) {
    const src = ac.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ac.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (freq1 !== freq) f.frequency.exponentialRampToValueAtTime(freq1, t + len);
    f.Q.value = q;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(f).connect(g).connect(dest);
    noiseAt = (noiseAt + 0.37) % 0.5; // start somewhere new in the noise each time
    src.start(t, noiseAt);
    src.stop(t + len + 0.02);
  }

  // Every sound: how to make it, and the shortest gap before it can play again.
  const SOUNDS = {
    // A career challenge met: a quick rising arpeggio with a sparkle on top.
    goal: { gap: 1, make: (d, t, v) => {
      [523, 659, 784, 1047].forEach((f, i) => tone(d, t + i * 0.07, { type: 'square', f0: f, len: 0.12, vol: 0.1 * v }));
      tone(d, t + 0.28, { type: 'triangle', f0: 2093, f1: 2637, len: 0.3, vol: 0.12 * v });
    } },
    // The ball on the hardwood: a dribble, or a loose ball bouncing.
    dribble: { gap: 0.05, make: (d, t, v) => {
      tone(d, t, { type: 'sine', f0: 150, f1: 55, len: 0.09, vol: 0.5 * v });
      hiss(d, t, { filter: 'lowpass', freq: 900, len: 0.03, vol: 0.15 * v });
    } },
    // Off the rim: a metallic clank.
    rim: { gap: 0.08, make: (d, t, v) => {
      tone(d, t, { type: 'square', f0: 620, f1: 560, len: 0.16, vol: 0.12 * v });
      tone(d, t, { type: 'triangle', f0: 1240, f1: 1180, len: 0.22, vol: 0.12 * v });
      hiss(d, t, { filter: 'highpass', freq: 2500, len: 0.04, vol: 0.15 * v });
    } },
    // Off the backboard: a flat thud.
    board: { gap: 0.08, make: (d, t, v) => {
      tone(d, t, { type: 'triangle', f0: 240, f1: 140, len: 0.1, vol: 0.3 * v });
      hiss(d, t, { filter: 'bandpass', freq: 700, len: 0.06, vol: 0.2 * v });
    } },
    // Through the net (a swish is cleaner and longer).
    net: { gap: 0.1, make: (d, t, v) => {
      hiss(d, t, { filter: 'highpass', freq: 2200, freq1: 4000, len: 0.22, vol: 0.22 * v, attack: 0.03 });
    } },
    swish: { gap: 0.1, make: (d, t, v) => {
      hiss(d, t, { filter: 'highpass', freq: 3000, freq1: 6000, len: 0.35, vol: 0.3 * v, attack: 0.05 });
      tone(d, t + 0.05, { type: 'sine', f0: 1800, f1: 2400, len: 0.12, vol: 0.04 * v });
    } },
    // The shot leaving the hands, and a pass.
    shot: { gap: 0.05, make: (d, t, v) => {
      hiss(d, t, { filter: 'bandpass', freq: 600, freq1: 1500, q: 2, len: 0.12, vol: 0.12 * v, attack: 0.02 });
    } },
    pass: { gap: 0.05, make: (d, t, v) => {
      hiss(d, t, { filter: 'bandpass', freq: 1200, freq1: 500, q: 2, len: 0.1, vol: 0.15 * v, attack: 0.01 });
      tone(d, t + 0.08, { type: 'sine', f0: 160, f1: 90, len: 0.05, vol: 0.25 * v });
    } },
    // A dash: a quick rising whoosh.
    dash: { gap: 0.1, make: (d, t, v) => {
      hiss(d, t, { filter: 'bandpass', freq: 400, freq1: 1800, q: 3, len: 0.14, vol: 0.12 * v, attack: 0.02 });
    } },
    // Defense: a steal (quick rising blips), a block or a stuffed dunk (a hard smack).
    steal: { gap: 0.1, make: (d, t, v) => {
      tone(d, t, { f0: 520, len: 0.05, vol: 0.12 * v });
      tone(d, t + 0.05, { f0: 780, len: 0.08, vol: 0.12 * v });
    } },
    block: { gap: 0.1, make: (d, t, v) => {
      tone(d, t, { type: 'square', f0: 300, f1: 70, len: 0.14, vol: 0.2 * v });
      hiss(d, t, { filter: 'lowpass', freq: 2000, freq1: 300, len: 0.12, vol: 0.35 * v });
    } },
    // A dunk: a deep boom with the rim ringing.
    dunk: { gap: 0.2, make: (d, t, v) => {
      tone(d, t, { type: 'sine', f0: 110, f1: 35, len: 0.4, vol: 0.7 * v });
      hiss(d, t, { filter: 'lowpass', freq: 1800, freq1: 200, len: 0.25, vol: 0.45 * v });
      tone(d, t, { type: 'triangle', f0: 560, f1: 500, len: 0.35, vol: 0.1 * v });
    } },
    // A shattered rim: a crash and glassy tinkles.
    shatter: { gap: 0.5, make: (d, t, v) => {
      hiss(d, t, { filter: 'highpass', freq: 1500, len: 0.7, vol: 0.4 * v });
      for (let i = 0; i < 10; i++) {
        const f = 2000 + ((i * 1597) % 2400);
        tone(d, t + i * 0.045, { type: 'sine', f0: f, len: 0.18, vol: 0.06 * v });
      }
    } },
    // The ref's whistle (fouls, shot clock) and the horn (end of a period).
    whistle: { gap: 0.3, make: (d, t, v) => {
      tone(d, t, { type: 'sine', f0: 2900, len: 0.18, vol: 0.12 * v, attack: 0.01 });
      tone(d, t + 0.2, { type: 'sine', f0: 2900, f1: 2700, len: 0.4, vol: 0.12 * v, attack: 0.01 });
      tone(d, t, { type: 'sine', f0: 3050, len: 0.18, vol: 0.05 * v, attack: 0.01 });
      tone(d, t + 0.2, { type: 'sine', f0: 3050, f1: 2850, len: 0.4, vol: 0.05 * v, attack: 0.01 });
    } },
    buzzer: { gap: 0.5, make: (d, t, v) => {
      tone(d, t, { type: 'sawtooth', f0: 196, len: 0.9, vol: 0.12 * v, attack: 0.02 });
      tone(d, t, { type: 'square', f0: 199, len: 0.9, vol: 0.08 * v, attack: 0.02 });
    } },
    // An airball: a sad slide down.
    airball: { gap: 0.5, make: (d, t, v) => {
      tone(d, t, { type: 'triangle', f0: 440, f1: 220, len: 0.4, vol: 0.12 * v });
    } },
    // The crowd going up: a swell of roar, louder and longer for bigger plays (`v` is the cheer level).
    crowd: { gap: 0.3, make: (d, t, v) => {
      hiss(d, t, { filter: 'bandpass', freq: 900, freq1: 1300, q: 0.7, len: 0.6 + v * 1.6, vol: 0.25 * v, attack: 0.15 });
      hiss(d, t, { filter: 'bandpass', freq: 2400, q: 1.5, len: 0.4 + v * 1.2, vol: 0.08 * v, attack: 0.1 });
    } },
    // Menus: a click on a button, a tick when the arrow keys move between them.
    click: { gap: 0.03, make: (d, t, v) => tone(d, t, { f0: 880, f1: 660, len: 0.05, vol: 0.08 * v }) },
    tick: { gap: 0.03, make: (d, t, v) => tone(d, t, { f0: 520, len: 0.03, vol: 0.05 * v }) },
  };

  function play(name, { x = null, vol = 1 } = {}) {
    if (!ac || ac.state !== 'running' || !prefs.on || vol <= 0) return;
    const s = SOUNDS[name];
    const t = ac.currentTime;
    if (t - (lastAt[name] ?? -1) < s.gap) return;
    lastAt[name] = t;
    let dest = out;
    if (x !== null && ac.createStereoPanner) {
      const pan = ac.createStereoPanner();
      pan.pan.value = clamp((x - camera.x) / SOUND.panRange, -1, 1) * SOUND.panMax;
      pan.connect(out);
      dest = pan;
    }
    s.make(dest, t, clamp(vol, 0, 1) * quiet);
  }

  return {
    play,
    prefs,
    save() {
      saveStored(SOUND_STORAGE_KEY, prefs);
      syncVolume();
    },
    setQuiet(k) {
      quiet = k;
    },
  };
})();
