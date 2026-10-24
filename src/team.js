// The two 3-player teams. Home (team 0) is the user's side and attacks the right hoop; away (team 1) attacks the
// left. Home player 0 is the user's own customized player; everyone else gets a skin, hair and number from the
// roster below, wearing their team's colors: home in the user's colors, away in the inverse.
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

function attackHoop(team) {
  return team === 0 ? HOOPS[1] : HOOPS[0];
}

// The hoop a shot or dunk goes at: in free shot mode, whichever is nearer.
function shotHoop(game, p) {
  return game.mode === 'free' ? nearestHoop(p.x) : attackHoop(p.team);
}

function defendHoop(team) {
  return attackHoop(1 - team);
}

function playerLook(look, team, role) {
  const kit = team === 0
    ? { jersey: look.jersey, shorts: look.shorts, shoe: look.shoe, laces: look.laces }
    : { jersey: invertColor(look.jersey), shorts: invertColor(look.shorts), shoe: invertColor(look.shoe), laces: invertColor(look.laces) };
  return { ...look, ...(ROSTER[team][role] || {}), ...kit };
}

function makePlayers(look) {
  const players = [];
  for (let team = 0; team < 2; team++) {
    for (let role = 0; role < ROSTER[team].length; role++) {
      const p = new Player({ x: 0, y: 0, look: playerLook(look, team, role) });
      p.team = team;
      p.role = role;
      players.push(p);
    }
  }
  return players;
}

// Re-dress everyone after the user changes their look (team colors follow the user's kit).
function setTeamLooks(players, look) {
  for (const p of players) p.setLook(playerLook(look, p.team, p.role));
}

// Lined up for a jump ball: each team on its own half (the half it defends), the first player by the circle.
function formationSpot(team, role) {
  const side = team === 0 ? -1 : 1;
  const cx = COURT.length / 2;
  const cy = COURT.width / 2;
  const spots = [[COURT.circleR + 4, 0], [80, -70], [80, 70]];
  const [dx, dy] = spots[role];
  return { x: cx + side * dx, y: cy + dy };
}

// An AI tuning value blended between its [easy, hard] ends: the opponents use the AI level from the Test panel,
// the user's teammates a fixed one.
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
