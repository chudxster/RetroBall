// Courts: the designer's ten arenas (Proposals\RetroBall\Court Designs) as themes over the arena and floor colors,
// plus a few features: the floor's texture (planks, speckled asphalt or concrete, sport-court tiles, a checkerboard),
// an outdoor backdrop (sky and skyline instead of the stands), a night tint, glowing lines, and Finals Night's house
// lights down with a spotlight on the ball. Quick game and Practice play on the court picked on their screens (saved
// in 'retroball.court'); career plays at home on Classic Hardwood and its Final on Finals Night; everything else
// (the demo, 2 Player, the daily game) on Classic Hardwood. See setCourt and court.js.
const COURT_STORAGE_KEY = 'retroball.court';

const COURTS = [
  { id: 'classic', name: 'Classic Hardwood', colors: {} },
  {
    id: 'college', name: 'College Fieldhouse', banner: 'RETRO U', center: '#ffcd75',
    colors: { woodA: '#efb987', woodB: '#e8ad78', apron: '#29366f', paint: '#29366f', banner: '#29366f', bannerText: '#ffcd75', wallStripe: '#ffcd75' },
    shirts: ['#ffcd75', '#ffcd75', '#29366f', '#ffcd75', '#f4f4f4'],
  },
  {
    id: 'blacktop', name: 'Sunset Blacktop', floor: 'speckle', speckle: ['#566c86', '#262b44'], wear: 0.18,
    colors: { woodA: '#3a4466', woodB: '#3a4466', apron: '#333c57', paint: '#257179' },
    outdoor: { sky: ['#29366f', '#5d275d', '#b13e53', '#ef7d57'], sun: '#ffcd75', buildings: ['#1a1c2c', '#262b44'], windows: '#ffcd75', wall: '#7a4a32', fence: '#94b0c2' },
  },
  {
    id: 'neon', name: 'Neon Night', banner: 'NIGHT LEAGUE', line: '#73eff7', glow: '#41a6f6', center: '#5d275d',
    colors: {
      woodA: '#1a1c2c', woodB: '#1d2033', woodSeam: '#262b44', apron: '#0d0e16', paint: '#3a1a2c', wall: '#0d0e16',
      banner: '#0d0e16', bannerText: '#73eff7', wallStripe: '#e43b44', risers: ['#14151f', '#191a27'], seat: '#0d0e16',
    },
    shirts: ['#262b44', '#333c57', '#262b44'], flashes: true,
  },
  {
    id: 'rooftop', name: 'Rooftop Cage', floor: 'tiles', center: '#ffcd75', night: 0.15,
    colors: { woodA: '#3b5dc9', woodB: '#3858bf', woodSeam: '#29366f', apron: '#257179', paint: '#38b764' },
    outdoor: { sky: ['#1a1c2c', '#29366f', '#333c57'], moon: '#f4f4f4', buildings: ['#1a1c2c', '#262b44'], windows: '#73eff7', fence: '#566c86', lights: true },
  },
  {
    id: 'arcade', name: 'Arcade Floor', floor: 'checker', banner: 'INSERT COIN', line: '#ffcd75', center: '#a7f070',
    colors: { woodA: '#29366f', woodB: '#333c57', woodSeam: '#29366f', apron: '#1a1c2c', paint: '#5d275d', wall: '#1a1c2c', banner: '#1a1c2c', bannerText: '#ffcd75', wallStripe: '#a7f070', risers: ['#262b44', '#1a1c2c'] },
    shirts: ['#e43b44', '#3b5dc9', '#38b764', '#ef7d57', '#5d275d', '#257179'],
  },
  {
    id: 'oldschool', name: 'Old School Gym', banner: 'GO WILDCATS', line: '#1a1c2c', noPaint: true, center: '#b13e53', density: 0.3,
    colors: {
      woodA: '#efb987', woodB: '#e8ad78', woodSeam: '#d99c66', apron: '#e8ad78', wall: '#94b0c2', banner: '#b13e53',
      bannerText: '#f4f4f4', wallStripe: '#b13e53', risers: ['#c98d5a', '#b67d4e'], seat: '#8f563b',
    },
  },
  {
    id: 'park', name: 'Park Afternoon', floor: 'speckle', speckle: ['#a9c1d1', '#7d93a6'], center: '#ffcd75',
    colors: { woodA: '#94b0c2', woodB: '#94b0c2', apron: '#38b764', paint: '#ef7d57' },
    outdoor: { sky: ['#41a6f6', '#73eff7'], sun: '#ffcd75', trees: ['#257179', '#38b764'], fence: '#566c86' },
  },
  {
    id: 'throwback', name: 'Throwback 77', banner: 'RETRO 77', center: '#29366f',
    colors: { woodA: '#d99c66', woodB: '#c98d5a', woodSeam: '#b86f50', apron: '#ef7d57', paint: '#ffcd75', wall: '#5a3524', banner: '#5a3524', bannerText: '#ffcd75', wallStripe: '#ef7d57', risers: ['#5a3524', '#6b402b'] },
    shirts: ['#7a4a32', '#ef7d57', '#ffcd75', '#b13e53'],
  },
  {
    // The career Final's court (not picked for casual games).
    id: 'finals', name: 'Finals Night', banner: 'THE FINALS', line: '#ffcd75', center: '#1a1c2c', careerOnly: true, spotlight: true, flashes: true,
    colors: { woodA: '#d99c66', woodB: '#cf935e', apron: '#1a1c2c', paint: '#1a1c2c', wall: '#0d0e16', banner: '#1a1c2c', bannerText: '#ffcd75', wallStripe: '#ffcd75', risers: ['#1a1c2c', '#20263b'] },
    shirts: ['#262b44', '#333c57'],
  },
];
const courtById = (id) => COURTS.find((c) => c.id === id) || COURTS[0];

// The court in play (court.js draws it), and the arena colors before any theme.
let court = COURTS[0];
const COURT_BASE_COLORS = Object.fromEntries(
  ['woodA', 'woodB', 'woodSeam', 'apron', 'paint', 'wall', 'banner', 'bannerText', 'wallStripe', 'risers', 'seat'].map((k) => [k, COLORS[k]]),
);

function setCourt(theme) {
  court = theme;
  Object.assign(COLORS, COURT_BASE_COLORS, theme.colors);
}

// The court picked for casual games (Quick game and Practice).
const Courts = (() => {
  const saved = loadStored(COURT_STORAGE_KEY);
  let picked = courtById(saved && saved.id);
  if (picked.careerOnly) picked = COURTS[0];
  const choices = COURTS.filter((c) => !c.careerOnly);

  function step(dir) {
    const i = choices.indexOf(picked);
    picked = choices[(i + dir + choices.length) % choices.length];
    saveStored(COURT_STORAGE_KEY, { id: picked.id });
  }

  // Where a game in `mode` is played (newGame): your pick in casual games, Finals Night for the career Final.
  function forMode(mode) {
    if (mode === '3v3' || mode === 'free' || mode === 'world') return picked;
    if (mode === 'career') {
      const next = Career.next();
      return next && next.label === 'FINAL' ? courtById('finals') : COURTS[0];
    }
    return COURTS[0];
  }

  return { step, forMode, picked: () => picked };
})();
