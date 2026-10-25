// Trophies: counters of things the people playing do, over and over (never skill feats). Every mode counts but the
// AI demo, and in 2 Player both people feed the same shelf. Each family goes Bronze -> Silver -> Gold -> Platinum
// as its count passes the tier thresholds; SECRETS are silly hidden ones, shown as ??? until earned. A new metal
// pops up a banner and the crowd cheers. Earned trophies stand on a shelf on top of the scorer's table (UI tab
// toggle). Saved in localStorage 'retroball.trophies' { counts: { key: n }, metals: { family: tier }, secrets: { id: true } }.
const TROPHY_TIERS = [
  { name: 'BRONZE', color: '#b86f50' },
  { name: 'SILVER', color: '#c0cbdc' },
  { name: 'GOLD', color: '#ffcd75' },
  { name: 'PLATINUM', color: '#73eff7' },
];
const TROPHY_FAMILIES = [
  { id: 'shots', name: 'Shooter', what: 'shots taken', tiers: [50, 250, 1000, 5000] },
  { id: 'points', name: 'Scorer', what: 'points scored', tiers: [100, 500, 2500, 10000] },
  { id: 'threes', name: 'Long Range', what: 'threes taken', tiers: [25, 100, 500, 2000] },
  { id: 'passes', name: 'Dime Dropper', what: 'passes thrown', tiers: [50, 250, 1000, 5000] },
  { id: 'dunks', name: 'Dunker', what: 'dunks made', tiers: [10, 50, 200, 1000] },
  { id: 'steals', name: 'Pickpocket', what: 'steals', tiers: [10, 50, 200, 1000] },
  { id: 'blocks', name: 'Rim Protector', what: 'blocks', tiers: [10, 50, 200, 1000] },
  { id: 'dashes', name: 'Burst', what: 'dashes', tiers: [50, 250, 1000, 5000] },
  { id: 'freeThrows', name: 'Charity Stripe', what: 'free throws taken', tiers: [10, 50, 200, 1000] },
  { id: 'games', name: 'Iron Man', what: 'games finished', tiers: [5, 25, 100, 500] },
];
// Hidden until earned: a counter reaching `at`.
const TROPHY_SECRETS = [
  { id: 'bricks', name: 'Brick Mason', what: 'shoot 25 airballs', key: 'airballs', at: 25, color: '#a7f070' },
  { id: 'fashion', name: 'Fashion Week', what: 'press Randomize 30 times', key: 'randomize', at: 30, color: '#ef7d57' },
  { id: 'demolition', name: 'Demolition', what: 'shatter a rim', key: 'shatters', at: 1, color: '#e43b44' },
  { id: 'callcenter', name: 'Call Center', what: 'call for the ball 100 times', key: 'calls', at: 100, color: '#41a6f6' },
];
// Box-score stats that also feed a trophy counter (see countStat in team.js).
const TROPHY_STATS = { fga: 'shots', tpa: 'threes', fta: 'freeThrows', pts: 'points', dnk: 'dunks', stl: 'steals', blk: 'blocks' };
const TROPHY_STORAGE_KEY = 'retroball.trophies';
const TROPHY_TOAST_TIME = 3;

const Trophies = (() => {
  const saved = loadStored(TROPHY_STORAGE_KEY) || {};
  const counts = {};
  const metals = {};
  const secrets = {};
  const whole = (v) => (Number.isInteger(v) && v > 0 ? v : 0);
  for (const [k, v] of Object.entries(saved.counts || {})) counts[k] = whole(v);
  for (const f of TROPHY_FAMILIES) {
    const m = saved.metals && saved.metals[f.id];
    if (Number.isInteger(m) && m >= 0 && m < TROPHY_TIERS.length) metals[f.id] = m;
  }
  for (const s of TROPHY_SECRETS) if (saved.secrets && saved.secrets[s.id] === true) secrets[s.id] = true;
  const toasts = []; // [{ text, color, t }]
  let unsaved = 0;   // counts since the last save

  const save = () => saveStored(TROPHY_STORAGE_KEY, { counts, metals, secrets });

  // Whether what `p` did counts: a person's player, not the AI and not the demo. (p null: something the person did
  // outside a game, like pressing Randomize.)
  function countsFor(game, p) {
    if (!game) return true;
    if (game.mode === 'demo' || (typeof Net !== 'undefined' && Net.isGuest())) return false;
    return !p || isHuman(game, p);
  }

  function count(game, p, key, n = 1) {
    if (!countsFor(game, p) || n <= 0) return;
    counts[key] = (counts[key] || 0) + n;
    let changed = false;
    for (const f of TROPHY_FAMILIES) {
      if (f.id !== key) continue;
      const reached = f.tiers.filter((t) => counts[key] >= t).length - 1;
      if (reached > (metals[f.id] ?? -1)) {
        metals[f.id] = reached;
        announce(`${f.name.toUpperCase()}: ${TROPHY_TIERS[reached].name}`, TROPHY_TIERS[reached].color, game, p);
        changed = true;
      }
    }
    for (const s of TROPHY_SECRETS) {
      if (s.key === key && !secrets[s.id] && counts[key] >= s.at) {
        secrets[s.id] = true;
        announce(`SECRET: ${s.name.toUpperCase()}`, s.color, game, p);
        changed = true;
      }
    }
    // Counters save every so often (and on every new trophy) rather than on every shot.
    if (changed || ++unsaved >= 20) {
      unsaved = 0;
      save();
    }
  }
  window.addEventListener('pagehide', save);

  function announce(text, color, game, p) {
    toasts.push({ text: `TROPHY! ${text}`, color, t: 0 });
    if (game && game.mode !== 'demo') cheerCrowd(CROWD.hype.three, p && p.look ? p : null);
  }

  // The banner on screen right now (one at a time, in order), aged by update().
  function update(dt) {
    if (!toasts.length) return;
    toasts[0].t += dt;
    if (toasts[0].t >= TROPHY_TOAST_TIME) toasts.shift();
  }

  // What stands on the shelf: each family's metal, then the secrets earned. [{ color, secret }]
  function shelf() {
    const out = [];
    for (const f of TROPHY_FAMILIES) if (metals[f.id] !== undefined) out.push({ color: TROPHY_TIERS[metals[f.id]].color, secret: false });
    for (const s of TROPHY_SECRETS) if (secrets[s.id]) out.push({ color: s.color, secret: true });
    return out;
  }

  // For the trophy list: every family's count, metal and next goal, and the secrets (??? until earned).
  function list() {
    return {
      families: TROPHY_FAMILIES.map((f) => {
        const m = metals[f.id] ?? -1;
        return { ...f, count: counts[f.id] || 0, metal: m, next: f.tiers[m + 1] ?? null };
      }),
      secrets: TROPHY_SECRETS.map((s) => (secrets[s.id] ? { name: s.name, what: s.what, color: s.color, earned: true } : { name: '???', what: 'A secret', earned: false })),
    };
  }

  return { count, update, shelf, list, toast: () => toasts[0] || null };
})();
