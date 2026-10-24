// Sprite measurements are in game pixels at 640x360, relative to the point between the feet, facing right.

// Leg x-offsets (front leg, back leg) for each frame of the run cycle.
const LEG_SHIFT = [[6, -6], [0, 0], [-6, 6], [0, 0]];
const DRIBBLE_HEIGHT = 20;
const BALL_OFFSET_X = 10; // left edge of the ball relative to the player's feet, in facing direction
const HAND_Y = -32;       // bottom of the dribbling hand at rest
const HAND_DIP = 4;       // how far the hand travels with each push
const PUSH_START = 0.5;   // dribble phase when the push begins (ball at the top)...
const PUSH_LEN = 0.3;     // ...and how much of the cycle it lasts; the hand rests at the top the rest of the time
const HEAD_X = -8;        // the head is a 16x16 block with its top-left here
const HEAD_Y = -70;
const SHOOT_BALL_X = 4;   // ball held overhead while rising for a shot: left edge...
const SHOOT_BALL_TOP = -80; // ...and top
const FRONTAL_BALL_X = 8; // ball's left edge in the front/back views, under the dribbling hand
const VIEW_MIN_SPEED = 0.2; // below this fraction of run speed the player settles back to the side view

// Hair as [hx, hy, w, h] rects relative to the head's top-left: side view (facing right), from the front and
// from behind, plus a few lighter strands for shine.
const HAIR_STYLES = {
  short: {
    side: [[1, 0, 14, 1], [0, 1, 16, 3], [0, 4, 6, 5], [6, 4, 2, 1]],
    front: [[1, 0, 14, 1], [0, 1, 16, 3], [0, 4, 2, 4], [14, 4, 2, 4]],
    back: [[1, 0, 14, 1], [0, 1, 16, 8], [1, 9, 14, 2]],
    shine: { side: [[3, 1, 7, 1]], front: [[4, 1, 8, 1]], back: [[3, 1, 9, 1]] },
  },
  buzz: {
    side: [[1, 0, 14, 1], [0, 1, 16, 1], [0, 2, 4, 4]],
    front: [[1, 0, 14, 1], [0, 1, 16, 2]],
    back: [[1, 0, 14, 1], [0, 1, 16, 4]],
    shine: { side: [], front: [], back: [] },
  },
  afro: {
    side: [[2, -6, 12, 1], [0, -5, 16, 1], [-2, -4, 20, 8], [-2, 4, 9, 6], [-1, 10, 6, 1]],
    front: [[2, -6, 12, 1], [0, -5, 16, 1], [-2, -4, 20, 8], [-2, 4, 3, 7], [15, 4, 3, 7]],
    back: [[2, -6, 12, 1], [0, -5, 16, 1], [-2, -4, 20, 14], [-1, 10, 18, 2]],
    shine: { side: [[2, -4, 8, 1], [-1, -2, 2, 2]], front: [[3, -4, 10, 1]], back: [[3, -4, 10, 1]] },
  },
  mohawk: {
    side: [[3, -6, 10, 2], [2, -4, 12, 2], [1, -2, 14, 2], [0, 0, 4, 3]],
    front: [[6, -6, 4, 8]],
    back: [[6, -6, 4, 16]],
    shine: { side: [[4, -5, 6, 1]], front: [[7, -5, 1, 6]], back: [[7, -5, 1, 6]] },
  },
  long: {
    side: [[1, 0, 14, 1], [0, 1, 16, 3], [0, 4, 6, 5], [-3, 2, 5, 18], [-2, 20, 3, 2]],
    front: [[1, 0, 14, 1], [0, 1, 16, 4], [-2, 2, 4, 18], [14, 2, 4, 18]],
    back: [[1, -1, 14, 1], [-1, 0, 18, 4], [-3, 4, 22, 16], [-2, 20, 20, 2]],
    shine: { side: [[3, 1, 7, 1], [-2, 6, 1, 8]], front: [[4, 1, 8, 1], [-1, 6, 1, 10]], back: [[3, 0, 10, 1], [0, 6, 1, 10]] },
  },
  bald: { side: [], front: [], back: [], shine: { side: [], front: [], back: [] } },
};
const HAIR_STYLE_NAMES = Object.keys(HAIR_STYLES);

