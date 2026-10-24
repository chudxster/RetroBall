const camera = {
  x: COURT.length / 2,
  prevX: COURT.length / 2,
  renderX: COURT.length / 2,
  zoom: 1,
  prevZoom: 1,
  renderZoom: 1,
  tilt: 0,
  prevTilt: 0,
  renderTilt: 0,
  shake: 0,
  pan: null, // { from, to, t, time } while gliding somewhere instead of following

  update(dt, targetX, targetZoom, targetTilt) {
    this.prevX = this.x;
    this.prevZoom = this.zoom;
    this.prevTilt = this.tilt;
    this.zoom += (targetZoom - this.zoom) * (1 - Math.exp(-CAMERA.zoomSmoothing * dt));
    this.tilt += (targetTilt - this.tilt) * (1 - Math.exp(-CAMERA.tiltSmoothing * dt));
    if (this.pan) {
      const p = this.pan;
      p.t += dt;
      const k = Math.min(p.t / p.time, 1);
      this.x = lerp(p.from, p.to, k * k * (3 - 2 * k)); // ease in and out
      if (k >= 1) this.pan = null;
    } else {
      this.x += (this.clampX(targetX) - this.x) * (1 - Math.exp(-CAMERA.smoothing * dt));
    }
    this.shake = Math.max(0, this.shake - dt);
  },

  panTo(x, time) {
    this.pan = { from: this.x, to: this.clampX(x), t: 0, time };
  },

  snap(x) {
    this.x = this.prevX = this.clampX(x);
    this.pan = null;
  },

  // Keep the view from drifting more than edgeOverscan past either baseline.
  clampX(x) {
    const half = VIEW_W / 2 / (PROJ.nearScale * this.zoom);
    const min = half - CAMERA.edgeOverscan;
    const max = COURT.length - half + CAMERA.edgeOverscan;
    return min < max ? clamp(x, min, max) : COURT.length / 2;
  },

  // Snap to whole near-side pixels once per frame so the floor and sprites move together.
  prepare(alpha) {
    this.renderZoom = lerp(this.prevZoom, this.zoom, alpha);
    this.renderTilt = lerp(this.prevTilt, this.tilt, alpha);
    const jitter = this.shake > 0 ? rand(-1.5, 1.5) : 0;
    this.renderX = Math.round((lerp(this.prevX, this.x, alpha) + jitter) * PROJ.nearScale) / PROJ.nearScale;
  },
};

// Zooming and tilting scale the court around this screen row (the middle of the court at 1x).
const ZOOM_ANCHOR_Y = (PROJ.farY + PROJ.nearY) / 2;

function scaleAtY(y) {
  const farScale = lerp(PROJ.farScale, PROJ.nearScale * CAMERA.tiltFarScale, camera.renderTilt);
  return lerp(farScale, PROJ.nearScale, y / COURT.width) * camera.renderZoom;
}

// How much the floor's depth is stretched on screen: zoom, plus extra when tilted higher.
function depthStretch() {
  return camera.renderZoom * (1 + CAMERA.tiltDepth * camera.renderTilt);
}

function screenYForWorldY(y) {
  return ZOOM_ANCHOR_Y + (lerp(PROJ.farY, PROJ.nearY, y / COURT.width) - ZOOM_ANCHOR_Y) * depthStretch();
}

function worldYForScreenY(sy) {
  const unstretched = ZOOM_ANCHOR_Y + (sy - ZOOM_ANCHOR_Y) / depthStretch();
  return ((unstretched - PROJ.farY) / (PROJ.nearY - PROJ.farY)) * COURT.width;
}

// Sprite size multiplier for something standing at depth y (includes the camera zoom).
function spriteScale(y) {
  const s = lerp(DEPTH_SCALE.far, DEPTH_SCALE.near, clamp(y / COURT.width, 0, 1)) * camera.renderZoom;
  return Math.round(s / DEPTH_SCALE.step) * DEPTH_SCALE.step;
}

// World (x, y, z) -> screen pixels.
function project(x, y, z = 0) {
  const s = scaleAtY(y);
  return {
    x: VIEW_W / 2 + (x - camera.renderX) * s,
    y: screenYForWorldY(y) - z * s,
  };
}
