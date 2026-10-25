// Locker room quests (see locker.js): the coach, your two teammates and the interviewer each hand out one quest at
// a time. A quest is a goal for your games, either in one game or added up over games (Quick game, career, the daily
// game and 2 Player co-op count; practice, versus and the demo don't). Finish it, then talk to whoever gave it to
// claim its tokens (career tokens) and a tick toward the Locker Room trophy; they hand you the next one. Saved in
// 'retroball.quests' { taken: { giver: { index, progress, done } }, next: { giver: index } }.
const QUEST_STORAGE_KEY = 'retroball.quests';

const won = (g) => g.score[0] > g.score[1];
// Each giver's quests, offered in order (then round again). game: met in one game. total: `add` per game, up to n.
const QUESTS = {
  coach: [
    { text: 'GET 5 STEALS IN ONE GAME', game: (g) => g.stats[0].stl >= 5, reward: 30 },
    { text: 'WIN, HOLD THEM UNDER 15', game: (g) => won(g) && g.score[1] < 15, reward: 40 },
    { text: 'WIN 3 CAREER GAMES', add: (g) => (g.mode === 'career' && won(g) ? 1 : 0), n: 3, reward: 60 },
    { text: 'BLOCK 3 SHOTS IN ONE GAME', game: (g) => g.stats[0].blk >= 3, reward: 40 },
    { text: 'WIN A QUICK GAME ON ALL-STAR', game: (g) => g.mode === '3v3' && difficultyOf(g.rules) === 2 && won(g), reward: 80 },
  ],
  mate1: [
    { text: 'MAKE 3 THREES IN ONE GAME', game: (g) => g.stats[0].tpm >= 3, reward: 30 },
    { text: 'MAKE 20 THREES', add: (g) => g.stats[0].tpm, n: 20, reward: 50 },
    { text: 'SCORE 25 POINTS IN ONE GAME', game: (g) => g.stats[0].pts >= 25, reward: 40 },
    { text: 'MAKE 10 FREE THROWS', add: (g) => g.stats[0].ftm, n: 10, reward: 40 },
    { text: 'MAKE 6 THREES IN ONE GAME', game: (g) => g.stats[0].tpm >= 6, reward: 70 },
  ],
  mate2: [
    { text: 'DUNK 2 TIMES IN ONE GAME', game: (g) => g.stats[0].dnk >= 2, reward: 30 },
    { text: 'DUNK 15 TIMES', add: (g) => g.stats[0].dnk, n: 15, reward: 50 },
    { text: 'WIN BY 10+', game: (g) => g.score[0] - g.score[1] >= 10, reward: 40 },
    { text: 'BLOCK 10 SHOTS', add: (g) => g.stats[0].blk, n: 10, reward: 50 },
    { text: 'DUNK 5 TIMES IN ONE GAME', game: (g) => g.stats[0].dnk >= 5, reward: 70 },
  ],
  press: [
    { text: 'PLAY TODAY\'S DAILY GAME', game: (g) => g.mode === 'daily', reward: 30 },
    { text: 'FINISH 3 GAMES', add: () => 1, n: 3, reward: 30 },
    { text: 'WIN A CAREER GAME BY 15+', game: (g) => g.mode === 'career' && g.score[0] - g.score[1] >= 15, reward: 60 },
    { text: 'SCORE 30 POINTS IN ONE GAME', game: (g) => g.stats[0].pts >= 30, reward: 60 },
    { text: 'MEET THE DAILY GOAL', game: (g) => g.mode === 'daily' && Career.challengeState(g.challenge, g).done, reward: 50 },
  ],
};
const QUEST_GIVERS = Object.keys(QUESTS);

const Quests = (() => {
  const saved = loadStored(QUEST_STORAGE_KEY) || {};
  const taken = {};
  const next = {};
  for (const giver of QUEST_GIVERS) {
    const t = saved.taken && saved.taken[giver];
    if (t && Number.isInteger(t.index) && QUESTS[giver][t.index % QUESTS[giver].length]) {
      taken[giver] = { index: t.index, progress: Number.isFinite(t.progress) ? Math.max(0, t.progress) : 0, done: !!t.done };
    }
    next[giver] = Number.isInteger(saved.next && saved.next[giver]) && saved.next[giver] >= 0 ? saved.next[giver] : 0;
  }
  const save = () => saveStored(QUEST_STORAGE_KEY, { taken, next });
  const def = (giver, index) => QUESTS[giver][index % QUESTS[giver].length];

  // What a giver has for you: { state: 'offer' | 'active' | 'done', text, reward, progress, n }.
  function status(giver) {
    const t = taken[giver];
    const q = def(giver, t ? t.index : next[giver]);
    return {
      state: !t ? 'offer' : t.done ? 'done' : 'active',
      text: q.text,
      reward: q.reward,
      progress: t ? t.progress : 0,
      n: q.n || null,
    };
  }

  function accept(giver) {
    if (taken[giver]) return;
    taken[giver] = { index: next[giver], progress: 0, done: false };
    save();
  }

  // A finished quest's reward: the tokens and the Locker Room trophy count. Returns the tokens, or 0.
  function claim(giver) {
    const t = taken[giver];
    if (!t || !t.done) return 0;
    const { reward } = def(giver, t.index);
    delete taken[giver];
    next[giver] = t.index + 1;
    Career.addTokens(reward);
    save();
    Trophies.count(null, null, 'quests');
    return reward;
  }

  // The final buzzer of a game that counts: every quest taken checks it. Newly finished ones get a banner.
  function gameOver(game) {
    if (game.mode === 'demo' || (game.mode === 'duo' && Duo.versus()) || !isFullGame(game)) return;
    let changed = false;
    for (const giver of QUEST_GIVERS) {
      const t = taken[giver];
      if (!t || t.done) continue;
      const q = def(giver, t.index);
      if (q.add) {
        const add = q.add(game);
        if (add > 0) {
          t.progress = Math.min(q.n, t.progress + add);
          changed = true;
        }
        t.done = t.progress >= q.n;
      } else {
        t.done = !!q.game(game);
      }
      if (t.done) {
        changed = true;
        Trophies.notify(`QUEST DONE! TALK TO ${Locker.nameOf(giver)}`, COLORS.good);
      }
    }
    if (changed) save();
  }

  return { status, accept, claim, gameOver };
})();