class Player {
  constructor({ x, y, look, facing = 1 }) {
    this.x = x;
    this.y = y;
    this.z = 0;
    this.prevX = x;
    this.prevY = y;
    this.prevZ = 0;
    this.vx = 0;
    this.vy = 0;
    this.facing = facing;
    this.view = 'side'; // see update(): side, frontQ / backQ (45 degrees), front / back
    this.stride = 0;
    this.dribbleT = 0;
    this.hasBall = true;
    this.shot = null; // set by Shooting while the player is in a jump shot
    this.hangSway = 0; // px of pendulum swing while hanging on the rim (the legs swing further)
    this.pose = null;  // special poses from a shattered-rim dunk: 'legsDiag' / 'legsUp' (legs kicked out), 'sit'
    this.sitting = false; // knocked onto the floor; can't move until the reset
    this.sx = 0;      // screen position of the feet on the floor...
    this.sy = 0;
    this.by = 0;      // ...and of the feet including jump height
    this.scale = 1;   // sprite size for the current depth
    this.setLook(look);
  }

  // Look = the customizable bits (see DEFAULT_LOOK). Shades, highlights and trim are derived from it.
  setLook(look) {
    this.look = { ...look };
    this.number = String(look.number);
    this.colors = {
      skin: look.skin,
      skinLight: mix(look.skin, COLORS.line, 0.25),
      skinDark: shade(look.skin, 0.8), // far-side limbs are a shade darker for depth
      skinDarker: shade(look.skin, 0.65),
      hair: look.hair,
      hairShine: mix(look.hair, COLORS.line, 0.25),
      jersey: look.jersey,
      jerseyLight: mix(look.jersey, COLORS.line, 0.2),
      jerseyDark: shade(look.jersey, 0.8),
      trim: isLightColor(look.jersey) ? COLORS.outline : COLORS.line,
      shorts: look.shorts,
      shortsDark: shade(look.shorts, 0.8),
      shortsTrim: isLightColor(look.shorts) ? COLORS.outline : COLORS.line,
      shoe: look.shoe,
      sole: shade(look.shoe, 0.7),
      laces: look.laces,
    };
  }

  update(dt, move, sprint) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevZ = this.z;

    // No steering in the air during a jump shot, or while sitting on the floor.
    const stuck = this.shot || this.sitting;
    let ix = stuck ? 0 : move.x;
    let iy = stuck ? 0 : move.y;
    const len = Math.hypot(ix, iy);
    if (len > 1) {
      ix /= len;
      iy /= len;
    }

    // Steer velocity toward the target at a fixed rate: quick to respond, but with a little weight.
    const maxSpeed = sprint ? PLAYER.sprintSpeed : PLAYER.runSpeed;
    const tx = ix * maxSpeed;
    const ty = iy * maxSpeed * PLAYER.depthSpeed;
    const dx = tx - this.vx;
    const dy = ty - this.vy;
    const dist = Math.hypot(dx, dy);
    const step = (len > 0 ? PLAYER.accel : PLAYER.decel) * dt;
    if (dist <= step) {
      this.vx = tx;
      this.vy = ty;
    } else {
      this.vx += (dx / dist) * step;
      this.vy += (dy / dist) * step;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const m = PLAYER.boundsMargin;
    const cx = clamp(this.x, -m, COURT.length + m);
    const cy = clamp(this.y, -m, COURT.width + m);
    if (cx !== this.x) this.vx = 0;
    if (cy !== this.y) this.vy = 0;
    this.x = cx;
    this.y = cy;

    if (ix !== 0) this.facing = Math.sign(ix);
    this.view = stuck ? 'side' : this.viewForVelocity();

    const speed = Math.hypot(this.vx, this.vy);
    this.stride += speed * dt;
    this.dribbleT += dt * lerp(2, 3.2, Math.min(speed / PLAYER.sprintSpeed, 1));
    this.moving = speed > 10;
  }

