// The loose ball. While a player holds it, the player draws it and this just waits.
// Positions: x, y on the floor plane; z is the height of the ball's BOTTOM (its center is z + radius).
class Ball {
  constructor() {
    this.held = true;
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.prevX = 0;
    this.prevY = 0;
    this.prevZ = 0;
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.spin = 0;
    this.holder = null;  // the player holding it, while held
    this.shot = null;    // { hoop, points, team } while a shot is live
    this.pass = null;    // { to, team, target, rolls } while a pass is in the air
    this.touched = false; // hit rim or board since the shot was released
    this.thrower = null; // who last shot or passed it: they can't grab it back for noPickup seconds
    this.noPickup = 0;
    this.lockT = 0;      // nobody at all can pick it up while this counts down (after rim-hang / shatter dunks)
    this.reserved = null; // after a basket, only this team may pick the ball up (to bring it back in)
    this.lastTeam = null; // team that last touched it (held, shot, passed, blocked, poked): the other team gets it if it goes out
    this.events = [];    // 'score' / 'airball' for the game to react to
  }

  // Throw from (x, y, z) so the ball's bottom reaches `to` after `time` seconds.
  launch(x, y, z, to, time, shot) {
    this.held = false;
    this.holder = null;
    this.pass = null;
    this.x = this.prevX = x;
    this.y = this.prevY = y;
    this.z = this.prevZ = z;
    this.vx = (to.x - x) / time;
    this.vy = (to.y - y) / time;
    this.vz = (to.z - z + 0.5 * BALL.gravity * time * time) / time;
    this.shot = shot;
    this.touched = false;
    this.noPickup = PICKUP.delay;
    this.lockT = 0;
  }

  // Dunk: the ball is forced straight down through the rim from (x, y, z).
  slam(x, y, z, speed, shot) {
    this.launch(x, y, z, { x, y, z: z - speed }, 1, shot);
    this.vz = -speed;
  }

  // Drop a fresh ball at (x, y) from height z, free to grab right away.
  respawn(x, y, z) {
    this.launch(x, y, z, { x, y, z }, 1, null);
    this.vx = 0;
    this.vy = 0;
    this.vz = 0;
    this.noPickup = 0;
    this.thrower = null;
    this.reserved = null;
    this.lastTeam = null;
    this.lockT = 0;
  }

  update(dt) {
    this.prevX = this.x;
    this.prevY = this.y;
    this.prevZ = this.z;
    if (this.held) return;

    this.noPickup -= dt;
    this.lockT = Math.max(0, this.lockT - dt);
    const h = dt / BALL.substeps;
    for (let i = 0; i < BALL.substeps; i++) this.step(h);
    this.spin += dt * Math.hypot(this.vx, this.vy) * 0.15;
  }

  step(h) {
    const R = BALL.radius;
    const prevCenterZ = this.z + R;

    this.vz -= BALL.gravity * h;
    this.x += this.vx * h;
    this.y += this.vy * h;
    this.z += this.vz * h;

    for (const hoop of HOOPS) {
      this.collideBoard(hoop);
      if (hoop.broken) continue;
      this.collideRim(hoop);
      this.netDrag(hoop, h);
    }

    // A make: the center drops through the rim plane inside the ring.
    if (this.shot && prevCenterZ >= HOOP.rimZ && this.z + R < HOOP.rimZ) {
      const hoop = this.shot.hoop;
      if (Math.hypot(this.x - hoop.x, this.y - hoop.y) < HOOP.rimR) {
        const dunk = !!this.shot.dunk;
        this.events.push({ type: 'score', hoop, team: this.shot.team, points: this.shot.points, swish: !this.touched, dunk });
        hoop.netT = HOOP.swishTime;
        hoop.netSwing = dunk ? HOOP.maxSwing : clamp(this.shot.dist / HOOP.swingPerUnit, 1, HOOP.maxSwing);
        this.shot = null;
      }
    }

    if (this.z < 0) {
      this.z = 0;
      if (this.vz < 0) {
        if (this.shot && !this.touched) this.events.push({ type: 'airball', x: this.x, y: this.y });
        this.shot = null;
        this.pass = null; // a pass that hits the floor is just a loose ball
        this.vz = -this.vz * BALL.bounce;
        if (this.vz < BALL.minBounce) this.vz = 0;
      }
    }
    if (this.z === 0 && this.vz === 0) {
      const k = Math.exp(-BALL.rollFriction * h);
      this.vx *= k;
      this.vy *= k;
    }

    // Keep the ball on the visible floor.
    const xMin = -COURT.apron * 3;
    const xMax = COURT.length + COURT.apron * 3;
    if (this.x < xMin || this.x > xMax) {
      this.x = clamp(this.x, xMin, xMax);
      this.vx *= -0.5;
    }
    if (this.y < -COURT.apron || this.y > COURT.width + COURT.apron) {
      this.y = clamp(this.y, -COURT.apron, COURT.width + COURT.apron);
      this.vy *= -0.5;
    }
  }

