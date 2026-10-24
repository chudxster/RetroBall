// Internal resolution. Everything is drawn at this size, then scaled up in whole pixels.
const VIEW_W = 640;
const VIEW_H = 360;

// Court in world units (5 units = 1 ft).
// x runs baseline to baseline (left to right), y runs far sideline to near sideline, z is height.
const COURT = {
  length: 470,
  width: 250,
  apron: 18,          // out-of-bounds floor around the court
  keyDepth: 95,
  keyHalfWidth: 40,
  circleR: 30,
  hoopX: 26,          // hoop center distance from its baseline
  threeR: 119,
  threeCornerY: 15,   // corner three distance from the sideline
};

// Where the straight corner three-point line meets the arc.
const THREE = (() => {
  const cornerOff = COURT.width / 2 - COURT.threeCornerY; // corner line's distance from the middle of the court
  const arcAngle = Math.asin(cornerOff / COURT.threeR);
  return { cornerOff, arcAngle, cornerLen: COURT.hoopX + COURT.threeR * Math.cos(arcAngle) };
})();

// Hoop geometry in world units. The left hoop's board sits boardOffset behind the rim, the pole behind the baseline.
const HOOP = {
  rimZ: 50,
  rimR: 5,
  boardOffset: 8,
  boardHalfW: 15,
  boardBottom: 46,
  boardTop: 66,
  poleOffset: 14,
  poleTop: 78,
  netDepth: 12,
  swishTime: 0.7,
  swingPerUnit: 15,   // a make swings the net back 1px per this many units of shot distance...
  maxSwing: 10,       // ...up to this many pixels
  bendStiffness: 120, // the rim is a spring: how hard it pulls back to straight...
  bendDamping: 9,     // ...and how quickly its wobble dies out
  boardFlex: 0.35,    // the whole stand flexes with the rim: board drops this many px per px of rim bend...
  poleLean: 0.4,      // ...and the pole top leans toward the court this much
  swaySettle: 6,      // how fast the rim's sideways sway settles once nobody is hanging on it
};

// Sprites are drawn bigger toward the near sideline, in steps so they don't shimmer while moving.
const DEPTH_SCALE = { far: 0.85, near: 1.15, step: 0.05 };

// Shadows are drawn opaque into one layer, then laid over the floor at this alpha so overlaps don't darken.
// Tall things (the hoops) cast their shadow offset by this much per unit of height.
const SHADOW = { alpha: 0.35, dx: 0.3, dy: 0.45 };

const BALL = {
  radius: 3,
  gravity: 520,
  bounce: 0.6,        // floor
  rimBounce: 0.45,
  boardBounce: 0.55,
  minBounce: 40,      // slower floor bounces than this stop and the ball rolls
  rollFriction: 1.5,
  substeps: 4,        // physics steps per tick so the ball can't tunnel through the rim
  growFrom: 50,       // above this height the ball is drawn bigger, as if rising toward the camera...
  growPer: 80,        // ...by +1x per this many units higher...
  growMax: 1.7,       // ...up to this size
};

