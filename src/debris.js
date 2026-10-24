// Pieces that fly off when a rim shatters: the rim itself plus shards. They fall, bounce a little and settle.
const DEBRIS = { shards: 18, bounce: 0.35, friction: 0.7 };
const SHARD_COLORS = [COLORS.rim, COLORS.rimShine, COLORS.rimBack, COLORS.net, COLORS.boardEdge];

function spawnRimDebris(game, hoop) {
  game.debris.push({ rim: true, x: hoop.x, y: hoop.y, z: HOOP.rimZ, vx: hoop.dir * 40, vy: 15, vz: 30 });
  for (let i = 0; i < DEBRIS.shards; i++) {
    const a = rand(0, Math.PI * 2);
    const speed = rand(40, 120);
    game.debris.push({
      x: hoop.x + Math.cos(a) * HOOP.rimR,
      y: hoop.y + Math.sin(a) * HOOP.rimR,
      z: HOOP.rimZ,
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed * 0.6,
      vz: rand(40, 160),
      size: Math.floor(rand(1, 4)),
      color: SHARD_COLORS[i % SHARD_COLORS.length],
    });
  }
}

function updateDebris(game, dt) {
  for (const d of game.debris) {
    d.vz -= BALL.gravity * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.z += d.vz * dt;
    if (d.z < 0) {
      d.z = 0;
      d.vz = -d.vz * DEBRIS.bounce;
      d.vx *= DEBRIS.friction;
      d.vy *= DEBRIS.friction;
    }
  }
}

// Depth-sorted drawables, like the hoop layers.
function debrisLayers(game) {
  return game.debris.map((d) => ({
    y: d.y,
    draw(ctx) {
      const p = project(d.x, d.y, d.z);
      const x = Math.round(p.x);
      const y = Math.round(p.y);
      if (d.rim) {
        plotPixels(ctx, RIM_PX.backing, x, y, COLORS.outline);
        plotPixels(ctx, RIM_PX.back, x, y, COLORS.rimBack);
        drawRimFront(ctx, x, y);
      } else {
        ctx.fillStyle = d.color;
        ctx.fillRect(x, y, d.size, d.size);
      }
    },
  }));
}