  // The rim is a thin ring: push the ball out from the nearest point on it and bounce.
  collideRim(hoop) {
    const R = BALL.radius;
    const dx = this.x - hoop.x;
    const dy = this.y - hoop.y;
    const dh = Math.hypot(dx, dy);
    if (dh < 0.001) return;
    const px = hoop.x + (dx / dh) * HOOP.rimR;
    const py = hoop.y + (dy / dh) * HOOP.rimR;
    let nx = this.x - px;
    let ny = this.y - py;
    let nz = this.z + R - HOOP.rimZ;
    const d = Math.hypot(nx, ny, nz);
    if (d >= R || d < 0.001) return;

    nx /= d;
    ny /= d;
    nz /= d;
    this.x = px + nx * R;
    this.y = py + ny * R;
    this.z = HOOP.rimZ + nz * R - R;
    const vn = this.vx * nx + this.vy * ny + this.vz * nz;
    if (vn < 0) {
      const k = (1 + BALL.rimBounce) * vn;
      this.vx -= k * nx;
      this.vy -= k * ny;
      this.vz -= k * nz;
    }
    this.touched = true;
  }

  collideBoard(hoop) {
    const R = BALL.radius;
    const cz = this.z + R;
    if (Math.abs(this.y - hoop.y) > HOOP.boardHalfW) return;
    if (cz < HOOP.boardBottom - R || cz > HOOP.boardTop + R) return;
    const inFront = (this.x - hoop.boardX) * hoop.dir; // distance from the board's face toward the court
    if (inFront < R && inFront > -R && this.vx * hoop.dir < 0) {
      this.x = hoop.boardX + hoop.dir * R;
      this.vx = -this.vx * BALL.boardBounce;
      this.touched = true;
    }
  }

  // Inside the net the ball loses its sideways speed and drops slowly.
  netDrag(hoop, h) {
    const cz = this.z + BALL.radius;
    if (cz > HOOP.rimZ || cz < HOOP.rimZ - HOOP.netDepth) return;
    if (Math.hypot(this.x - hoop.x, this.y - hoop.y) > HOOP.rimR) return;
    const k = Math.exp(-10 * h);
    this.vx *= k;
    this.vy *= k;
    this.vz = Math.max(this.vz, -110);
  }

  prepare(alpha) {
    const x = lerp(this.prevX, this.x, alpha);
    const y = lerp(this.prevY, this.y, alpha);
    const ground = project(x, y);
    this.sx = Math.round(ground.x);
    this.sy = Math.round(ground.y);
    const z = lerp(this.prevZ, this.z, alpha);
    this.by = Math.round(project(x, y, z).y);
    this.depthScale = spriteScale(y);
    // High in the air the ball is drawn bigger, as if rising toward the camera; it's back to normal by rim height.
    const grow = clamp(1 + (z - BALL.growFrom) / BALL.growPer, 1, BALL.growMax);
    this.size = Math.round(BALL_SIZE * this.depthScale * grow);
  }

  drawShadow(ctx) {
    const w = Math.max(4, Math.round((this.z > 30 ? 6 : this.z > 10 ? 8 : 12) * this.depthScale));
    ctx.fillStyle = COLORS.shadow;
    ctx.fillRect(this.sx - (w >> 1) + 2, this.sy - 2, w - 4, 1);
    ctx.fillRect(this.sx - (w >> 1), this.sy - 1, w, 2);
    ctx.fillRect(this.sx - (w >> 1) + 2, this.sy + 1, w - 4, 1);
  }

  draw(ctx) {
    const d = this.size;
    drawRects(ctx, ballSprite(0, 0, this.spin, d), this.sx - Math.floor(d / 2), this.by - d);
  }
}