  // Which way the body is turned, from the direction of travel in 8 directions: side-on for left/right,
  // three-quarter views for diagonals (frontQ toward the camera, backQ away), and straight front/back for down/up.
  // Speeds are normalized so a diagonal key press reads as 45 degrees despite the faster depth movement.
  viewForVelocity() {
    const nx = this.vx / PLAYER.runSpeed;
    const ny = this.vy / (PLAYER.runSpeed * PLAYER.depthSpeed);
    if (Math.hypot(nx, ny) < VIEW_MIN_SPEED) return 'side';
    const angle = (Math.atan2(Math.abs(ny), Math.abs(nx)) * 180) / Math.PI;
    if (angle < 22.5) return 'side';
    if (angle < 67.5) return ny > 0 ? 'frontQ' : 'backQ';
    return ny > 0 ? 'front' : 'back';
  }

  isFrontal() {
    return this.view === 'front' || this.view === 'back';
  }

  // Ball's left edge (in sprite pixels, facing right) while dribbling in the current view.
  dribbleBallX() {
    return this.isFrontal() ? FRONTAL_BALL_X : BALL_OFFSET_X;
  }

  prepare(alpha) {
    const x = lerp(this.prevX, this.x, alpha);
    const y = lerp(this.prevY, this.y, alpha);
    const ground = project(x, y);
    this.sx = Math.round(ground.x);
    this.sy = Math.round(ground.y);
    this.by = Math.round(project(x, y, lerp(this.prevZ, this.z, alpha)).y);
    this.scale = spriteScale(y);
  }

  drawShadow(ctx) {
    const { sx, sy } = this;
    const w = (n) => Math.round(n * this.scale);
    ctx.fillStyle = COLORS.shadow;
    [16, 24, 28, 24, 16].forEach((width, i) => ctx.fillRect(sx - (w(width) >> 1), sy - 3 + i, w(width), 1));

    if (this.hasBall && !this.shot) {
      const bw = w(this.ballZ() > DRIBBLE_HEIGHT / 2 ? 8 : 12);
      const center = sx + this.facing * w(this.dribbleBallX() + BALL_SIZE / 2);
      ctx.fillRect(center - (bw >> 1) + 2, sy - 2, bw - 4, 1);
      ctx.fillRect(center - (bw >> 1), sy - 1, bw, 2);
      ctx.fillRect(center - (bw >> 1) + 2, sy + 1, bw - 4, 1);
    }
  }

  draw(ctx) {
    drawRects(ctx, this.bodyParts(), this.sx, this.by, this.facing, this.scale);
    if (this.hasBall) drawRects(ctx, this.ballParts(), this.sx, this.by, this.facing, this.scale);
  }

  // World position of the ball's bottom when held overhead in the shooting pose, so the shot leaves from where it's drawn.
  shootingBallPosition() {
    const s = scaleAtY(this.y) / spriteScale(this.y); // sprite pixels per world unit at this depth
    return {
      x: this.x + (this.facing * (SHOOT_BALL_X + BALL_SIZE / 2)) / s,
      y: this.y,
      z: this.z + -(SHOOT_BALL_TOP + BALL_SIZE) / s,
    };
  }

  // Ball height above the floor. abs(sin) is fast at the floor and slow at the hand, like a real bounce.
  ballZ() {
    return DRIBBLE_HEIGHT * Math.abs(Math.sin(Math.PI * (this.dribbleT % 1)));
  }

  runFrame() {
    return this.moving && !this.shot ? Math.floor(this.stride / PLAYER.strideLen) % 4 : -1;
  }

  // Upper-body bob: up 2px on the passing frames of the run cycle.
  bob() {
    const frame = this.runFrame();
    return frame === 1 || frame === 3 ? -2 : 0;
  }

  // The hand rests at the top and only dips briefly to push the ball down.
  // The ball can't pass through the hand, so while they touch it rides along with it.
  dribblePose() {
    const push = ((this.dribbleT % 1) - PUSH_START) / PUSH_LEN;
    const dip = push > 0 && push < 1 ? Math.round(HAND_DIP * Math.sin(Math.PI * push)) : 0;
    const handBottom = HAND_Y + this.bob() + dip;
    const ballTop = Math.max(-Math.round(this.ballZ()) - BALL_SIZE, handBottom);
    return { dip, ballTop };
  }

