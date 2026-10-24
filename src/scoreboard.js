// The scorer's table at center court on the far sideline, with a split-flap scoreboard on top: three digit cards per
// team that flip one number at a time up to the new score.
const TABLE = { x: COURT.length / 2, y: -9 };
const FLIP = { time: 0.1 }; // seconds per single-digit flip
const CARD = { w: 13, h: 19, split: 9, top: -54, cell: 3 }; // digits use the 3x5 font with 3px cells
const CARD_X = [-57, -43, -29, 17, 31, 45]; // home hundreds/tens/units, then away

const scoreboard = {
  cards: CARD_X.map(() => ({ shown: 0, next: 0, t: 0, flipping: false })),
};

function scoreDigits(n) {
  const v = clamp(Math.floor(n), 0, 999);
  return [Math.floor(v / 100), Math.floor(v / 10) % 10, v % 10];
}

// Each card that doesn't match its target flips to the next number, one flip at a time, until it does.
function updateScoreboard(dt, home, away) {
  const targets = [...scoreDigits(home), ...scoreDigits(away)];
  scoreboard.cards.forEach((card, i) => {
    if (card.flipping) {
      card.t += dt;
      if (card.t >= FLIP.time) {
        card.shown = card.next;
        card.flipping = false;
      }
    } else if (card.shown !== targets[i]) {
      card.next = (card.shown + 1) % 10;
      card.t = 0;
      card.flipping = true;
    }
  });
}

// For each digit, the lit spans [x0, x1) of every card row: the 3x5 font with CARD.cell-px cells, centered.
const DIGIT_ROWS = Array.from({ length: 10 }, (_, d) =>
  Array.from({ length: CARD.h }, (_, r) => {
    const n = CARD.cell;
    const left = (CARD.w - 3 * n) >> 1;
    const g = Math.floor((r - 2) / n);
    if (r < 2 || g > 4) return [];
    const glyph = FONT_GLYPHS[d];
    return [0, 1, 2].filter((c) => glyph[g * 3 + c] === '1').map((c) => [left + c * n, left + (c + 1) * n]);
  }));

function tableParts(home, away) {
  const top = mix(COLORS.tableTop, COLORS.line, 0.3);
  return [
    // Table: front panel with a stripe in each team's color, then the top slab.
    [-75, -26, 150, 26, COLORS.tablePanel],
    [-75, -14, 75, 4, home],
    [0, -14, 75, 4, away],
    [-75, -3, 150, 3, shade(COLORS.tablePanel, 0.7)],
    [-78, -30, 156, 5, COLORS.tableTop],
    [-78, -30, 156, 1, top],
    // Scoreboard housing, a color bar over each team's digits, and a colon between them.
    [-62, -62, 124, 32, COLORS.boardFrame],
    [-60, -60, 120, 28, COLORS.outline],
    [-57, -58, 40, 2, home],
    [17, -58, 40, 2, away],
    [-2, -49, 3, 3, COLORS.line],
    [-2, -41, 3, 3, COLORS.line],
  ];
}

function tableLayer(jersey) {
  return {
    y: TABLE.y,
    draw(ctx) {
      const p = project(TABLE.x, TABLE.y);
      if (p.x < -100 || p.x > VIEW_W + 100) return;
      const ox = Math.round(p.x);
      const oy = Math.round(p.y);
      const k = spriteScale(TABLE.y);
      drawRects(ctx, tableParts(jersey, awayJersey(jersey)), ox, oy, 1, k);
      scoreboard.cards.forEach((card, i) => drawFlapCard(ctx, card, ox, oy, k, CARD_X[i], CARD.top));
    },
  };
}

// One split-flap card. Mid-flip, the top half already shows the new number and the bottom half still the old one;
// the flap first folds the old top half down to the split line, then unfolds the new bottom half below it.
function drawFlapCard(ctx, card, ox, oy, k, x, y) {
  const X = (sx) => ox + Math.round(sx * k);
  const Y = (sy) => oy + Math.round(sy * k);
  const S = CARD.split;

  // Rows r0..r1 of `digit`, each source row r drawn between map(r) and map(r + 1) (card-relative).
  const half = (digit, r0, r1, map, bg) => {
    for (let r = r0; r < r1; r++) {
      const ya = Y(y + map(r));
      const yb = Y(y + map(r + 1));
      if (yb <= ya) continue;
      ctx.fillStyle = bg;
      ctx.fillRect(X(x), ya, X(x + CARD.w) - X(x), yb - ya);
      ctx.fillStyle = COLORS.line;
      for (const [a, b] of DIGIT_ROWS[digit][r]) ctx.fillRect(X(x + a), ya, X(x + b) - X(x + a), yb - ya);
    }
  };
  const same = (r) => r;

  const old = card.shown;
  const now = card.flipping ? card.next : card.shown;
  half(now, 0, S, same, COLORS.flapCard);
  half(old, S, CARD.h, same, COLORS.flapCard);
  if (card.flipping) {
    const p = card.t / FLIP.time;
    if (p < 0.5) {
      const f = 1 - 2 * p;
      half(old, 0, S, (r) => S - (S - r) * f, COLORS.flapMoving);
    } else {
      const f = 2 * p - 1;
      half(now, S, CARD.h, (r) => S + (r - S) * f, COLORS.flapMoving);
    }
  }
  ctx.fillStyle = COLORS.flapSplit;
  ctx.fillRect(X(x), Y(y + S), X(x + CARD.w) - X(x), 1);
}

function drawTableShadow(ctx) {
  const p = project(TABLE.x, TABLE.y);
  const w = Math.round(160 * spriteScale(TABLE.y));
  ctx.fillStyle = COLORS.shadow;
  ctx.fillRect(Math.round(p.x) - (w >> 1), Math.round(p.y) - 1, w, 3);
}
