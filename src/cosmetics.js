// Cosmetics: gear and looks unlocked by trophies (the designer's set in Proposals\RetroBall\Cosmetic Designs, all but
// Celebrations). Each item has a style per metal of its trophy family, unlocked when that metal is reached; the rim
// and net pack unlocks all at once with the Demolition secret, and the Brick ball with Brick Mason. Worn gear (the
// headband and wristbands, the sleeve, the goggles) is per player; the shoe line and the Showtime kit are the team's;
// the ball, the dunk trail, the rafters banner and the rim are settings for your games. Picked in the Gear tab,
// saved in 'retroball.gear' { band: [i, i, i], sleeve: [...], goggles: [...], shoes, kit, ball, trail, banner, rim }
// (style indexes, or null for none). Nothing shows in the AI demo behind the main menu.
const GEAR_STORAGE_KEY = 'retroball.gear';

const COSMETICS = [
  { id: 'band', name: 'Headband', family: 'steals', per: 'player', styles: TROPHY_TIERS.map((t) => ({ name: t.name, color: t.color })) },
  {
    id: 'sleeve', name: 'Sleeve', family: 'shots', per: 'player',
    styles: [
      { name: 'Black', color: '#333c57' },
      { name: 'White', color: '#f4f4f4' },
      { name: 'Gold', color: '#ffcd75' },
      { name: 'Platinum', color: '#73eff7' },
    ],
  },
  {
    id: 'goggles', name: 'Goggles', family: 'blocks', per: 'player',
    styles: [
      { name: 'Bronze', frame: '#b86f50', strap: '#b86f50', lens: '#b3f2f6' },
      { name: 'Silver', frame: '#c0cbdc', strap: '#566c86', lens: '#b3f2f6' },
      { name: 'Gold', frame: '#ffcd75', strap: '#ef7d57', lens: '#b3f2f6' },
      { name: 'Platinum', frame: '#73eff7', strap: '#29366f', lens: '#41a6f6', mirror: true },
    ],
  },
  {
    id: 'shoes', name: 'Shoes', family: 'dashes', per: 'team',
    styles: [
      { name: 'Court', upper: '#f4f4f4', accent: '#b86f50', sole: '#94b0c2' },
      { name: 'Storm', upper: '#c0cbdc', accent: '#3b5dc9', sole: '#566c86' },
      { name: 'Sunrise', upper: '#ffcd75', accent: '#ef7d57', sole: '#b13e53' },
      { name: 'Neon', upper: '#29366f', accent: '#73eff7', sole: '#f4f4f4', glow: '#73eff7' },
    ],
  },
  {
    // Collected piece by piece: each style has the ones before it.
    id: 'kit', name: 'Showtime kit', family: 'passes', per: 'team',
    styles: [
      { name: 'Tube socks', tube: true },
      { name: 'Short shorts', tube: true, short: true },
      { name: 'Home kit', tube: true, short: true, jersey: '#ffcd75', trim: '#5d275d', stripe: '#f4f4f4' },
      { name: 'Road kit', tube: true, short: true, jersey: '#5d275d', trim: '#ffcd75', stripe: '#f4f4f4' },
    ],
  },
  {
    id: 'ball', name: 'Ball', family: 'threes', per: 'game',
    styles: [
      { name: 'Leather', ball: '#d99c66', seam: '#5a3524', shade: '#b86f50' },
      { name: 'Midnight', ball: '#333c57', seam: '#73eff7', shade: '#262b44' },
      { name: 'ABA', ball: '#f4f4f4', seam: '#29366f', shade: '#c0cbdc', panels: ['#e43b44', '#f4f4f4', '#3b5dc9'] },
      { name: 'Platinum', ball: '#73eff7', seam: '#257179', shade: '#41a6f6' },
      { name: 'Brick', secret: 'bricks', ball: '#b13e53', seam: '#c7cfdd', shade: '#8a2f40', brick: true },
    ],
  },
  {
    id: 'trail', name: 'Dunk trail', family: 'dunks', per: 'game',
    styles: [
      { name: 'Dust', colors: ['#c0cbdc', '#94b0c2'], size: 3, life: 0.3 },
      { name: 'Streak', colors: ['#f4f4f4', '#73eff7'], size: 2, life: 0.35, lines: true },
      { name: 'Fire', colors: ['#f4f4f4', '#ffcd75', '#ef7d57', '#b13e53', '#566c86'], size: 5, life: 0.45 },
      { name: 'Plasma', colors: ['#f4f4f4', '#73eff7', '#41a6f6', '#3b5dc9', '#29366f'], size: 5, life: 0.45, sparks: true },
    ],
  },
  {
    id: 'banner', name: 'Rafters banner', family: 'games', per: 'game',
    styles: [{ name: 'Pennant' }, { name: 'Banner' }, { name: 'Gold banner' }, { name: 'Retired jersey' }],
  },
  {
    id: 'rim', name: 'Rim and net', secret: 'demolition', per: 'game',
    styles: [
      { name: 'Team', rim: 'team', net: '#f4f4f4', net2: 'team' },
      { name: 'Gold', rim: '#ffcd75', rimBack: '#b86f50', net: '#ffcd75', net2: '#f4f4f4' },
      { name: 'Chain', rim: '#94b0c2', rimBack: '#566c86', net: '#c0cbdc', net2: '#566c86' },
      { name: 'Cracked', rim: COLORS.rim, rimBack: COLORS.rimBack, net: COLORS.net, net2: COLORS.net, crack: '#94b0c2' },
    ],
  },
];