  // Sprite as a list of [dx, dy, w, h, color] rects, relative to the feet, drawn facing right. Later rects cover earlier ones.
  bodyParts() {
    if (this.pose === 'sit') return this.sittingParts();
    return this.isFrontal() ? this.frontalParts() : this.profileParts();
  }

  // The head, hair and face for any view. `hairView` picks the hair variant; `face` rects (relative to the
  // head's top-left) are drawn on top of the hair.
  headParts(u, hairView, face) {
    const c = this.colors;
    const hx = HEAD_X;
    const hy = HEAD_Y + u;
    const style = HAIR_STYLES[this.look.hairStyle] || HAIR_STYLES.short;
    return [
      // Neck, rounded head with a top highlight (hidden under most hair) and a shaded jaw.
      [-3, -55 + u, 6, 3, c.skinDark],
      [hx + 1, hy, 14, 16, c.skin],
      [hx, hy + 1, 16, 14, c.skin],
      [hx + 4, hy + 2, 4, 1, c.skinLight],
      [hx + 2, hy + 15, 12, 1, c.skinDark],
      ...style[hairView].map(([x, y, w, h]) => [hx + x, hy + y, w, h, c.hair]),
      ...style.shine[hairView].map(([x, y, w, h]) => [hx + x, hy + y, w, h, c.hairShine]),
      ...face.map(([x, y, w, h, color]) => [hx + x, hy + y, w, h, color]),
    ];
  }

  // An eye: a 4x3 white with a 2x2 pupil at column `pupil` (relative to the eye's left edge). Both stay at least
  // 2x2 on screen however small the sprite is drawn.
  eye(x, y, pupil) {
    return [
      [x, y, 4, 3, COLORS.line, 2],
      [x + pupil, y + 1, 2, 2, COLORS.eye, 2],
    ];
  }