const SHOT = {
  meterTimeFar: 0.65, // seconds for the meter to fill from quickRange.far out...
  meterTimeClose: 0.42, // ...down to this from quickRange.near in
  quickRange: { near: 40, far: 140 },
  jumpPerMeter: 1.4,  // jump lasts this many times the meter time
  jumpHeight: 16,
  greenCenter: 0.8,   // meter fill at the middle of the green zone
  greenMax: 0.16,     // green width at point blank...
  greenMin: 0.05,     // ...shrinking to this from deep
  greenShrink: 0.0006, // per world unit of distance from the hoop
  greenCloseBonus: 0.3, // extra green width right at the rim, fading out across closeRangeGreen
  closeRangeGreen: { near: 30, far: 80 },
  goodMargin: 0.07,   // "slightly early/late" band either side of the green
  airballFill: 0.35,  // releasing before this falls way short
  slightMakeChance: 0.5, // odds a "slightly early/late" release still goes in
  closeRange: 70,     // inside this distance, misses go off the side of the rim
  baseTime: 0.5,      // ball flight time = baseTime + distance / flightSpeed
  flightSpeed: 400,
  meterLinger: 0.9,   // seconds the meter stays up after release
  // From behind the half-court line the green is exactly this many frames (1/60 s) of the meter wide, or
  // deepFramesMax with the shooting upgrade maxed out. A green release always goes in; any mistimed one only by
  // deepLuck. Past 3/4 court (`deep` hideFrom: 0 = half court .. 1 = far baseline) the green is drawn on only some
  // shots: hideChance of the time it's still there but invisible, so it has to be timed from memory.
  deepFrames: 1,
  deepFramesMax: 2,
  deepLuck: 1 / 100,
  hideFrom: 0.5,
  hideChance: 0.5,
  // Fadeaway: shooting while holding away from the hoop jumps backwards. Harder to time, harder to contest.
  fadeAway: -0.5,     // counts as "away" when the move direction is within ~60 degrees of straight back (dot product)
  fadeDist: 22,       // world units drifted back over the jump
  fadeGreen: 0.6,     // green zone width multiplier
  fadeContest: 0.5,   // how much defenders' contests (and block odds) count against a fadeaway
  fadeLean: 3,        // px the upper body leans back
};

// Dunk key: works from baseRange standing still, plus rangePerSpeed per unit/s of speed toward the hoop.
const DUNK = {
  baseRange: 25,
  rangePerSpeed: 0.35,
  rise: 0.45,         // seconds from takeoff to the rim (plus risePerUnit for each unit of distance covered)...
  risePerUnit: 0.004,
  jumpShare: 0.35,    // ...the first part of it a quick jump to jumpPart of full height, the rest a float above the rim
  jumpPart: 0.85,
  apexHold: 0.06,     // a beat at the top, hovering slamReach short of the rim...
  slamTime: 0.12,     // ...then the slam: dropping down and forward into the rim, accelerating
  slamReach: 14,
  hang: 0.22,         // seconds on the rim...
  fall: 0.3,          // ...and back down
  height: 30,         // peak height, well above the rim before the slam
  slamSpeed: 320,     // ball speed through the rim
  slamKick: 70,       // px/s the slam knocks the rim down before it springs back
  hitStop: 0.07,      // the whole game freezes this long on impact
  shake: 0.35,        // seconds of camera shake
  bend: 2,            // px the rim bends under a normal dunk
  hangChance: 0.05,   // odds of a rim hang: bends the rim further, held until the dunk key is pressed again
  hangBend: 6,
  swayPx: 5,          // hanging, the player (and rim) swing like a pendulum: px of swing...
  swayPeriod: 0.7,    // ...seconds per swing...
  swayDecay: 1.5,     // ...dying out at this rate
  shatterChance: 0.01, // odds the rim snaps off after a short hang (then fade out and reset)
  shatterHang: 0.45,
  shatterBend: 8,
  shatterShake: 0.6,
  legKick: 0.08,      // on a shatter slam the legs swing up: halfway for this long, then straight out
  shatterFall: 0.45,  // seconds falling with the broken rim (vs. `fall` normally)...
  shatterDrift: 6,    // ...drifting back this far, to land sitting down
  sitShake: 0.15,
  hangLock: 3,        // after a rim-hang slam nobody can grab the ball for this long (a shatter locks it until the reset)
};

// Fade to black and back: out, hold on black (the reset happens here), then in.
const FADE = { out: 0.9, hold: 0.35, in: 0.6 };

// When the ball stays behind a backboard for `outTime` seconds play resets and the camera pans over in `panTime`:
// in 3v3 the team that didn't touch it last gets it on their own half; in free shot it drops (from dropHeight) at
// center court with the player on one of `spots` spots around the center circle. The "OUT ON ..." text floats at
// height outTextZ over the ball's new spot for outTextTime seconds.
const RESET = { outTime: 3, spots: 6, dropHeight: 25, panTime: 0.9, outTextZ: 36, outTextTime: 2 };