const Cosmetics = (() => {
  const byId = Object.fromEntries(COSMETICS.map((c) => [c.id, c]));
  const saved = loadStored(GEAR_STORAGE_KEY) || {};
  const index = (v, item) => (Number.isInteger(v) && v >= 0 && v < item.styles.length ? v : null);
  const picks = {};
  for (const item of COSMETICS) {
    picks[item.id] = item.per === 'player'
      ? [0, 1, 2].map((i) => index(Array.isArray(saved[item.id]) ? saved[item.id][i] : null, item))
      : index(saved[item.id], item);
  }
  let everything = false; // the Testing tab's "All gear": every style unlocked, for this visit

  const save = () => saveStored(GEAR_STORAGE_KEY, picks);

  // Whether style `i` of `id` is unlocked: its metal reached (or the item's / style's secret earned).
  function unlocked(id, i) {
    if (everything) return true;
    const item = byId[id];
    const style = item.styles[i];
    if (style.secret) return Trophies.hasSecret(style.secret);
    if (item.secret) return Trophies.hasSecret(item.secret);
    return Trophies.metalOf(item.family) >= i;
  }

  // The style worn / used (player items for player `role`), or null. A style that's locked (e.g. a save from
  // another browser) isn't used.
  function pick(id, role = 0) {
    const item = byId[id];
    const i = item.per === 'player' ? picks[id][role] : picks[id];
    return i !== null && unlocked(id, i) ? item.styles[i] : null;
  }

  // Step the pick through none and the unlocked styles.
  function step(id, role, dir) {
    const item = byId[id];
    const options = [null, ...item.styles.map((_, i) => i).filter((i) => unlocked(id, i))];
    const now = item.per === 'player' ? picks[id][role] : picks[id];
    const at = Math.max(0, options.indexOf(now));
    const next = options[(at + dir + options.length) % options.length];
    if (item.per === 'player') picks[id][role] = next;
    else picks[id] = next;
    save();
  }

  // What player `role` of the user's team wears: { band, sleeve, goggles, shoes, kit } (each a style or null).
  function gearFor(role) {
    return { band: pick('band', role), sleeve: pick('sleeve', role), goggles: pick('goggles', role), shoes: pick('shoes'), kit: pick('kit') };
  }

  // For the Gear tab: the item, what's picked, and what unlocks the next style.
  function row(id, role) {
    const item = byId[id];
    const style = pick(id, role);
    const open = item.styles.filter((_, i) => unlocked(id, i)).length;
    let hint;
    if (item.secret) {
      hint = open ? 'From the secret Demolition trophy' : 'Locked: a secret trophy';
    } else {
      const fam = TROPHY_FAMILIES.find((f) => f.id === item.family);
      const metal = everything ? 3 : Trophies.metalOf(item.family);
      hint = metal >= 3 ? `${fam.name}: all unlocked` : `Next at ${fam.name} ${TROPHY_TIERS[metal + 1].name.toLowerCase()} (${fam.tiers[metal + 1]} ${fam.what})`;
    }
    return { item, value: style ? style.name : open ? 'None' : 'Locked', open, hint };
  }

  return { pick, step, gearFor, row, unlockAll: () => { everything = true; }, items: COSMETICS };
})();
