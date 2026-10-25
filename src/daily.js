// The daily game: one short game a day, the same for everyone. Today's date seeds the game's randomness, so the
// opponent (a league team in its own colors), their AI level and upgrades, the goal and every random roll after
// tip-off start out the same on every computer, with no server (it works offline too). Fixed rules (DAILY.rules) and a
// home team with no upgrades keep it fair. The first finish each day goes on the record: the streak counts days in a
// row with the goal met. Replays are fine but don't change the day's result. Saved in 'retroball.daily'
// { days: { 'YYYY-MM-DD': { won, done, us, them } }, streak, best, lastDone }.
const DAILY = {
  rules: { freeThrows: true, halfMinutes: 1.5, shotClock: true, shotSeconds: 14, difficulty: 1 },
  aiLevel: [0.35, 0.8],   // today's opponent plays somewhere in this range
  upgrades: [2, 10],      // and has this many upgrade levels per player
  goalTier: 1,            // goals come from the career's Medium challenges, scaled to the game's length
  keepDays: 60,           // how many days of results stay saved
};
const DAILY_STORAGE_KEY = 'retroball.daily';

const Daily = (() => {
  const realRandom = Math.random;

  // Today's date where the player is, e.g. '2026-10-25'.
  function today(d = new Date()) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return h >>> 0;
  }

  // A small, fast seeded generator (mulberry32).
  function seeded(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // What today's game is, from the date alone: { date, opp (a league team), aiLevel, upgrades, goal }.
  function card(date = today()) {
    const r = seeded(hash(`retroball-daily-${date}`));
    const league = Career.league;
    const opp = league[Math.floor(r() * league.length)];
    const k = (DAILY.rules.halfMinutes * 2) / 5;
    return {
      date,
      opp,
      aiLevel: lerp(DAILY.aiLevel[0], DAILY.aiLevel[1], r()),
      upgrades: Math.round(lerp(DAILY.upgrades[0], DAILY.upgrades[1], r())),
      goal: Career.challengeFor(DAILY.goalTier, Math.floor(r() * 100), k),
    };
  }

  function load() {
    const s = loadStored(DAILY_STORAGE_KEY) || {};
    const days = {};
    for (const [d, v] of Object.entries(s.days || {})) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(d) && v && typeof v === 'object') days[d] = { won: !!v.won, done: !!v.done, us: v.us | 0, them: v.them | 0 };
    }
    const n = (v) => (Number.isInteger(v) && v > 0 ? v : 0);
    return { days, streak: n(s.streak), best: n(s.best), lastDone: typeof s.lastDone === 'string' ? s.lastDone : null };
  }
  const rec = load();

  // newGame: the day's seed drives every random roll from here on (restore() puts the real one back).
  function seed() {
    Math.random = seeded(hash(`retroball-daily-game-${today()}`));
  }

  function restore() {
    Math.random = realRandom;
  }

  // For newGame, the same shape as Career.setup.
  function setup() {
    const c = card();
    return {
      abbrs: ['HOME', c.opp.abbr],
      kit: { jersey: c.opp.jersey, shorts: c.opp.shorts, shoe: c.opp.shorts, laces: c.opp.jersey },
      aiLevel: c.aiLevel,
      upgrades: c.upgrades,
      teammateLevel: null,
      challenge: c.goal,
    };
  }

  // The home team for the daily game: the user's names, no upgrades (everyone plays the same game).
  function team(names) {
    return names.map((t) => ({ name: t.name, upgrades: cleanLevels(null) }));
  }

  // The final buzzer: today's first finish goes on the record. Returns what the final screen shows.
  function finish(game) {
    const date = today();
    const [us, them] = game.score;
    const done = Career.challengeState(game.challenge, game).done;
    const first = !rec.days[date];
    if (first) {
      rec.days[date] = { won: us > them, done, us, them };
      if (done) {
        const y = new Date();
        y.setDate(y.getDate() - 1);
        rec.streak = rec.lastDone === today(y) ? rec.streak + 1 : 1;
        rec.lastDone = date;
        rec.best = Math.max(rec.best, rec.streak);
      } else {
        rec.streak = 0;
      }
      const keep = Object.keys(rec.days).sort().slice(-DAILY.keepDays);
      for (const d of Object.keys(rec.days)) if (!keep.includes(d)) delete rec.days[d];
      saveStored(DAILY_STORAGE_KEY, rec);
    }
    return { goal: Career.challengeText(game.challenge), done, first, streak: rec.streak, best: rec.best };
  }

  // Leaving today's game before the buzzer, on the first try: the day goes on the record as missed (so quitting
  // can't dodge a bad game).
  function forfeit() {
    const date = today();
    if (rec.days[date]) return;
    rec.days[date] = { won: false, done: false, us: 0, them: 0 };
    rec.streak = 0;
    saveStored(DAILY_STORAGE_KEY, rec);
  }

  // For the Quick game screen: today's card and the record.
  function status() {
    const c = card();
    // A streak only lives while yesterday (or today) had the goal met.
    const y = new Date();
    y.setDate(y.getDate() - 1);
    const alive = rec.lastDone === today() || rec.lastDone === today(y);
    return { ...c, goalText: Career.challengeText(c.goal), played: rec.days[c.date] || null, streak: alive ? rec.streak : 0, best: rec.best };
  }

  return { seed, restore, setup, team, finish, forfeit, status, today };
})();