  // Side-on and three-quarter views (moving left/right or diagonally).
  profileParts() {
    const c = this.colors;
    const frame = this.runFrame();
    // Diagonal steps cover less sideways ground, so the stride is shorter in the three-quarter views.
    const strideK = this.view === 'side' ? 1 : 0.67;
    // Hanging from the rim, the legs dangle together and trail the swing further than the hands.
    const dangle = Math.round(this.hangSway * 0.6) * this.facing;
    const [front, back] = frame < 0 ? [dangle, dangle] : LEG_SHIFT[frame].map((s) => Math.round(s * strideK));
    const u = this.bob();
    const dip = this.hasBall && !this.shot ? this.dribblePose().dip : 0;
    const armSwing = frame === 0 ? 4 : frame === 2 ? -4 : 0;
    const turn = this.view === 'frontQ' ? 1 : this.view === 'backQ' ? -1 : 0;

    // Whichever arm is nearer the camera is drawn wider, unshaded and in front of the body.
    const backNear = turn < 0;
    const frontNear = turn >= 0;
    const backW = backNear ? 8 : turn > 0 ? 4 : 6;
    const backH = backNear ? 18 : turn > 0 ? 14 : 16;
    const backX = -14 + armSwing + (backW === 4 ? 2 : 0);
    const backSkin = backNear ? c.skin : c.skinDark;
    const backTop = -50 + u;
    let backArm = [
      [backX, backTop, backW, backH, backSkin],
      [backX, backTop + 2, 1, backH - 4, backNear ? c.skinDark : c.skinDarker],
      [backX, backTop + backH - 6, backW, 2, c.trim],
      [backX, backTop + backH - 2, backW, 1, backNear ? c.skinDark : c.skinDarker],
    ];
    const frontW = turn > 0 ? 8 : turn < 0 ? 4 : 6;
    const frontSkin = frontNear ? c.skin : c.skinDark;
    const frontShade = frontNear ? c.skinDark : c.skinDarker;
    let frontArm = [
      [8, -50 + u, frontW, 10, frontSkin],          // upper arm
      [8, -48 + u, 1, 7, frontShade],
      [12, -42 + u, frontW, 10 + dip, frontSkin],   // forearm and hand, stretching with the push
      [12, -41 + u, 1, 8 + dip, frontShade],
      [12, -38 + u, frontW, 2, c.trim],             // wristband
      [12, -35 + u + dip, frontW, 1, frontShade],   // knuckles
    ];

    // Jump shot: shooting arm straight up under the ball (with a wrist flick once it's gone), guide arm raised behind.
    if (this.shot) {
      backArm = [
        [-10, -64, 6, 14, c.skinDark],
        [-10, -56, 6, 2, c.trim],
      ];
      frontArm = [
        [6, -66, 6, 16, c.skin],
        [6, -64, 1, 12, c.skinDark],
        [6, -60, 6, 2, c.trim],
        ...(this.hasBall ? [] : [[10, -70, 4, 4, c.skin], [10, -70, 4, 1, c.skinLight]]),
      ];
    }

    // Leg from the knee down: skin with a shaded calf, sock with a team stripe, shoe with criss-cross laces,
    // heel tab and sole.
    const leg = (x, skin, calf) => [
      [x, -22 + u, 6, 10 - u, skin],
      [x, -21 + u, 1, 8 - u, calf],
      [x, -12, 6, 4, COLORS.sock],
      [x, -11, 6, 1, c.jersey],
      [x, -8, 8, 6, c.shoe],
      [x, -8, 1, 4, c.sole],
      [x + 3, -8, 1, 1, c.laces],
      [x + 5, -8, 1, 1, c.laces],
      [x + 4, -7, 1, 1, c.laces],
      [x + 6, -7, 1, 1, c.laces],
      [x, -2, 8, 2, c.sole],
    ];

    // Faces kept simple: ear, eye(s), nose. Side-on shows one eye; three-quarter front shows both with the ear
    // further back; three-quarter back shows the back of the hair and just the near ear.
    const face = {
      side: [
        [5, 7, 2, 3, c.skinDark],
        ...this.eye(11, 6, 2),
        [16, 8, 1, 2, c.skin],
      ],
      frontQ: [
        [2, 7, 2, 3, c.skinDark],
        ...this.eye(5, 6, 2),
        ...this.eye(11, 6, 2),
        [10, 9, 1, 2, c.skinDark],
        [16, 8, 1, 1, c.skin],
      ],
      backQ: [[14, 7, 2, 3, c.skinDark]],
    }[this.view];
    const numberLeft = { side: -6, frontQ: -4, backQ: -8 }[this.view];

    // Kicked-out legs from a rim-shattering slam: angled halfway, or straight out at hip height, soles forward.
    const kicked = (dy, skin) => this.pose === 'legsUp'
      ? [
          [2, -24 + dy, 18, 6, skin],
          [20, -24 + dy, 4, 6, COLORS.sock],
          [21, -24 + dy, 1, 6, c.jersey],
          [24, -26 + dy, 6, 9, c.shoe],
          [30, -26 + dy, 2, 9, c.sole],
        ]
      : [
          [0, -22 + dy, 6, 5, skin],
          [4, -18 + dy, 6, 5, skin],
          [8, -14 + dy, 6, 4, skin],
          [11, -11 + dy, 6, 3, COLORS.sock],
          [13, -9 + dy, 8, 6, c.shoe],
          [13, -3 + dy, 8, 2, c.sole],
        ];
    const legsKicked = this.pose === 'legsUp' || this.pose === 'legsDiag';

    return [
      // Back leg is shaded darker.
      ...(legsKicked
        ? [...kicked(-3, c.skinDark), ...kicked(0, c.skin)]
        : [...leg(-8 + back, c.skinDark, c.skinDarker), ...leg(2 + front, c.skin, c.skinDark)]),

      // Far arm goes behind the body. The back arm swings opposite the legs.
      ...(backNear ? frontArm : backArm),

      // Shorts: darker back, waistband, side stripe and hem.
      [-10, -32 + u, 20, 12, c.shorts],
      [-10, -32 + u, 4, 12, c.shortsDark],
      [-10, -32 + u, 20, 2, c.shortsDark],
      [3, -30 + u, 1, 8, c.shortsTrim],
      [-10, -22 + u, 20, 2, c.shortsTrim],

      // Jersey: darker back, lit front edge, V-neck collar, hem and number.
      [-10, -52 + u, 20, 20, c.jersey],
      [-10, -52 + u, 4, 20, c.jerseyDark],
      [5, -48 + u, 2, 14, c.jerseyLight],
      [-10, -34 + u, 20, 1, c.jerseyDark],
      ...(turn < 0
        ? [[-4, -52 + u, 8, 1, c.trim]]
        : [[-4, -52 + u, 8, 2, c.trim], [-2, -52 + u, 4, 1, c.skinDark], [-1, -50 + u, 2, 1, c.trim]]),
      ...this.numberParts(numberLeft, -47 + u, c.trim),

      ...this.headParts(u, turn < 0 ? 'back' : 'side', face),

      // Near arm goes in front of the body.
      ...(backNear ? backArm : frontArm),

      // Armhole straps on both sides of the jersey go last so the arms never cover them.
      [8, -52 + u, 2, 6, c.trim],
      [-10, -52 + u, 2, 6, c.trim],
    ];
  }

