// The locker room (main menu > Locker room): a room you walk around in as your player (the move keys), with the coach
// at the whiteboard, your two teammates at their lockers and a reporter by the TV camera. Walk up to one and press
// your dunk key (or Enter / Space) to talk: each hands out quests and pays out finished ones (see Quests). The trophy
// case on the right wall holds every trophy earned; there you pick which ones stand on the scoreboard's shelf in
// games. You come in through a black door on the left side wall; walk back out of it (or press Esc) to go back to the
// main menu. While it's open main.js draws it instead of the demo game.
const LOCKER = {
  bounds: { x0: 40, x1: 616, y0: 198, y1: 342 }, // where the player's feet can go
  speed: 110,      // px per second across (depth goes at PLAYER.depthSpeed of it)
  talkRange: 36,   // how close to stand to talk
  npcRadius: 14,   // nobody walks through anybody
  start: { x: 56, y: 262 },     // just inside the door
  door: { y0: 220, y1: 300 },   // walking into the left wall between these leaves

  caseSpot: { x: 566, y: 204 }, // stand here (ish) to open the trophy case
};

const Locker = (() => {
  const box = document.getElementById('locker-talk');
  const nameEl = document.getElementById('locker-talk-name');
  const textEl = document.getElementById('locker-talk-text');
  const actions = document.getElementById('locker-talk-actions');
  let game = null; // from main.js: { look(i), name(i), leave() }
  let open = false;
  let talking = null; // who (or 'case') the panel is open for
  let note = '';      // a line shown once at the top of the panel (e.g. after a claim)
  let swallowUp = null;
  let me = null;
  let time = 0;

  // The people in the room: where they stand and what they look like. Teammates wear the team's kit and their own
  // looks (main.js); the coach and the reporter dress for work.
  const NPCS = [
    { id: 'coach', x: 92, y: 214, look: () => ({ ...DEFAULT_LOOK, skin: SKINS[4], hairStyle: 'buzz', hair: '#94b0c2', jersey: '#566c86', shorts: '#333c57', shoe: '#1a1c2c', laces: '#1a1c2c', number: '' }) },
    { id: 'mate1', x: 236, y: 212, look: () => game.look(1) },
    { id: 'mate2', x: 412, y: 216, look: () => game.look(2) },
    { id: 'press', x: 500, y: 288, look: () => ({ ...DEFAULT_LOOK, skin: SKINS[1], hairStyle: 'long', hair: '#7a4a32', jersey: '#b13e53', shorts: '#1a1c2c', shoe: '#1a1c2c', laces: '#1a1c2c', number: '' }) },
  ];
  const nameOf = (id) => ({ coach: 'COACH', mate1: game.name(1).toUpperCase(), mate2: game.name(2).toUpperCase(), press: 'THE REPORTER' })[id];
  // What each one says: hello, handing out a quest, checking in, and paying out.
  const LINES = {
    coach: { offer: 'Good, you\'re here. I want to see this next game:', active: 'I\'m still waiting on', done: 'That\'s what I\'m talking about.' },
    mate1: { offer: 'Bet you can\'t do this:', active: 'Still waiting for you to', done: 'Okay, okay. You earned it.' },
    mate2: { offer: 'Let\'s make some noise. Go', active: 'Come on, you still have to', done: 'The whole bench saw that!' },
    press: { offer: 'The fans want a story. Give them this:', active: 'My editor still needs you to', done: 'That\'s going on the front page.' },
  };

  function init(target) {
    game = target;
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', (e) => {
      if (e.code !== swallowUp) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      swallowUp = null;
    }, true);
  }

  function enter() {
    open = true;
    time = 0;
    talking = null;
    box.hidden = true;
    me = new Player({ x: LOCKER.start.x, y: LOCKER.start.y, look: game.look(0) });
    me.hasBall = false;
    me.view = 'side';
    for (const n of NPCS) {
      n.player = new Player({ x: n.x, y: n.y, look: n.look() });
      n.player.hasBall = false;
    }
    document.getElementById('pause-btn').hidden = true;
    document.getElementById('game').focus();
  }

  function leave() {
    closeTalk();
    open = false;
    game.leave();
  }

  // Who's close enough to talk to: the nearest person in range, or the trophy case, or null.
  function nearby() {
    let best = null;
    let bestD = LOCKER.talkRange;
    for (const n of NPCS) {
      const d = Math.hypot(n.x - me.x, (n.y - me.y) * 1.5);
      if (d < bestD) {
        bestD = d;
        best = n.id;
      }
    }
    if (!best && Math.hypot(me.x - LOCKER.caseSpot.x, me.y - LOCKER.caseSpot.y) < LOCKER.talkRange * 1.6) best = 'case';
    return best;
  }

  function onKey(e) {
    if (!open) return;
    if (talking) {
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeTalk();
      } else if (e.code === 'ArrowDown' || e.code === 'ArrowUp' || e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        // Arrows step through the panel's buttons.
        e.preventDefault();
        e.stopImmediatePropagation();
        const buttons = [...box.querySelectorAll('button:not(:disabled)')];
        const at = buttons.indexOf(document.activeElement);
        const step = e.code === 'ArrowDown' || e.code === 'ArrowRight' ? 1 : -1;
        if (buttons.length) buttons[(at + step + buttons.length) % buttons.length].focus();
      }
      return;
    }
    if (e.code === 'Escape') {
      e.preventDefault();
      e.stopImmediatePropagation();
      leave();
      return;
    }
    const talk = e.code === 'Enter' || e.code === 'Space' || Input.actionFor('solo', e.code) === 'action';
    if (talk && !e.repeat) {
      const who = nearby();
      if (!who) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      swallowUp = e.code; // so the key's release doesn't press the panel's first button
      openTalk(who);
    }
  }

  function openTalk(who) {
    talking = who;
    note = '';
    renderTalk();
  }

  function closeTalk() {
    talking = null;
    box.hidden = true;
    document.getElementById('game').focus();
  }

  function button(text, onClick, quiet = false) {
    const b = el('button', quiet ? 'btn btn-quiet' : 'btn', text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  // The talk panel: a quest offered / in progress / ready to claim, or the trophy case.
  function renderTalk() {
    box.hidden = false;
    box.classList.toggle('trophy-case', talking === 'case');
    const items = [];
    if (talking === 'case') {
      renderCase(items);
    } else {
      const q = Quests.status(talking);
      const lines = LINES[talking];
      nameEl.textContent = nameOf(talking);
      if (q.state === 'offer') {
        textEl.textContent = `${note ? `${note} ` : ''}${lines.offer} ${q.text}. Reward: ${q.reward} tokens.`;
        items.push(button('Take it', () => {
          Quests.accept(talking);
          note = '';
          closeTalk();
        }), button('Not now', closeTalk, true));
      } else if (q.state === 'active') {
        textEl.textContent = `${lines.active} ${q.text.toLowerCase()}${q.n ? ` (${q.progress}/${q.n})` : ''}.`;
        items.push(button('On it', closeTalk));
      } else {
        textEl.textContent = `${lines.done} ${q.text}: done!`;
        items.push(button(`Claim ${q.reward} tokens`, () => {
          const got = Quests.claim(talking);
          Sfx.play('goal');
          note = `+${got} tokens!`;
          renderTalk();
        }));
      }
    }
    actions.replaceChildren(...items);
    const first = actions.querySelector('button') || box.querySelector('button');
    if (first) first.focus();
  }

  // The trophy case: every trophy earned, each a button that puts it on the scoreboard's shelf or takes it off.
  function renderCase(items) {
    nameEl.textContent = 'TROPHY CASE';
    const earned = Trophies.earned();
    const onShelf = Trophies.shelf().length;
    textEl.textContent = earned.length
      ? `Pick which trophies stand on the scoreboard's shelf in games (${onShelf}/${TROPHY_SHELF_MAX} on it).`
      : 'Nothing in here yet. Trophies come from playing: shots, points, dunks, steals, quests and more.';
    const grid = el('div', 'case-grid');
    for (const t of earned) {
      const b = el('button', 'case-item');
      b.type = 'button';
      const cup = el('span', 'case-cup');
      cup.style.background = t.color;
      b.append(cup, el('span', '', t.name));
      b.setAttribute('aria-pressed', String(Trophies.onShelf(t.id)));
      b.addEventListener('click', () => {
        Trophies.toggleShelf(t.id);
        renderTalk();
        const again = [...box.querySelectorAll('.case-item')].find((x) => x.textContent === b.textContent);
        if (again) again.focus();
      });
      grid.append(b);
    }
    // Still to earn: each family's next metal.
    for (const f of Trophies.list().families) {
      if (f.metal >= 0 || f.next === null) continue;
      grid.append(el('span', 'case-item locked', `${f.name}: ${f.count}/${f.next} ${f.what}`));
    }
    items.push(button('Done', closeTalk));
    actions.replaceChildren();
    textEl.after(grid);
    box.querySelectorAll('.case-grid').forEach((g) => g !== grid && g.remove());
  }

  function update(dt) {
    time += dt;
    if (talking !== 'case') box.querySelectorAll('.case-grid').forEach((g) => g.remove());
    const m = talking ? { x: 0, y: 0 } : Input.move();
    const len = Math.hypot(m.x, m.y) || 1;
    const mx = m.x / len;
    const my = m.y / len;
    const b = LOCKER.bounds;
    let x = clamp(me.x + mx * LOCKER.speed * dt, b.x0, b.x1);
    let y = clamp(me.y + my * LOCKER.speed * PLAYER.depthSpeed * dt, b.y0, b.y1);
    for (const n of NPCS) {
      const dx = x - n.x;
      const dy = (y - n.y) * 2;
      const d = Math.hypot(dx, dy);
      if (d < LOCKER.npcRadius && d > 0) {
        x = n.x + (dx / d) * LOCKER.npcRadius;
        y = n.y + ((dy / d) * LOCKER.npcRadius) / 2;
      }
    }
    // Out the door.
    if (!talking && mx < 0 && x <= b.x0 && y >= LOCKER.door.y0 && y <= LOCKER.door.y1) {
      leave();
      return;
    }
    const moved = Math.hypot(x - me.x, y - me.y);
    me.x = x;
    me.y = y;
    me.moving = moved > 0.01;
    me.speed = me.moving ? PLAYER.topSpeed * 0.8 : 0;
    me.stride += moved;
    if (me.moving) {
      me.vx = mx * PLAYER.topSpeed;
      me.vy = my * PLAYER.topSpeed * PLAYER.depthSpeed;
      me.view = me.viewForVelocity();
      if (mx) me.facing = Math.sign(mx);
    }
    // The others turn to face you.
    for (const n of NPCS) {
      n.player.facing = me.x < n.x ? -1 : 1;
      n.player.view = Math.abs(me.x - n.x) < 20 ? 'front' : 'frontQ';
    }
  }

  // Depth scale like the court's: a little bigger nearer the front.
  const scaleAt = (y) => Math.round(lerp(0.9, 1.15, clamp((y - 190) / 160, 0, 1)) / 0.05) * 0.05;

  function place(p, x, y) {
    p.sx = Math.round(x);
    p.sy = Math.round(y);
    p.by = Math.round(y);
    p.scale = scaleAt(y);
  }

  function draw(ctx) {
    drawRoom(ctx);
    const people = [{ p: me, x: me.x, y: me.y }, ...NPCS.map((n) => ({ p: n.player, x: n.x, y: n.y, n }))];
    people.sort((a, b) => a.y - b.y);
    for (const { p, x, y } of people) {
      place(p, x, y);
      p.drawShadow(ctx);
    }
    for (const { p, n } of people) {
      if (n && n.id === 'press') drawCamera(ctx, n);
      p.draw(ctx);
      if (n && n.id === 'press') rect(ctx, p.sx + p.facing * 9, p.by - 44, 2, 6, '#1a1c2c'); // the mic
    }
    for (const n of NPCS) drawMarker(ctx, n);
    const who = talking ? null : nearby();
    if (who) {
      const at = who === 'case' ? { x: LOCKER.caseSpot.x, y: 172 } : { x: NPCS.find((n) => n.id === who).x, y: NPCS.find((n) => n.id === who).y - 112 };
      const text = `${Input.keyLabel('action')} ${who === 'case' ? 'TROPHIES' : 'TALK'}`;
      const w = textWidth(text, 2) + 10;
      rect(ctx, at.x - w / 2, at.y - 4, w, 16, '#1a1c2c');
      drawText(ctx, text, at.x, at.y, '#ffcd75', { align: 'center', scale: 2 });
    }
    rect(ctx, 0, VIEW_H - 18, VIEW_W, 18, '#1a1c2c');
    drawText(ctx, `${Input.moveLabel()} WALK  ${Input.keyLabel('action')} TALK  DOOR: MAIN MENU`, VIEW_W / 2, VIEW_H - 14, COLORS.hint, { align: 'center', scale: 2 });
  }

  // A quest marker over someone's head: a yellow ! with a quest to hand out, a bouncing green ! with tokens to claim.
  function drawMarker(ctx, n) {
    const s = Quests.status(n.id).state;
    if (s === 'active') return;
    const bounce = s === 'done' ? Math.round(Math.abs(Math.sin(time * 5)) * 3) : 0;
    const x = n.x;
    const y = n.y - 86 - bounce;
    rect(ctx, x - 5, y - 3, 10, 16, '#1a1c2c');
    drawText(ctx, '!', x, y, s === 'done' ? '#a7f070' : '#ffcd75', { align: 'center', scale: 2 });
  }

  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  // The room: ceiling lights, the back wall with the whiteboard, the team's lockers and the trophy case, a bench,
  // and the floor with the team's logo.
  function drawRoom(ctx) {
    const jersey = game.look(0).jersey;
    rect(ctx, 0, 0, VIEW_W, VIEW_H, '#1a1c2c');
    rect(ctx, 0, 14, VIEW_W, 154, '#333c57');
    for (let x = 60; x < VIEW_W; x += 130) rect(ctx, x, 4, 40, 4, '#ffcd75');
    for (let y = 24; y < 160; y += 12) rect(ctx, 0, y, VIEW_W, 1, '#2d3550'); // wall panels
    rect(ctx, 0, 160, VIEW_W, 8, '#262b44');

    // Whiteboard with a play drawn on it
    ctx.save();
    ctx.translate(30, 0); // clear of the side wall
    rect(ctx, 18, 36, 116, 84, '#94b0c2');
    rect(ctx, 21, 39, 110, 78, '#f4f4f4');
    drawText(ctx, 'PLAYS', 76, 44, '#566c86', { align: 'center' });
    for (const [x, y] of [[40, 70], [70, 96], [104, 66]]) drawText(ctx, 'O', x, y, '#3b5dc9', { scale: 2 });
    for (const [x, y] of [[54, 62], [86, 86], [112, 98]]) drawText(ctx, 'X', x, y, '#b13e53', { scale: 2 });
    for (let i = 0; i < 24; i++) rect(ctx, 46 + i * 2, 76 + Math.round(Math.sin(i / 4) * 6), 2, 1, '#566c86');
    rect(ctx, 94, 74, 6, 2, '#566c86');
    ctx.restore();

    // Lockers: the team's color, one for each of the three with their name plates
    const body = mix(jersey, '#1a1c2c', 0.35);
    const edge = mix(jersey, '#1a1c2c', 0.6);
    for (let i = 0; i < 6; i++) {
      const x = 150 + i * 56;
      rect(ctx, x, 30, 52, 130, edge);
      rect(ctx, x + 2, 32, 48, 126, body);
      for (let v = 0; v < 4; v++) rect(ctx, x + 12, 42 + v * 5, 28, 2, edge);
      rect(ctx, x + 40, 92, 3, 12, '#94b0c2');
      const mate = i === 1 ? 0 : i === 2 ? 1 : i === 4 ? 2 : null;
      if (mate !== null) {
        rect(ctx, x + 6, 66, 40, 11, '#1a1c2c');
        drawText(ctx, game.name(mate).toUpperCase().slice(0, 9), x + 26, 69, '#f4f4f4', { align: 'center' });
      }
    }
    // Trophy case: three glass shelves of cups
    rect(ctx, 518, 24, 108, 138, '#8f563b');
    rect(ctx, 522, 28, 100, 130, '#29366f');
    drawText(ctx, 'TROPHIES', 572, 32, '#ffcd75', { align: 'center' });
    const cups = Trophies.earned();
    for (let s = 0; s < 3; s++) {
      const shelfY = 70 + s * 40;
      rect(ctx, 522, shelfY, 100, 3, '#c98d5a');
      cups.slice(s * 7, s * 7 + 7).forEach((t, i) => drawCup(ctx, 530 + i * 13, shelfY, t.color));
    }
    rect(ctx, 528, 34, 2, 110, 'rgba(244, 244, 244, 0.25)'); // glass glint

    // Floor, with the team's logo
    rect(ctx, 0, 168, VIEW_W, VIEW_H - 168, '#3a4466');
    for (let x = 0; x < VIEW_W; x += 32) rect(ctx, x, 168, 1, VIEW_H - 168, '#333c57');
    for (let y = 190; y < VIEW_H; y += 26) rect(ctx, 0, y, VIEW_W, 1, '#333c57');
    ctx.strokeStyle = jersey;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(320, 286, 92, 30, 0, 0, Math.PI * 2);
    ctx.stroke();
    drawText(ctx, Career.get().teamName.toUpperCase(), 320, 280, jersey, { align: 'center', scale: 3 });
    // The bench in front of the lockers
    rect(ctx, 150, 176, 330, 6, '#c98d5a');
    rect(ctx, 150, 182, 330, 2, '#8f563b');
    for (const x of [160, 310, 466]) rect(ctx, x, 184, 4, 10, '#8f563b');

    // The way out: a black door in the left side wall (seen edge-on, so it narrows away), with a red EXIT sign.
    ctx.fillStyle = '#262b44';
    ctx.beginPath();
    ctx.moveTo(0, 14);
    ctx.lineTo(40, 30);
    ctx.lineTo(40, 168);
    ctx.lineTo(0, 360);
    ctx.fill();
    const door = (inset, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(6 + inset, 216 + inset);
      ctx.lineTo(34 + inset, 120 + inset);
      ctx.lineTo(34 - inset, 197 - inset);
      ctx.lineTo(6 - inset, 331 - inset);
      ctx.fill();
    };
    door(0, '#566c86');
    door(2, '#0b0c14');
    rect(ctx, 28, 186, 2, 7, '#94b0c2'); // handle
    rect(ctx, 6, 102, 30, 12, '#1a1c2c');
    drawText(ctx, 'EXIT', 21, 106, '#e43b44', { align: 'center' });
  }

  // A cup in a trophy's metal, bottom at `y` (the case's shelves).
  function drawCup(ctx, x, y, color) {
    rect(ctx, x + 2, y - 2, 6, 2, shade(color, 0.7));
    rect(ctx, x + 4, y - 6, 2, 4, color);
    rect(ctx, x, y - 12, 10, 6, color);
    rect(ctx, x, y - 12, 10, 2, mix(color, '#f4f4f4', 0.5));
    rect(ctx, x - 2, y - 11, 2, 3, color);
    rect(ctx, x + 10, y - 11, 2, 3, color);
  }

  // The reporter's TV camera on a tripod, beside them.
  function drawCamera(ctx, n) {
    const x = n.x + 40;
    const y = n.y - 4;
    for (const dx of [-8, 0, 8]) rect(ctx, x + dx / 2, y - 30, 2, 30 - Math.abs(dx), '#566c86');
    rect(ctx, x - 9, y - 44, 22, 14, '#262b44');
    rect(ctx, x - 15, y - 41, 6, 8, '#1a1c2c');
    rect(ctx, x + 6, y - 42, 3, 3, '#e43b44');
  }

  return { init, enter, update, draw, nameOf, isOpen: () => open };
})();
