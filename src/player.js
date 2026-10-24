// Sprite measurements are in game pixels at 640x360, relative to the point between the feet, facing right.

// Leg x-offsets (front leg, back leg) for each frame of the run cycle.
const LEG_SHIFT = [[6, -6], [0, 0], [-6, 6], [0, 0]];
const DRIBBLE_HEIGHT = 20;
const BALL_OFFSET_X = 10; // left edge of the ball relative to the player's feet, in facing direction
const HAND_Y = -32;       // bottom of the dribbling hand at rest
const HAND_DIP = 4;       // how far the hand travels with each push
const PUSH_START = 0.5;   // dribble phase when the push begins (ball at the top)...
const PUSH_LEN = 0.3;     // ...and how much of the cycle it lasts; the hand rests at the top the rest of the time
const TURN_SPEED = 25;    // depth speed at which the body turns toward or away from the camera
const HEAD_X = -8;        // the head is a 16x16 block with its top-left here
const HEAD_Y = -70;
const SHOOT_BALL_X = 4;   // ball held overhead while rising for a shot: left edge...
const SHOOT_BALL_TOP = -80; // ...and top

// Hair as [hx, hy, w, h] rects relative to the head's top-left, for the side view (facing right) and from behind,
// plus a few lighter strands for shine.
const HAIR_STYLES = {
  short: {
    side: [[1, 0, 14, 1], [0, 1, 16, 3], [0, 4, 6, 5], [6, 4, 2, 1]],
    back: [[1, 0, 14, 1], [0, 1, 16, 8], [1, 9, 14, 2]],
    shine: { side: [[3, 1, 7, 1]], back: [[3, 1, 9, 1]] },
  },
  buzz: {
    side: [[1, 0, 14, 1], [0, 1, 16, 1], [0, 2, 4, 4]],
    back: [[1, 0, 14, 1], [0, 1, 16, 4]],
    shine: { side: [], back: [] },
  },
  afro: {
    side: [[2, -6, 12, 1], [0, -5, 16, 1], [-2, -4, 20, 8], [-2, 4, 9, 6], [-1, 10, 6, 1]],
    back: [[2, -6, 12, 1], [0, -5, 16, 1], [-2, -4, 20, 14], [-1, 10, 18, 2]],
    shine: { side: [[2, -4, 8, 1], [-1, -2, 2, 2]], back: [[3, -4, 10, 1]] },
  },
  mohawk: {
    side: [[3, -6, 10, 2], [2, -4, 12, 2], [1, -2, 14, 2], [0, 0, 4, 3]],
    back: [[6, -6, 4, 16]],
    shine: { side: [[4, -5, 6, 1]], back: [[7, -5, 1, 6]] },
  },
  long: {
    side: [[1, 0, 14, 1], [0, 1, 16, 3], [0, 4, 6, 5], [-3, 2, 5, 18], [-2, 20, 3, 2]],
    back: [[1, -1, 14, 1], [-1, 0, 18, 4], [-3, 4, 22, 16], [-2, 20, 20, 2]],
    shine: { side: [[3, 1, 7, 1], [-2, 6, 1, 8]], back: [[3, 0, 10, 1], [0, 6, 1, 10]] },
  },
  bald: { side: [], back: [], shine: { side: [], back: [] } },
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
    this.turn = 0;
    this.stride = 0;
    this.dribbleT = 0;
    this.hasBall = true;
    this.shot = null; // set by Shooting while the player is in a jump shot
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

    // No steering in the air during a jump shot.
    let ix = this.shot ? 0 : move.x;
    let iy = this.shot ? 0 : move.y;
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
    // -1 = turned away from the camera (moving up), 1 = turned toward it (moving down), 0 = side-on.
    this.turn = this.shot ? 0 : this.vy < -TURN_SPEED ? -1 : this.vy > TURN_SPEED ? 1 : 0;

    const speed = Math.hypot(this.vx, this.vy);
    this.stride += speed * dt;
    this.dribbleT += dt * lerp(2, 3.2, Math.min(speed / PLAYER.sprintSpeed, 1));
    this.moving = speed > 10;
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
      const center = sx + this.facing * w(BALL_OFFSET_X + BALL_SIZE / 2);
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
    const c = this.colors;
    const frame = this.runFrame();
    const [front, back] = frame < 0 ? [0, 0] : LEG_SHIFT[frame];
    const u = this.bob();
    const dip = this.hasBall && !this.shot ? this.dribblePose().dip : 0;
    const armSwing = frame === 0 ? 4 : frame === 2 ? -4 : 0;

    // Whichever arm is nearer the camera is drawn wider, unshaded and in front of the body.
    const backNear = this.turn < 0;
    const frontNear = this.turn >= 0;
    const backW = backNear ? 8 : this.turn > 0 ? 4 : 6;
    const backH = backNear ? 18 : this.turn > 0 ? 14 : 16;
    const backX = -14 + armSwing + (backW === 4 ? 2 : 0);
    const backSkin = backNear ? c.skin : c.skinDark;
    const backTop = -50 + u;
    let backArm = [
      [backX, backTop, backW, backH, backSkin],
      [backX, backTop + 2, 1, backH - 4, backNear ? c.skinDark : c.skinDarker],
      [backX, backTop + backH - 6, backW, 2, c.trim],
      [backX, backTop + backH - 2, backW, 1, backNear ? c.skinDark : c.skinDarker],
    ];
    const frontW = this.turn > 0 ? 8 : this.turn < 0 ? 4 : 6;
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

    // Turned away from the camera: no face, the back of the hair style, and an ear on each side.
    const away = this.turn < 0;
    const hx = HEAD_X;
    const hy = HEAD_Y + u;
    const style = HAIR_STYLES[this.look.hairStyle] || HAIR_STYLES.short;
    const view = away ? 'back' : 'side';
    const hair = [
      ...style[view].map(([x, y, w, h]) => [hx + x, hy + y, w, h, c.hair]),
      ...style.shine[view].map(([x, y, w, h]) => [hx + x, hy + y, w, h, c.hairShine]),
    ];
    const ears = [
      [hx - 2, hy + 7, 2, 4, c.skinDark],
      [hx + 16, hy + 7, 2, 4, c.skinDark],
    ];
    // Kept simple: an ear, one eye and a nose bump.
    const face = [
      [hx + 5, hy + 7, 2, 3, c.skinDark],     // ear
      [hx + 12, hy + 6, 2, 2, COLORS.eye],
      [hx + 16, hy + 8, 1, 2, c.skin],        // nose
    ];

    return [
      // Back leg is shaded darker.
      ...leg(-8 + back, c.skinDark, c.skinDarker),
      ...leg(2 + front, c.skin, c.skinDark),

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
      [-4, -52 + u, 8, 2, c.trim],
      [-2, -52 + u, 4, 1, c.skinDark],
      [-1, -50 + u, 2, 1, c.trim],
      ...this.numberParts(-6, -47 + u, c.trim),

      // Head: neck, rounded head with a top highlight (hidden under most hair) and a shaded jaw,
      // then hair, with face details on top when facing the camera.
      [-3, -55 + u, 6, 3, c.skinDark],
      [hx + 1, hy, 14, 16, c.skin],
      [hx, hy + 1, 16, 14, c.skin],
      [hx + 4, hy + 2, 4, 1, c.skinLight],
      [hx + 2, hy + 15, 7, 1, c.skinDark],
      ...(away ? ears : []),
      ...hair,
      ...(away ? [] : face),

      // Near arm goes in front of the body.
      ...(backNear ? backArm : frontArm),

      // Armhole straps on both sides of the jersey go last so the arms never cover them.
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
    return ballSprite(BALL_OFFSET_X, this.dribblePose().ballTop, (this.dribbleT % 1) * (BALL_SIZE - 2));
  }
}