  // Knocked onto the floor by a shattered rim: sitting with legs out in front (toes up), one arm propped
  // behind and the other resting on a knee. The upper body is the standing one lowered by `d`.
  sittingParts() {
    const c = this.colors;
    const d = 18;
    const leg = (x, dy, skin) => [
      [x, -8 + dy, 18, 6, skin],
      [x + 18, -8 + dy, 4, 6, COLORS.sock],
      [x + 19, -8 + dy, 1, 6, c.jersey],
      [x + 22, -12 + dy, 6, 10, c.shoe],
      [x + 28, -12 + dy, 2, 10, c.sole],
    ];
    const face = [
      [5, 7, 2, 3, c.skinDark],
      ...this.eye(11, 6, 2),
      [16, 8, 1, 2, c.skin],
    ];
    return [
      // Back arm, propped on the floor behind.
      [-14, -32, 6, 8, c.skinDark],
      [-17, -25, 6, 8, c.skinDark],
      [-20, -18, 6, 10, c.skinDark],
      [-20, -14, 6, 2, c.trim],
      [-22, -8, 8, 4, c.skinDark],

      ...leg(0, -2, c.skinDark),
      ...leg(2, 0, c.skin),

      // Shorts on the floor, with a darker back, waistband and side stripe.
      [-10, -14, 20, 12, c.shorts],
      [-10, -14, 4, 12, c.shortsDark],
      [-10, -14, 20, 2, c.shortsDark],
      [3, -12, 1, 8, c.shortsTrim],

      // Jersey and head, lowered.
      [-10, -52 + d, 20, 20, c.jersey],
      [-10, -52 + d, 4, 20, c.jerseyDark],
      [5, -48 + d, 2, 14, c.jerseyLight],
      [-10, -34 + d, 20, 1, c.jerseyDark],
      [-4, -52 + d, 8, 2, c.trim],
      [-2, -52 + d, 4, 1, c.skinDark],
      [-1, -50 + d, 2, 1, c.trim],
      ...this.numberParts(-6, -47 + d, c.trim),
      ...this.headParts(d, 'side', face),

      // Front arm resting forward on the knee.
      [8, -32, 6, 8, c.skin],
      [12, -26, 6, 12, c.skin],
      [12, -20, 6, 2, c.trim],
      [14, -14, 6, 4, c.skin],

      [8, -52 + d, 2, 6, c.trim],
      [-10, -52 + d, 2, 6, c.trim],
    ];
  }

