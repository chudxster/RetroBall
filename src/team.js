// The two 3-player teams. Home (team 0) is the user's side and attacks the right hoop; away (team 1) attacks the
// left. Home player 0 is the user's own customized player; the other home players start from the skin, hair and
// number below and can be customized too (loadTeam); the away team uses theirs. Everyone wears their team's colors:
// home in the user's kit, away in the inverse.
const ROSTER = [
  [
    null, // the user's look
    { skin: SKINS[0], hairStyle: 'buzz', hair: '#7a4a32', number: '7' },
    { skin: SKINS[4], hairStyle: 'afro', hair: '#1a1c2c', number: '11' },
  ],
  [
    { skin: SKINS[3], hairStyle: 'short', hair: '#1a1c2c', number: '3' },
    { skin: SKINS[1], hairStyle: 'mohawk', hair: '#ffcd75', number: '30' },
    { skin: SKINS[2], hairStyle: 'long', hair: '#5d275d', number: '0' },
  ],
];

// Which end each team attacks: home starts on the right hoop; after halftime the teams switch (see Clock).
let endsSwapped = false;

function attackHoop(team) {
  return (team === 0) !== endsSwapped ? HOOPS[1] : HOOPS[0];
}

// The hoop a shot or dunk goes at: in free shot mode, whichever is nearer.
function shotHoop(game, p) {
  return game.mode === 'free' ? nearestHoop(p.x) : attackHoop(p.team);
}

function defendHoop(team) {
  return attackHoop(1 - team);
}

// `look` is the user's player's look (and the home kit); `home` is the user's team (loadTeam), whose players 2 and
// 3 have their own skin, hair and number.
function playerLook(look, team, role, home) {
  const kit = Object.fromEntries(LOOK_KIT_KEYS.map((k) => [k, team === 0 ? look[k] : invertColor(look[k])]));
  const own = team === 0 ? home[role].look : ROSTER[team][role];
  return { ...look, ...(own || {}), ...kit };
}

function makePlayers(look, home) {
  const players = [];
  for (let team = 0; team < 2; team++) {
    for (let role = 0; role < ROSTER[team].length; role++) {
      const p = new Player({ x: 0, y: 0, look: playerLook(look, team, role, home) });
      p.team = team;
      p.role = role;
      players.push(p);
    }
  }
  return players;
}

// `total` upgrade levels spread at random over the stats (none past UPGRADES.max). The AI never dashes, so dash
// gets none.
function randomUpgrades(total) {
  const levels = { speed: 0, shooting: 0, dunking: 0, defense: 0, dash: 0 };
  const keys = ['speed', 'shooting', 'dunking', 'defense'];
  for (let n = Math.min(total, keys.length * UPGRADES.max); n > 0; n--) {
    const open = keys.filter((k) => levels[k] < UPGRADES.max);
    levels[open[Math.floor(Math.random() * open.length)]]++;
  }
  return levels;
}

// The user's team plays with the levels set for each of them; every opponent gets as many levels as the home
// player in the same spot, at random.
function rollAIUpgrades(players, team) {
  for (const p of players) {
    if (p.team === 0) {
      p.upgrades = team[p.role].upgrades;
      continue;
    }
    const total = Object.values(team[p.role].upgrades).reduce((a, b) => a + b, 0);
    p.upgrades = randomUpgrades(total);
  }
}

// Re-dress everyone after the user changes a look (team colors follow the user's kit).
function setTeamLooks(players, look, home) {
  for (const p of players) p.setLook(playerLook(look, p.team, p.role, home));
}

// Lined up for a jump ball: each team on its own half (the half it defends), the first player by the circle.
function formationSpot(team, role) {
  const side = attackHoop(team).dir; // the half away from the hoop they attack
  const cx = COURT.length / 2;
  const cy = COURT.width / 2;
  const spots = [[COURT.circleR + 4, 0], [80, -70], [80, 70]];
  const [dx, dy] = spots[role];
  return { x: cx + side * dx, y: cy + dy };
}

// An AI tuning value blended between its [easy, hard] ends: the opponents use the AI level (a testing slider
// in the Gamemode tab), the user's teammates a fixed one.
function aiValue(p, [easy, hard]) {
  return lerp(easy, hard, p.team === 0 ? AI.teammateLevel : AI.level);
}

function teammates(game, p) {
  return game.players.filter((q) => q.team === p.team && q !== p);
}

function opponents(game, p) {
  return game.players.filter((q) => q.team !== p.team);
}

// Distance on the floor.
function courtDist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// How much room a player has: distance to the nearest opponent.
function openness(game, p) {
  let best = Infinity;
  for (const q of opponents(game, p)) best = Math.min(best, courtDist(p, q));
  return best;
}
