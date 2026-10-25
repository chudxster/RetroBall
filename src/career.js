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

  // "1 THREE", "2 THREES" (challenge targets shrink with shorter games, down to 1).
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 'S'}`;

  // Challenges by tier (CAREER.tiers), for a 5-minute game; counts and margins scale with the game's length.
  // stat: the team's stat reaches n. win / margin: win (by n or more). hold: win and keep them to n points or fewer.
  const CHALLENGES = [
    [
      { type: 'win', text: () => 'WIN THE GAME' },
      { type: 'stat', key: 'tpm', n: 2, text: (n) => `MAKE ${plural(n, 'THREE')}` },
      { type: 'stat', key: 'stl', n: 2, text: (n) => `GET ${plural(n, 'STEAL')}` },
      { type: 'stat', key: 'pts', n: 15, text: (n) => `SCORE ${plural(n, 'POINT')}` },
    ],
    [
      { type: 'margin', n: 5, text: (n) => `WIN BY ${n}+` },
      { type: 'stat', key: 'tpm', n: 4, text: (n) => `MAKE ${plural(n, 'THREE')}` },
      { type: 'stat', key: 'stl', n: 4, text: (n) => `GET ${plural(n, 'STEAL')}` },
      { type: 'stat', key: 'dnk', n: 2, text: (n) => `DUNK ${n === 1 ? 'ONCE' : `${n} TIMES`}` },
      { type: 'stat', key: 'blk', n: 2, text: (n) => `BLOCK ${plural(n, 'SHOT')}` },
    ],
    [
      { type: 'margin', n: 15, text: (n) => `WIN BY ${n}+` },
      { type: 'stat', key: 'tpm', n: 8, text: (n) => `MAKE ${plural(n, 'THREE')}` },
      { type: 'hold', n: 12, text: (n) => `WIN, HOLD THEM TO ${n}` },
      { type: 'stat', key: 'dnk', n: 6, text: (n) => `DUNK ${n === 1 ? 'ONCE' : `${n} TIMES`}` },
      { type: 'stat', key: 'stl', n: 8, text: (n) => `GET ${plural(n, 'STEAL')}` },
      { type: 'stat', key: 'blk', n: 4, text: (n) => `BLOCK ${plural(n, 'SHOT')}` },
    ],
    [
      { type: 'margin', n: 25, text: (n) => `WIN BY ${n}+` },
      { type: 'stat', key: 'tpm', n: 12, text: (n) => `MAKE ${plural(n, 'THREE')}` },
      { type: 'hold', n: 6, text: (n) => `WIN, HOLD THEM TO ${n}` },
      { type: 'stat', key: 'blk', n: 7, text: (n) => `BLOCK ${plural(n, 'SHOT')}` },
      { type: 'stat', key: 'stl', n: 12, text: (n) => `GET ${plural(n, 'STEAL')}` },
      { type: 'stat', key: 'dnk', n: 10, text: (n) => `DUNK ${n === 1 ? 'ONCE' : `${n} TIMES`}` },
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

  // A career game still marked as in progress (the page was closed or reloaded mid-game) is lost by forfeit.
  function load() {
    const saved = clean(loadStored(CAREER_STORAGE_KEY));
    if (!saved) return fresh();
    if (saved.current) {
      c = saved;
      forfeit();
    }
    return saved;
  }

  // A saved career made safe to use, or null if it isn't one: names and levels are cleaned, and anything
  // the season can't run without must be there and the right shape.
  function clean(saved) {
    const n = LEAGUE.length + 1;
    const isTeam = (i) => Number.isInteger(i) && i >= 0 && i < n;
    const isPair = (p) => Array.isArray(p) && p.length === 2 && p.every(isTeam);
    if (!saved || typeof saved !== 'object' || !Array.isArray(saved.league) || saved.league.length !== n) return null;
    if (!saved.league.every((t) => t && ['w', 'l', 'pf', 'pa', 'strength'].every((k) => Number.isFinite(t[k])))) return null;
    if (!Array.isArray(saved.schedule) || saved.schedule.length !== n - 1) return null;
    if (!saved.schedule.every((week) => Array.isArray(week) && week.length === n / 2 && week.every(isPair))) return null;
    if (!Number.isInteger(saved.season) || saved.season < 1 || !Number.isInteger(saved.week)) return null;
    if (!['season', 'semis', 'final', 'over'].includes(saved.phase)) return null;
    if (saved.phase === 'season' && (saved.week < 0 || saved.week >= n - 1)) return null;
    const p = saved.playoff;
    if (saved.phase !== 'season' && (!p || !Array.isArray(p.seeds) || !Array.isArray(p.semis) || !p.semis.every(isPair))) return null;
    if (saved.phase === 'final' && !isPair(p.final)) return null;
    if (p && ((p.champion !== null && p.champion !== undefined && !isTeam(p.champion)) || !(Array.isArray(p.seeds) && p.seeds.every(isTeam)))) return null;
    if (saved.phase === 'over' && !['champion', 'final', 'semis', 'missed'].includes(saved.result)) return null;
    if (saved.last && !(isTeam(saved.last.opp) && Number.isFinite(saved.last.tokens))) saved.last = null;
    if (saved.offer && !(Array.isArray(saved.offer) && saved.offer.every((o) => o && CHALLENGES[o.tier] && CHALLENGES[o.tier][o.index] && Number.isInteger(o.n)))) {
      saved.offer = null;
    }
    const cur = saved.current;
    const validChallenge = (o) => o === null || (o && CHALLENGES[o.tier] && CHALLENGES[o.tier][o.index] && Number.isInteger(o.n));
    saved.current = cur && typeof cur === 'object' && validChallenge(cur.challenge ?? null) && saved.phase !== 'over'
      ? { challenge: cur.challenge ?? null, k: Number.isFinite(cur.k) && cur.k > 0 ? cur.k : 1 }
      : null;
    saved.titles = Number.isInteger(saved.titles) && saved.titles >= 0 ? saved.titles : 0;
    for (let i = 1; i < n; i++) Object.assign(saved.league[i], LEAGUE[i - 1], { strength: clamp(saved.league[i].strength, 0.05, 0.95) });
    saved.team = ROSTER[0].map((_, i) => {
      const s = (saved.team && saved.team[i]) || {};
      const name = typeof s.name === 'string' ? cleanName(s.name).trim() : '';
      return { name: name || `Player ${i + 1}`, upgrades: cleanLevels(s.upgrades) };
    });
    if (typeof saved.teamName !== 'string' || !saved.teamName.trim()) saved.teamName = 'Home';
    saved.teamName = saved.teamName.replace(/\s+/g, ' ').trim().slice(0, TEAM_NAME_MAX);
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
      const tiers = shuffle([0, 1, 2, 3]).slice(0, 3); // in a random order
      c.offer = tiers.map((tier) => challengeFor(tier, Math.floor(Math.random() * CHALLENGES[tier].length), k));
      save();
    }
    return c.offer || [];
  }

  // Challenge `index` of `tier`, its target scaled for a game `k` times the length of a 5-minute one (the daily game
  // borrows these too).
  function challengeFor(tier, index, k) {
    const def = CHALLENGES[tier][index % CHALLENGES[tier].length];
    return { tier, index: index % CHALLENGES[tier].length, n: def.n === undefined ? 0 : Math.max(1, Math.round(def.n * k)) };
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

  // Picking a challenge starts the next game (main.js then sets the game up with setup()). The game is saved as in
  // progress, so leaving it early, even by closing the page, is a forfeit (see forfeit and load).
  function begin(choice, rules) {
    c.current = { challenge: c.offer[choice], k: lengthK(rules) };
    save();
  }

  // For newGame: who's playing (abbreviations for the scoreboard), the opponent's kit, AI level and upgrade levels
  // per player, the career team's AI teammates' level, and the picked challenge.
  function setup() {
    const { opp } = next();
    const t = c.league[opp];
    const seasons = c.season - 1;
    return {
      abbrs: [abbr(c.teamName), t.abbr],
      kit: { jersey: t.jersey, shorts: t.shorts, shoe: t.shorts, laces: t.jersey },
      aiLevel: Math.min(CAREER.aiBase + CAREER.aiPerStrength * t.strength + CAREER.aiPerSeason * seasons, CAREER.aiMax),
      upgrades: Math.round(CAREER.upgradesPerStrength * t.strength + CAREER.upgradesPerSeason * seasons),
      teammateLevel: Math.min(AI.teammateLevel + CAREER.teammatePerSeason * seasons, CAREER.aiMax),
      challenge: c.current ? c.current.challenge : null,
    };
  }

  // A game between two AI teams, decided by their strength. Returns the winner.
  function simulate(a, b, k) {
    const L = c.league;
    const aWins = Math.random() < clamp(0.5 + (L[a].strength - L[b].strength) * 0.8, 0.1, 0.9);
    const high = Math.max(2, Math.round(rand(...CAREER.simWinner) * k));
    const gap = Math.abs(L[a].strength - L[b].strength);
    const low = Math.max(0, high - Math.max(1, Math.round((rand(1, 5) + Math.random() * CAREER.simMarginPerGap * gap) * k)));
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
    settle(opp, us, them, k);
    return c.last;
  }

  // Leaving a career game before the final buzzer: a loss, 0 to CAREER.forfeitPoints (scaled by the game's length),
  // no tokens, the challenge missed. The rest of the round plays out as usual.
  function forfeit() {
    if (!c.current) return;
    const { opp } = next();
    const ch = c.current.challenge;
    const { k } = c.current;
    const them = Math.max(1, Math.round(CAREER.forfeitPoints * k));
    c.last = { opp, us: 0, them, won: false, points: 0, resultMult: 0, challenge: ch && challengeText(ch), tier: ch && ch.tier, done: false, challengeMult: 1, tokens: 0, forfeit: true };
    settle(opp, 0, them, k);
  }

  // The user's game against `opp` ended `us` to `them`: the standings, the rest of the round (other teams' games
  // simulated, scaled by game length k), and the next game or the playoffs.
  function settle(opp, us, them, k) {
    const won = us > them;
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

  let c = null;
  c = load();

  return {
    get: () => c,
    team: () => c.team,
    save,
    next,
    offer,
    challengeText,
    challengeFor,
    league: LEAGUE, // the AI teams (name, abbr, jersey, shorts)
    challengeState,
    begin,
    forfeit,
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