  // Straight toward (front) or away from (back) the camera, moving down/up. Symmetric, so facing only picks which
  // hand dribbles. Walking lifts each foot in turn and swings the arms opposite.
  frontalParts() {
    const c = this.colors;
    const fromFront = this.view === 'front';
    const frame = this.runFrame();
    const u = this.bob();
    const dip = this.hasBall ? this.dribblePose().dip : 0;
    const liftL = frame === 0 ? 3 : 0;
    const liftR = frame === 2 ? 3 : 0;
    const swing = frame === 0 ? 2 : frame === 2 ? -2 : 0;

    const leg = (x, lift) => [
      [x, -22 + u, 6, 10 - u - lift, c.skin],
      [x, -12 - lift, 6, 4, COLORS.sock],
      [x, -11 - lift, 6, 1, c.jersey],
      [x - 1, -8 - lift, 8, 6, c.shoe],
      ...(fromFront
        ? [[x + 1, -8 - lift, 1, 1, c.laces], [x + 3, -8 - lift, 1, 1, c.laces], [x + 2, -7 - lift, 1, 1, c.laces], [x + 4, -7 - lift, 1, 1, c.laces]]
        : [[x + 1, -8 - lift, 4, 2, c.sole]]),
      [x - 1, -2 - lift, 8, 2, c.sole],
    ];

    // Arms hang at both sides; the dribbling (right, in facing terms) forearm stretches with the push.
    const arm = (x, dy, push) => [
      [x, -50 + u + dy, 6, 18 + push, c.skin],
      [x, -48 + u + dy, 1, 14 + push, c.skinDark],
      [x, -38 + u + dy, 6, 2, c.trim],
      [x, -35 + u + dy + push, 6, 1, c.skinDark],
    ];

    const face = fromFront
      ? [
          [-2, 6, 2, 4, c.skinDark],
          [16, 6, 2, 4, c.skinDark],
          ...this.eye(3, 7, 1),
          ...this.eye(9, 7, 1),
          [7, 10, 2, 1, c.skinDark],
        ]
      : [
          [-2, 7, 2, 4, c.skinDark],
          [16, 7, 2, 4, c.skinDark],
        ];

    return [
      ...leg(-8, liftL),
      ...leg(2, liftR),

      // Shorts: waistband, stripes down both sides, hem, and a shadow between the legs.
      [-10, -32 + u, 20, 12, c.shorts],
      [-10, -32 + u, 20, 2, c.shortsDark],
      [-1, -25 + u, 2, 3, c.shortsDark],
      [-10, -30 + u, 1, 8, c.shortsTrim],
      [9, -30 + u, 1, 8, c.shortsTrim],
      [-10, -22 + u, 20, 2, c.shortsTrim],

      // Jersey: shaded edges, collar (V-neck in front), hem, centered number.
      [-10, -52 + u, 20, 20, c.jersey],
      [-10, -52 + u, 2, 20, c.jerseyDark],
      [8, -52 + u, 2, 20, c.jerseyDark],
      [-10, -34 + u, 20, 1, c.jerseyDark],
      ...(fromFront
        ? [[-4, -52 + u, 8, 2, c.trim], [-2, -52 + u, 4, 1, c.skinDark], [-1, -50 + u, 2, 1, c.trim]]
        : [[-4, -52 + u, 8, 1, c.trim]]),
      ...this.numberParts(-7, -47 + u, c.trim),

      ...this.headParts(u, fromFront ? 'front' : 'back', face),

      ...arm(-16, swing, 0),
      ...arm(10, -swing, dip),

      // Armhole straps on both sides.
      [8, -52 + u, 2, 6, c.trim],
      [-10, -52 + u, 2, 6, c.trim],
    ];
  }

  // Jersey number in the 3x5 font with 2px cells. Glyph columns are pre-flipped when facing left so the digits
  // still read correctly.
  numberParts(left, top, color) {
    const digits = this.number.slice(0, 2);
    const w = textWidth(digits);
    const parts = [];
    for (let i = 0; i < digits.length; i++) {
      const glyph = FONT_GLYPHS[digits[i]];
      for (let p = 0; p < 15; p++) {
        if (glyph[p] !== '1') continue;
        const col = i * 4 + (p % 3);
        const dx = left + 2 * (this.facing === 1 ? col : w - 1 - col);
        parts.push([dx, top + 2 * Math.floor(p / 3), 2, 2, color]);
      }
    }
    return parts;
  }

  ballParts() {
    if (this.shot) return ballSprite(SHOOT_BALL_X, SHOOT_BALL_TOP, 0);
    return ballSprite(this.dribbleBallX(), this.dribblePose().ballTop, (this.dribbleT % 1) * (BALL_SIZE - 2));
  }
}