// A 3v3 game: two halves of halfMinutes (the teams switch ends at halftime), then otMinutes overtimes until
// someone leads at the buzzer. The shot clock gives the team with the ball shotClock seconds to get a shot off
// (it restarts when the other team gets the ball or a shot hits the rim). The clock stops for dead balls: free
// throws, resets and the breaks, which last breakTime. The defaults here can be changed in the 3v3 game options.
const GAME = { halfMinutes: 2.5, otMinutes: 1, shotClock: 14, breakTime: 2.5, shotWarn: 5 };

// Career (see career.js): a league of `teams` (the user's plus AI teams), a round-robin season, then the top
// `playoffTeams` play semifinals and a final. A game earns a token per point the user's team scores, times winMult
// for a win or lossMult for a loss, times the picked challenge's multiplier if it was completed, rounded up. An
// upgrade level costs levelCost x the level being bought (10, 20, ... 50). Opponents: AI level aiBase + aiPerStrength
// x the team's strength (0..1), plus aiPerSeason each season (at most aiMax); upgrade levels per player
// upgradesPerStrength x strength plus upgradesPerSeason each season.
const CAREER = {
  teams: 8,
  playoffTeams: 4,
  winMult: 1.25,
  lossMult: 0.75,
  levelCost: 10,
  aiBase: 0.25,
  aiPerStrength: 0.45,
  aiPerSeason: 0.05,
  aiMax: 0.95,
  upgradesPerStrength: 6,
  upgradesPerSeason: 2,
  strengthDrift: 0.1, // between seasons each AI team's strength moves up to this much either way
  // Challenge tiers, easiest first: the token multiplier for completing one.
  tiers: [
    { name: 'EASY', mult: 1.1 },
    { name: 'MEDIUM', mult: 1.25 },
    { name: 'HARD', mult: 1.5 },
    { name: 'PRO', mult: 2 },
  ],
};

// Fouls: reaching for a steal can be called a foul, more likely the closer the reacher is to the ball handler: no
// chance from `far` out (the steal reach without upgrades), rising to `maxChance` with bodies touching (`near`, the
// separation distance). With free throws on (Gamemode tab) the fouled player shoots one from the line; otherwise
// their team just keeps the ball. Either way the fouler is stuck reaching for `stun` seconds.
const FOUL = {
  far: 22,
  near: 11,
  maxChance: 0.6,
  stun: 0.6,
  ftPoints: 1,
  ftBack: 3,                 // the shooter stands this far behind the free-throw line
  aiShootDelay: [0.6, 1.2],  // seconds an AI shooter waits at the line
  textTime: 2,               // how long "FREE THROW" stays up
  callTime: 2,               // after the whistle the ball drops loose and everyone stands still this long
  dropTime: 0.3,             // seconds the ball takes to fall from the handler's hands to the floor
};

// The referee (3v3 only): walks the strip between the scorer's table and the far sideline (at depth `y`), following
// the ball's side of the court (`follow` of the way from center toward the ball, at most `range` out) and drifting
// up to `wander` either way, picking a new drift every `rethink` seconds, at `speed` x a player's pace. At a free
// throw they stand in the lane `spot` out from the hoop holding the ball and pass it to the shooter after
// `passDelay` seconds (the shooter can't shoot until then); the pass takes `passTime`.
const REF = { y: -3, follow: 0.6, range: 120, wander: 20, rethink: [1.5, 3.5], speed: 0.6, spot: 40, passDelay: 2, passTime: 0.45 };

const PICKUP = {
  radius: 12,         // how close (in x and y) the player must be to grab a loose ball
  reach: 30,          // highest ball (bottom z) the player can grab
  delay: 0.5,         // after a shot or pass, the thrower can't grab the ball for this long
};

// Dash: double-tap any direction (up, down, left or right) for a short burst that way, then wait out the cooldown.
const DASH = {
  speed: 250,         // world units per second during the burst (the dash upgrade raises it)...
  time: 0.16,         // ...for this long
  depthScale: 0.75,   // up/down dashes cover this fraction of the distance a sideways one would (as seen on screen)
  cooldown: 3,
  doubleTap: 0.125,   // the second tap must come within this many seconds of the first
};

// Free shot: calling for the ball (Q) sends it flying back to the player as a pass, taking distance / callSpeed
// seconds, kept within callTime.
const CALL = { speed: 300, time: [0.3, 1] };

