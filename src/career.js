// Career mode: seasons in a league of named AI teams. Every team plays every other once (a round robin), the top
// CAREER.playoffTeams go on to semifinals and a final, then a new season starts with the AI teams shuffled up a
// little and everyone tougher. The user's team (league index 0) has its own names and upgrade levels, bought with
// tokens earned in games. Before each game the user picks one of three challenges from different tiers; completing
// it multiplies that game's tokens. Other teams' games are simulated from their strength. Saved between visits.
const CAREER_STORAGE_KEY = 'retroball.career';

const Career = (() => {
  const LEAGUE = [
    { name: 'Sharks', abbr: 'SHK', jersey: '#41a6f6', shorts: '#29366f' },
    { name: 'Comets', abbr: 'COM', jersey: '#ffcd75', shorts: '#5d275d' },
    { name: 'Bulldogs', abbr: 'BUL', jersey: '#b13e53', shorts: '#1a1c2c' },
    { name: 'Vipers', abbr: 'VIP', jersey: '#38b764', shorts: '#1a1c2c' },
    { name: 'Titans', abbr: 'TTN', jersey: '#566c86', shorts: '#f4f4f4' },
    { name: 'Blaze', abbr: 'BLZ', jersey: '#ef7d57', shorts: '#ffcd75' },
    { name: 'Owls', abbr: 'OWL', jersey: '#5d275d', shorts: '#94b0c2' },
  ];
  const TEAM_NAME_MAX = 12;

  // Challenges by tier (CAREER.tiers), for a 5-minute game; counts and margins scale with the game's length.
  // stat: the team's stat reaches n. win / margin: win (by n or more). hold: win and keep them to n points or fewer.
  const CHALLENGES = [
    [
      { type: 'win', text: () => 'WIN THE GAME' },
      { type: 'stat', key: 'tpm', n: 2, text: (n) => `MAKE ${n} THREES` },
      { type: 'stat', key: 'stl', n: 2, text: (n) => `GET ${n} STEALS` },
      { type: 'stat', key: 'pts', n: 15, text: (n) => `SCORE ${n} POINTS` },
    ],
    [
      { type: 'margin', n: 5, text: (n) => `WIN BY ${n}+` },
      { type: 'stat', key: 'tpm', n: 4, text: (n) => `MAKE ${n} THREES` },
      { type: 'stat', key: 'stl', n: 4, text: (n) => `GET ${n} STEALS` },
      { type: 'stat', key: 'dnk', n: 2, text: (n) => `DUNK ${n} TIMES` },
      { type: 'stat', key: 'blk', n: 2, text: (n) => `BLOCK ${n} SHOTS` },
    ],
    [
      { type: 'margin', n: 10, text: (n) => `WIN BY ${n}+` },
      { type: 'stat', key: 'tpm', n: 6, text: (n) => `MAKE ${n} THREES` },
      { type: 'hold', n: 15, text: (n) => `WIN, HOLD THEM TO ${n}` },
      { type: 'stat', key: 'dnk', n: 4, text: (n) => `DUNK ${n} TIMES` },
      { type: 'stat', key: 'stl', n: 6, text: (n) => `GET ${n} STEALS` },
    ],
    [
      { type: 'margin', n: 15, text: (n) => `WIN BY ${n}+` },
      { type: 'stat', key: 'tpm', n: 9, text: (n) => `MAKE ${n} THREES` },
      { type: 'hold', n: 8, text: (n) => `WIN, HOLD THEM TO ${n}` },
      { type: 'stat', key: 'blk', n: 4, text: (n) => `BLOCK ${n} SHOTS` },
      { type: 'stat', key: 'stl', n: 8, text: (n) => `GET ${n} STEALS` },
    ],
  ];


  const shuffle = (list) => {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  };

  // How long games are compared to the 5-minute default (challenge targets and simulated scores scale with it).
  const lengthK = (rules) => (rules.halfMinutes * 2) / 5;

  // Every team plays every other once: the circle method, one list of pairs per week.
  function roundRobin(n) {
    const ids = shuffle([...Array(n).keys()]);
    const weeks = [];
    for (let r = 0; r < n - 1; r++) {
      const pairs = [];
      for (let i = 0; i < n / 2; i++) pairs.push([ids[i], ids[n - 1 - i]]);
      weeks.push(pairs);
      ids.splice(1, 0, ids.pop());
    }
    return weeks;
  }

  function fresh() {
    const strengths = shuffle(LEAGUE.map((_, i) => 0.15 + (0.7 * i) / (LEAGUE.length - 1)));
    const career = {
      season: 1,
      tokens: 0,
      titles: 0,
      teamName: 'Home',
      team: ROSTER[0].map((_, i) => ({ name: `Player ${i + 1}`, upgrades: cleanLevels(null) })),
      league: [{ strength: 0 }, ...LEAGUE.map((t, i) => ({ ...t, strength: strengths[i] }))],
      last: null,
    };
    startSeason(career);
    return career;
  }

  function startSeason(career) {
    for (const t of career.league) Object.assign(t, { w: 0, l: 0, pf: 0, pa: 0 });
    Object.assign(career, {
      week: 0,
      schedule: roundRobin(career.league.length),
      phase: 'season', // 'season', 'semis', 'final' (the user is still playing), 'over'
      playoff: null,   // { seeds, semis: [[a, b], [c, d]], final: [a, b], champion }
      result: null,    // when the season is over: 'champion', 'final', 'semis' or 'missed'
      offer: null,     // the three challenges for the next game
    });
  }

  function load() {
    const saved = loadStored(CAREER_STORAGE_KEY);
    if (!saved || !Array.isArray(saved.league) || saved.league.length !== LEAGUE.length + 1) return fresh();
    saved.team = ROSTER[0].map((_, i) => {
      const s = (saved.team && saved.team[i]) || {};
      const name = typeof s.name === 'string' ? cleanName(s.name).trim() : '';
      return { name: name || `Player ${i + 1}`, upgrades: cleanLevels(s.upgrades) };
    });
    if (typeof saved.teamName !== 'string' || !saved.teamName.trim()) saved.teamName = 'Home';
    saved.tokens = Number.isFinite(saved.tokens) ? Math.max(0, Math.floor(saved.tokens)) : 0;
    return saved;
  }

  function save() {
    saveStored(CAREER_STORAGE_KEY, c);
  }

  function teamOf(i) {
    return i === 0 ? { name: c.teamName, abbr: abbr(c.teamName) } : c.league[i];
  }

  function abbr(name) {
    return name.replace(/[^a-z0-9]/gi, '').slice(0, 3).toUpperCase() || 'YOU';
  }

  function record(i) {
    const t = c.league[i];
    return `${t.w}-${t.l}`;
  }

  // The user's next game: { opp, label }, or null when the season is over.
  function next() {
    let pair = null;
    let label = '';
    if (c.phase === 'season') {
      pair = c.schedule[c.week].find((p) => p.includes(0));
      label = `WEEK ${c.week + 1} OF ${c.schedule.length}`;
    } else if (c.phase === 'semis') {
      pair = c.playoff.semis.find((p) => p.includes(0));
      label = 'SEMIFINAL';
    } else if (c.phase === 'final') {
      pair = c.playoff.final;
      label = 'FINAL';
    }
    return pair && { opp: pair[0] === 0 ? pair[1] : pair[0], label };
  }

  // Three challenges for the next game, from three different tiers (easiest first). Kept until that game is played.
  function offer(rules) {
    if (!c.offer && next()) {
      const k = lengthK(rules);
      const tiers = shuffle([0, 1, 2, 3]).slice(0, 3).sort((a, b) => a - b);
      c.offer = tiers.map((tier) => {
        const list = CHALLENGES[tier];
        const index = Math.floor(Math.random() * list.length);
        const def = list[index];
        const n = def.n === undefined ? 0 : Math.max(1, Math.round(def.n * k));
        return { tier, index, n };
      });
      save();
    }
    return c.offer || [];
  }

  function challengeText(ch) {
    return CHALLENGES[ch.tier][ch.index].text(ch.n);
  }

  // How the challenge stands right now: { text (progress), done (would count if the game ended now) }.
  function challengeState(ch, game) {
    const def = CHALLENGES[ch.tier][ch.index];
    const [us, them] = game.score;
    switch (def.type) {
      case 'stat': {
        const v = game.stats[0][def.key];
        return { text: `${Math.min(v, ch.n)}/${ch.n}`, done: v >= ch.n };
      }
      case 'win':
        return { text: `${us}-${them}`, done: us > them };
      case 'margin':
        return { text: `${us - them >= 0 ? '+' : ''}${us - them}`, done: us - them >= ch.n };
      default:
        return { text: `THEM ${them}/${ch.n}`, done: us > them && them <= ch.n };
    }
  }

  // Picking a challenge starts the next game (main.js then sets the game up with setup()).
  function begin(choice) {
    c.current = { challenge: c.offer[choice] };
    save();
  }

  // For newGame: who's playing (abbreviations for the scoreboard), the opponent's kit, AI level and upgrade levels
  // per player, and the picked challenge.
  function setup() {
    const { opp } = next();
    const t = c.league[opp];
    const seasons = c.season - 1;
    return {
      abbrs: [abbr(c.teamName), t.abbr],
      kit: { jersey: t.jersey, shorts: t.shorts, shoe: t.shorts, laces: t.jersey },
      aiLevel: Math.min(CAREER.aiBase + CAREER.aiPerStrength * t.strength + CAREER.aiPerSeason * seasons, CAREER.aiMax),
      upgrades: Math.round(CAREER.upgradesPerStrength * t.strength + CAREER.upgradesPerSeason * seasons),
      challenge: c.current ? c.current.challenge : null,
    };
  }

  // A game between two AI teams, decided by their strength. Returns the winner.
  function simulate(a, b, k) {
    const L = c.league;
    const aWins = Math.random() < clamp(0.5 + (L[a].strength - L[b].strength) * 0.8, 0.1, 0.9);
    const high = Math.max(2, Math.round((18 + Math.random() * 14) * k));
    const low = Math.max(0, high - 1 - Math.floor(Math.random() * 10 * k));
    if (c.phase === 'season') {
      tally(a, aWins ? high : low, aWins ? low : high);
      tally(b, aWins ? low : high, aWins ? high : low);
    }
    return aWins ? a : b;
  }

  function tally(i, pf, pa) {
    const t = c.league[i];
    t.pf += pf;
    t.pa += pa;
    if (pf > pa) t.w++;
    else t.l++;
  }

  // Best record first, then point difference.
  function standings() {
    return c.league.map((t, i) => i)
      .sort((a, b) => c.league[b].w - c.league[a].w
        || (c.league[b].pf - c.league[b].pa) - (c.league[a].pf - c.league[a].pa) || a - b);
  }

  // The final buzzer of a career game: tokens, the result and the rest of the round, then on to the next game.
  // Returns the summary the game-over screen shows.
  function finish(game) {
    const { opp } = next();
    const k = lengthK(game.rules);
    const [us, them] = game.score;
    const won = us > them;
    const ch = c.current ? c.current.challenge : null;
    const done = !!ch && challengeState(ch, game).done;
    const resultMult = won ? CAREER.winMult : CAREER.lossMult;
    const challengeMult = done ? CAREER.tiers[ch.tier].mult : 1;
    const tokens = Math.ceil(us * resultMult * challengeMult - 1e-9);
    c.tokens += tokens;
    c.last = { opp, us, them, won, points: us, resultMult, challenge: ch && challengeText(ch), tier: ch && ch.tier, done, challengeMult, tokens };

    if (c.phase === 'season') {
      tally(0, us, them);
      tally(opp, them, us);
      for (const [a, b] of c.schedule[c.week]) if (a !== 0 && b !== 0) simulate(a, b, k);
      c.week++;
      if (c.week >= c.schedule.length) startPlayoffs(k);
    } else if (c.phase === 'semis') {
      const other = c.playoff.semis.find((p) => !p.includes(0));
      const otherWinner = simulate(other[0], other[1], k);
      if (won) {
        c.playoff.final = [0, otherWinner];
        c.phase = 'final';
      } else {
        c.playoff.champion = simulate(opp, otherWinner, k);
        endSeason('semis');
      }
    } else if (c.phase === 'final') {
      c.playoff.champion = won ? 0 : opp;
      if (won) c.titles++;
      endSeason(won ? 'champion' : 'final');
    }
    c.current = null;
    c.offer = null;
    save();
    return c.last;
  }

  function startPlayoffs(k) {
    const seeds = standings().slice(0, CAREER.playoffTeams);
    c.playoff = { seeds, semis: [[seeds[0], seeds[3]], [seeds[1], seeds[2]]], final: null, champion: null };
    if (seeds.includes(0)) {
      c.phase = 'semis';
      return;
    }
    const [a, b] = c.playoff.semis.map(([x, y]) => simulate(x, y, k));
    c.playoff.final = [a, b];
    c.playoff.champion = simulate(a, b, k);
    endSeason('missed');
  }

  function endSeason(result) {
    c.phase = 'over';
    c.result = result;
  }

  // Next season: AI teams drift stronger or weaker, the schedule is redrawn.
  function nextSeason() {
    c.season++;
    for (const t of c.league.slice(1)) t.strength = clamp(t.strength + rand(-CAREER.strengthDrift, CAREER.strengthDrift), 0.05, 0.95);
    startSeason(c);
    save();
  }

  function restart() {
    c = fresh();
    save();
  }

  // Buying the next upgrade level for player `role`; false if it's maxed or there aren't enough tokens.
  function cost(level) {
    return CAREER.levelCost * (level + 1);
  }

  function buy(role, key) {
    const levels = c.team[role].upgrades;
    const price = cost(levels[key]);
    if (levels[key] >= UPGRADES.max || c.tokens < price) return false;
    levels[key]++;
    c.tokens -= price;
    save();
    return true;
  }

  function setTeamName(name) {
    c.teamName = String(name).replace(/\s+/g, ' ').trimStart().slice(0, TEAM_NAME_MAX);
    save();
  }

  let c = load();

  return {
    get: () => c,
    team: () => c.team,
    save,
    next,
    offer,
    challengeText,
    challengeState,
    begin,
    setup,
    finish,
    standings,
    teamOf,
    record,
    nextSeason,
    restart,
    cost,
    buy,
    setTeamName,
    TEAM_NAME_MAX,
  };
})();