// Passing (Q with the ball): a fast, flat throw led toward where the receiver is heading.
const PASS = {
  speed: 380,         // world units per second
  minTime: 0.2,
  fromZ: 26,          // ball height leaving the hands...
  toZ: 22,            // ...and arriving at the receiver
  lead: 0.8,          // how much of the receiver's motion to lead them by
  catchRadius: 16,    // the intended receiver reaches further than PICKUP.radius...
  catchReach: 45,     // ...and higher
  aimCone: 0.3,       // holding a direction picks the teammate within this cosine of it
};

// Defense: steals (E), jumping to contest or block (Space), and players not standing inside each other.
const DEFENSE = {
  stealRange: 22,     // how close to the ball (held in front of the handler) the reach has to start
  stealCooldown: 0.7,
  reachTime: 0.2,     // seconds the arm stays out on a steal attempt
  stealStun: 0.4,     // a missed reach leaves the defender slowed this long...
  stunSpeed: 0.4,     // ...to this fraction of their speed
  stolenStun: 0.9,    // losing the ball to a steal slows the ball handler this long (and they can't grab it back)
  pokeDist: [18, 34], // a steal knocks the ball loose this far, roughly toward the stealer
  userStealChance: [0.5, 0.25], // the user's odds at the easiest..hardest AI level
  jumpHeight: 18,
  jumpTime: 0.5,
  contestRange: 40,   // defenders inside this shrink the shooter's green zone...
  contestMax: 0.55,   // ...by up to this share when right on top of them and in the air...
  contestGround: 0.6, // ...or this fraction of that with their feet on the floor
  blockRange: 16,     // an airborne defender this close at the release can block it
  blockMinZ: 6,
  userBlockChance: 0.5,
  userIntercept: 0.6, // odds the user's player picks off a pass they get a hand on
  rimGuard: 22,       // a defender this close to the rim, or to the dunker at takeoff, can stuff the dunk...
  stuffChance: 0.3,   // ...with these odds each (AI defenders add their block chance)
  userStuffChance: 0.4,
  // Everyone's steal, block, interception and dunk-stuff odds (the user's and the AI's alike) are multiplied by
  // these; 1 = as above (set in the Gamemode tab's player tuning).
  stealOdds: 1,
  blockOdds: 1,
  interceptOdds: 1,
  stuffOdds: 1,
  separation: 11,     // players closer than this get pushed apart
  retreatSpeed: 1.6,  // defenders still in the offense's half run back to their own this much faster
};

// Upgrades, set per player on the user's team in the pause menu (free +/- for now; each AI opponent gets the same
// total at random). Effects per level:
const UPGRADES = {
  max: 5,
  speed: 0.04,         // +4% speed
  threeGreen: 0.15,    // +15% green zone width on three-point shots
  dunkRange: 0.12,     // +12% dunk range
  hangChance: 0.02,    // +2% rim hang odds
  shatterChance: 0.004, // +0.4% rim shatter odds
  stealRange: 0.1,     // defense: +10% steal reach (+50% at max)...
  blockRange: 0.1,     // ...+10% block reach...
  blockChance: 0.06,   // ...and +6% odds on blocks and dunk stuffs
  dashDistance: 0.15,  // +15% dash distance (+75% at max)
};

// Computer players. Values in [easy, hard] pairs are blended by the AI level (0..1), set with the
// Gamemode tab's testing sliders.
// The user's teammates play at a fixed level.
const AI = {
  level: 0.5,
  teammateLevel: 0.6,
  think: [0.5, 0.2],       // seconds between ball-handler decisions
  reaction: [0.45, 0.12],  // delay before jumping to contest a shot
  shotError: [0.14, 0.035], // spread of the release point around the middle of the green
  stealRate: [0.1, 0.5],   // how often (per second) the ball handler's defender jumps in to reach for the ball...
  lungeTime: 0.6,          // ...giving up after this long if they can't get close enough
  stealChance: [0.15, 0.35],
  interceptChance: [0.1, 0.35],
  blockChance: [0.15, 0.4],
  openGap: 20,        // no defender this close = open enough to shoot
  pressureGap: 16,    // defender this close = under pressure
  shootRange: 150,    // won't shoot from farther out than this (unless the hold timer runs out)
  minHold: 0.5,       // seconds with the ball before considering a jumper
  maxHold: 7,         // after this long holding the ball, shoot whatever happens
  guardGapBall: 32,   // how far off the man defenders play, toward their own hoop: on the ball...
  guardGapOff: 50,    // ...and off it
  pickupLine: 25,     // half-court defense: defenders wait this far inside their own half for the offense to cross
  helpRange: 110,     // a ball handler this close to the hoop draws a help defender...
  helpDepth: 16,      // ...who stands this far out from the rim, toward the ball
  hangTime: 1.1,      // seconds an AI dunker hangs on the rim on a rim-hang dunk
  shotClockHurry: 3,  // with this little left on the shot clock, the ball handler shoots whatever happens
};

// Pseudo-perspective: the far sideline sits higher on screen and is squeezed horizontally.
// Scales are screen pixels per world unit.
const PROJ = {
  farY: 120,
  nearY: 328,
  farScale: 1.6,
  nearScale: 2,
};

// No sprint button: top speed goes up in brackets the longer a direction is held. Letting go drops back to the first
// bracket; turning eats into the held time (a full reversal fastest).
const PLAYER = {
  speedBrackets: [
    { after: 0, speed: 70 },
    { after: 0.5, speed: 90 },
    { after: 1, speed: 110 },
  ],
  topSpeed: 110,      // the last bracket's speed (animations scale to it)
  ballSpeed: 0.85,    // dribbling slows the ball handler to this fraction of every bracket
  turnLoss: 1.5,      // seconds of held time lost per second, times how sharp the turn is (0 straight .. 2 reversal)
  depthSpeed: 1.6,    // up/down speed multiplier; the court is foreshortened, so depth moves need a boost to feel right
  accel: 800,
  decel: 1000,
  strideLen: 9,       // world units travelled per run-cycle frame
  boundsMargin: 10,   // how far past the lines a player may wander
};

const CAMERA = {
  lead: 0.35,         // seconds of velocity to look ahead
  smoothing: 6,
  edgeOverscan: 50,   // how far past each baseline the camera may show
  zoomMin: 0.78,      // zoom at zoomFar or more from the nearest hoop...
  zoomNear: 60,       // ...1x inside zoomNear
  zoomFar: 200,
  zoomSmoothing: 2.5,
  // With the ball near center court the camera tilts to a higher angle: the floor is drawn taller
  // and the far side squeezes in less. Full tilt at center, none tiltRange or more away from it.
  tiltDepth: 0.3,     // extra on-screen floor depth at full tilt
  tiltFarScale: 0.9,  // far-sideline scale at full tilt, as a fraction of PROJ.nearScale
  tiltRange: 120,
  tiltSmoothing: 2,
};

const COLORS = {
  bg: '#1a1c2c',
  outline: '#1a1c2c',
  wall: '#262b44',
  banner: '#333c57',
  bannerText: '#94b0c2',
  wallStripe: '#b13e53',
  risers: ['#333c57', '#3a4466'],
  seat: '#20263b',
  apron: '#8f563b',
  woodA: '#e4a672',
  woodB: '#d99c66',
  woodSeam: '#c98d5a',
  paint: '#b13e53',
  line: '#f4f4f4',
  shadow: '#1a1c2c', // drawn at SHADOW.alpha
  eye: '#1a1c2c',
  sock: '#f4f4f4',
  ball: '#ef7d57',
  ballSeam: '#8a3b22',
  ballShine: '#ffcd75',
  ballShade: '#d0603f',
  hint: '#94b0c2',
  rim: '#e45c32',
  rimBack: '#9c3a1f',
  rimShine: '#f7a072',
  net: '#f4f4f4',
  netBack: '#94b0c2',
  board: '#f4f4f4',
  boardEdge: '#94b0c2',
  boardMark: '#e43b44',
  pole: '#5d6b8a',
  poleLight: '#8b9bb4',
  poleDark: '#3a4466',
  pad: '#29366f',
  padTop: '#3b5dc9',
  padSeam: '#20285a',
  good: '#38b764',
  okay: '#ffcd75',
  bad: '#e43b44',
  chairMetal: '#8b9bb4',
  tablePanel: '#262b44',
  tableTop: '#5d6b8a',
  boardFrame: '#333c57',
  flapCard: '#20263b',
  flapMoving: '#2c3352',
  flapSplit: '#0d0e16',
  towel: '#f4f4f4',
  towelShade: '#c7cfdd',
  bottleCap: '#f4f4f4',
  meterBg: '#262b44',
  meterFill: '#f4f4f4',
};

const SKINS = ['#f2c9a0', '#d9a066', '#a86b47', '#7a4a32', '#5a3524', '#3e2419'];

const CROWD = {
  density: 0.92, // share of seats filled (0..1); which seats are taken is random each load
  idleCheer: 0.995, // between plays a fan pops up now and then: closer to 1 = rarer (sine threshold)
  // Share of fans who jump up for each play (the home crowd); a rim-hanging or rim-shattering dunk is the loudest.
  hype: { steal: 0.35, block: 0.35, stuff: 0.5, freeThrow: 0.2, score: 0.45, three: 0.6, dunk: 0.75, rareDunk: 1 },
  awayHype: 0.5,  // the other team's plays get this much of the cheer
  hypeTime: 2.5,  // seconds a cheer lasts (fans sit back down over the last 40%); rare dunks last twice as long
  signChance: 0.5, // chance a basket brings out signs with the scorer's number (always for rare dunks)
  signShare: 0.15, // share of cheering fans holding up a sign
};
const CROWD_SHIRTS = ['#b13e53', '#3b5dc9', '#f4f4f4', '#ffcd75', '#38b764', '#41a6f6', '#ef7d57', '#5d275d'];
const CROWD_SHIRT_SHADES = CROWD_SHIRTS.map((c) => shade(c, 0.8));
const CROWD_HAIR = ['#1a1c2c', '#1a1c2c', '#5d275d', '#7a4a32', '#ffcd75', '#94b0c2'];

// The player's customizable appearance. Colors are #rrggbb; number is a 1-2 digit string.
const DEFAULT_LOOK = {
  skin: SKINS[2],
  hairStyle: 'short',
  hair: '#1a1c2c',
  jersey: '#3b5dc9',
  shorts: '#3b5dc9',
  number: '23',
  shoe: '#f4f4f4',
  laces: '#b13e53',
};
const LOOK_KIT_KEYS = ['jersey', 'shorts', 'shoe', 'laces']; // the team's kit: the same for every home player

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// Darken a #rrggbb color by factor f (0..1).
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift) => Math.round(((n >> shift) & 255) * f);
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

// Blend #rrggbb color a toward b by t (0..1).
function mix(a, b, t) {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const ch = (shift) => Math.round(lerp((na >> shift) & 255, (nb >> shift) & 255, t));
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, '0')}`;
}

// The RGB inverse of a #rrggbb color.
function invertColor(hex) {
  return `#${(0xffffff ^ parseInt(hex.slice(1), 16)).toString(16).padStart(6, '0')}`;
}

// Two #rrggbb colors too alike to tell two teams apart.
function colorsClash(a, b) {
  const na = parseInt(a.slice(1), 16);
  const nb = parseInt(b.slice(1), 16);
  const d = (shift) => ((na >> shift) & 255) - ((nb >> shift) & 255);
  return Math.hypot(d(16), d(8), d(0)) < 90;
}

function isLightColor(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255) > 160;
}

// Saved settings are JSON in localStorage. Reading gives null when nothing is saved, it's corrupt or storage is
// blocked; a failed write just means the value won't persist.
function loadStored(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch (e) {
    return null;
  }
}

// Whether this browser keeps saved settings at all (not in some private windows or when site storage is blocked).
function canStore() {
  try {
    localStorage.setItem('retroball.check', '1');
    localStorage.removeItem('retroball.check');
    return true;
  } catch (e) {
    return false;
  }
}

function saveStored(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    // Not fatal.
  }
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function rand(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

// Deterministic 0..1 noise from two integers (used for crowd layout and plank seams).
function hash2(a, b) {
  let h = (a * 374761393 + b * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
