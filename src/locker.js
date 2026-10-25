// The locker room (main menu > Locker room): a room you walk around in as your player (the move keys), with the coach
// at the whiteboard, your two teammates at their lockers and a reporter by the TV camera. Walk up to one and press
// your dunk key (or Enter / Space) to talk: the talk panel (the "Talk Time" design) shows who's talking, what they
// say and the quest card, and the room dims behind you two. Each hands out quests and pays out finished ones (see
// Quests). The trophy case holds every trophy earned; there you pick which ones stand on the scoreboard's shelf.
// You come in through a black door on the left side wall; walk back out of it (or press Esc) to go back to the main
// menu. The glowing arch on the right wall is the tunnel to the court: walk into it and you're asked if you're ready
// for the next career game. The room remembers your last game ("After the Win": confetti, or towels after a loss,
// once) and, once your first career season is finished, becomes the Dynasty Room (the Testing build can switch it
// on in the UI tab). While it's open main.js draws it instead of the demo game.
const LOCKER = {
  bounds: { x0: 40, x1: 590, y0: 198, y1: 342 }, // where the player's feet can go
  speed: 110,      // px per second across (depth goes at PLAYER.depthSpeed of it)
  talkRange: 36,   // how close to stand to talk
  npcRadius: 14,   // nobody walks through anybody
  start: { x: 56, y: 262 },     // just inside the door
  door: { y0: 220, y1: 300, mid: 262 }, // walking into the left wall between these leaves; the right wall, the tunnel
  caseSpot: { x: 494, y: 204 }, // stand here (ish) to open the trophy case
  dim: 'rgba(13, 14, 22, 0.55)', // the room behind a conversation
  walkOutTime: 0.8, // seconds of walking on through a doorway before leaving (or the court's question)
};
const LAST_GAME_STORAGE_KEY = 'retroball.lastGame';

const Locker = (() => {
  const box = document.getElementById('locker-talk');
  const portrait = document.getElementById('locker-talk-portrait');
  const nameEl = document.getElementById('locker-talk-name');
  const textEl = document.getElementById('locker-talk-text');
  const card = document.getElementById('locker-talk-card');
  const shelfEl = document.getElementById('locker-talk-shelf');
  // From main.js: { look(i), name(i), leave(), startCareer(choice), dynastyTest() }.
  let game = null;
  let open = false;
  let talking = null; // who (or 'case', or 'court' for the tunnel) the panel is open for
  let note = '';      // a line shown once at the top of the panel (e.g. after a claim)
  let swallowUp = null;
  let me = null;
  let time = 0;
  let mood = null;    // 'win' or 'loss' after your last game, for one visit (After the Win); null: normal
  let last = null;    // that game: { won, us, them, opp }
  let dynasty = false;
  let walkOut = null; // { to: 'menu' or 'court', t }: walking on through a doorway

  // The people in the room: where they stand and what they look like. Teammates wear the team's kit and their own
  // looks (main.js); the coach and the reporter dress for work.
  const NPCS = [
    { id: 'coach', x: 92, y: 214, look: () => ({ ...DEFAULT_LOOK, skin: SKINS[4], hairStyle: 'buzz', hair: '#94b0c2', jersey: '#566c86', shorts: '#333c57', shoe: '#1a1c2c', laces: '#1a1c2c', number: '' }) },
    { id: 'mate1', x: 230, y: 212, look: () => game.look(1) },
    { id: 'mate2', x: 370, y: 216, look: () => game.look(2) },
    { id: 'press', x: 468, y: 292, look: () => ({ ...DEFAULT_LOOK, skin: SKINS[1], hairStyle: 'long', hair: '#7a4a32', jersey: '#b13e53', shorts: '#1a1c2c', shoe: '#1a1c2c', laces: '#1a1c2c', number: '' }) },
  ];
  const nameOf = (id) => ({ coach: 'COACH', mate1: game.name(1).toUpperCase(), mate2: game.name(2).toUpperCase(), press: 'THE REPORTER' })[id];
  // What each one says: handing out a quest, checking in, and paying out.
  const LINES = {
    coach: { offer: 'Good, you\'re here. I want to see this next game.', active: 'I\'m still waiting on this one.', done: 'That\'s what I\'m talking about.' },
    mate1: { offer: 'Bet you can\'t do this one.', active: 'Still waiting on you, hotshot.', done: 'Okay, okay. You earned it.' },
    mate2: { offer: 'Let\'s make some noise out there.', active: 'Come on, you\'re almost there.', done: 'The whole bench saw that!' },
    press: { offer: 'The fans want a story. Give them this.', active: 'My editor is still waiting.', done: 'That\'s going on the front page.' },
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

  // A counting game just ended (main.js): the room shows it on your next visit.
  function noteResult(result) {
    saveStored(LAST_GAME_STORAGE_KEY, { ...result, fresh: true });
  }

  // The Dynasty Room: once your first career season is finished (or the Testing build's switch).
  function dynastyUnlocked() {
    const c = Career.get();
    return c.season > 1 || c.phase === 'over' || !!game.dynastyTest();
  }

  function enter() {
    open = true;
    time = 0;
    walkOut = null;
    talking = null;
    box.hidden = true;
    const saved = loadStored(LAST_GAME_STORAGE_KEY);
    last = saved && Number.isFinite(saved.us) && Number.isFinite(saved.them) ? saved : null;
    mood = last && last.fresh ? (last.won ? 'win' : 'loss') : null;
    if (last && last.fresh) saveStored(LAST_GAME_STORAGE_KEY, { ...last, fresh: false }); // one visit
    dynasty = dynastyUnlocked();
    me = new Player({ x: LOCKER.start.x, y: LOCKER.start.y, look: game.look(0) });
    me.hasBall = false;
    me.view = 'side';
    me.setGear(Cosmetics.gearFor(0));
    for (const n of NPCS) {
      n.player = new Player({ x: n.x, y: n.y, look: n.look() });
      n.player.hasBall = false;
      n.player.slim = n.id === 'press'; // holding the mic
      if (n.id === 'mate1' || n.id === 'mate2') n.player.setGear(Cosmetics.gearFor(n.id === 'mate1' ? 1 : 2));
      // After a win the teammates have their arms up.
      if (mood === 'win' && n.id !== 'press') n.player.jump = { t: 0 };
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
    if (walkOut) return; // already on the way out
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
    // Backing out of the tunnel: a step back into the room.
    if (talking === 'court' && me) me.x = LOCKER.bounds.x1 - 12;
    talking = null;
    box.hidden = true;
    document.getElementById('game').focus();
  }

  function button(text, onClick, cls = 'btn') {
    const b = el('button', cls, text);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  }

  // The speaker's portrait: their sprite from the front, framed on the head and shoulders (like the menu's faces).
  function drawPortrait(p) {
    const ctx = portrait.getContext('2d');
    ctx.fillStyle = '#262b44';
    ctx.fillRect(0, 0, portrait.width, portrait.height);
    const face = new Player({ x: 0, y: 0, look: p.look });
    face.setGear(p.gear);
    Object.assign(face, { hasBall: false, view: 'front', facing: 1, sx: portrait.width / 2, by: 76, scale: 1 });
    face.draw(ctx);
  }

  // The talk panel: the speaker's portrait, their line, and the quest card (the goal, progress, the reward and the
  // answers); the trophy case; or the tunnel's "ready for the next game?".
  function renderTalk() {
    box.hidden = false;
    box.classList.toggle('trophy-case', talking === 'case');
    shelfEl.replaceChildren();
    portrait.hidden = talking === 'case' || talking === 'court';
    if (talking === 'case') renderCase();
    else if (talking === 'court') renderCourt();
    else renderQuest();
    const first = card.querySelector('button') || shelfEl.querySelector('button');
    if (first) first.focus();
  }

  function renderQuest() {
    const q = Quests.status(talking);
    const lines = LINES[talking];
    drawPortrait(NPCS.find((n) => n.id === talking).player);
    nameEl.textContent = nameOf(talking);
    textEl.textContent = `${note ? `${note} ` : ''}${lines[q.state === 'offer' ? 'offer' : q.state]}`;
    const items = [el('p', 'card-goal', q.text)];
    if (q.n) {
      const pips = el('div', 'card-pips');
      const shown = Math.min(q.n, 10);
      for (let i = 0; i < shown; i++) pips.append(el('span', Math.floor((q.progress * shown) / q.n) > i ? 'pip on' : 'pip'));
      items.push(pips, el('p', 'card-count', `${q.progress}/${q.n}`));
    }
    const reward = el('p', 'card-reward');
    reward.append(pixelIcon('coin'), `${q.reward} tokens`);
    items.push(reward);
    const answers = el('div', 'talk-actions');
    if (q.state === 'offer') {
      answers.append(button('Take it', () => {
        Quests.accept(talking);
        note = '';
        closeTalk();
      }), button('Not now', closeTalk, 'btn btn-quiet'));
    } else if (q.state === 'active') {
      answers.append(button('On it', closeTalk));
    } else {
      items[0].textContent = `${q.text}: DONE!`;
      answers.append(button(`Claim ${q.reward} tokens`, () => {
        const got = Quests.claim(talking);
        Sfx.play('goal');
        note = `+${got} tokens!`;
        renderTalk();
      }));
    }
    items.push(answers);
    card.replaceChildren(...items);
    card.hidden = false;
  }

  // The tunnel to the court: the next career game, its three challenges (picking one tips off), or not yet.
  function renderCourt() {
    nameEl.textContent = 'THE TUNNEL';
    const next = Career.next();
    const answers = el('div', 'talk-actions talk-court');
    if (next) {
      const opp = Career.teamOf(next.opp);
      textEl.textContent = `Ready for the next game? ${next.label.toLowerCase()} vs the ${opp.name} (${Career.record(next.opp)}). Pick a challenge to tip off.`;
      Career.offer(game.rules()).forEach((ch, i) => {
        const tier = CAREER.tiers[ch.tier];
        const b = button('', () => {
          closeTalk();
          open = false;
          game.startCareer(i);
        }, `challenge tier-${ch.tier}`);
        b.append(el('span', 'mode-name', tier.name), el('span', '', Career.challengeText(ch)), el('span', 'mult', `x${tier.mult}`));
        answers.append(b);
      });
    } else {
      textEl.textContent = `The season's over. Start the next one?`;
      answers.append(button(`Start season ${Career.get().season + 1}`, () => {
        Career.nextSeason();
        renderTalk();
      }));
    }
    answers.append(button('Not yet', closeTalk, 'btn btn-quiet'));
    card.replaceChildren(answers);
    card.hidden = false;
  }

  // The trophy case, as the case itself: shelves of cups in their metals (the ones on the scoreboard's shelf
  // outlined in gold, a button each to put on or take off), the next ones to earn as grey cups with their progress,
  // and how full the scoreboard's shelf is.
  function renderCase() {
    nameEl.textContent = 'TROPHY CASE';
    const earned = Trophies.earned();
    const onShelf = Trophies.shelf().length;
    textEl.textContent = earned.length
      ? 'Pick which trophies stand on the scoreboard\'s shelf in games.'
      : 'Nothing in here yet. Trophies come from playing: shots, points, dunks, steals, quests and more.';
    const slots = el('div', 'case-slots');
    slots.append(el('span', 'case-slots-label', `Shelf ${onShelf}/${TROPHY_SHELF_MAX}`));
    for (let i = 0; i < TROPHY_SHELF_MAX; i++) slots.append(el('span', i < onShelf ? 'case-slot on' : 'case-slot'));
    const grid = el('div', 'case-grid');
    for (const t of earned) {
      const b = el('button', 'case-item');
      b.type = 'button';
      const cup = el('span', 'case-cup');
      cup.style.background = t.color;
      b.append(cup, el('span', 'case-name', t.name));
      b.setAttribute('aria-pressed', String(Trophies.onShelf(t.id)));
      b.addEventListener('click', () => {
        Trophies.toggleShelf(t.id);
        renderTalk();
        const again = [...shelfEl.querySelectorAll('.case-item')].find((x) => x.textContent === b.textContent);
        if (again) again.focus();
      });
      grid.append(b);
    }
    // Still to earn: each family's next metal.
    for (const f of Trophies.list().families) {
      if (f.metal >= 0 || f.next === null) continue;
      const locked = el('span', 'case-item locked');
      locked.append(el('span', 'case-cup'), el('span', 'case-name', `${f.name} ${f.count}/${f.next}`));
      grid.append(locked);
    }
    shelfEl.append(slots, grid);
    card.replaceChildren(button('Done', closeTalk));
    card.hidden = false;
  }

  function update(dt) {
    time += dt;
    // Walking out through a doorway: on through it (the wall hides you as you go), then the main menu or the court's
    // question.
    if (walkOut) {
      const dir = walkOut.to === 'menu' ? -1 : 1;
      const step = LOCKER.speed * 0.8 * dt;
      walkOut.t += dt;
      me.x += dir * step;
      me.y += (LOCKER.door.mid - me.y) * Math.min(1, dt * 4);
      Object.assign(me, { moving: true, speed: PLAYER.topSpeed * 0.8, facing: dir, view: 'side' });
      me.stride += step;
      if (walkOut.t >= LOCKER.walkOutTime) {
        const to = walkOut.to;
        walkOut = null;
        if (to === 'menu') leave();
        else openTalk('court');
      }
      return;
    }
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
    const atDoor = y >= LOCKER.door.y0 && y <= LOCKER.door.y1;
    // Out the door, or into the tunnel: on through the doorway first.
    if (!talking && atDoor && ((mx < 0 && x <= b.x0) || (mx > 0 && x >= b.x1))) {
      walkOut = { to: mx < 0 ? 'menu' : 'court', t: 0 };
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
    // The others turn to face you (cheering after a win: three-quarters, arms up).
    for (const n of NPCS) {
      n.player.facing = me.x < n.x ? -1 : 1;
      n.player.view = Math.abs(me.x - n.x) < 20 && !n.player.jump ? 'front' : 'frontQ';
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
    if (dynasty) drawDynastyRoom(ctx);
    else drawRoom(ctx);
    if (mood === 'win') drawWinDressing(ctx);
    const people = [{ p: me, x: me.x, y: me.y }, ...NPCS.map((n) => ({ p: n.player, x: n.x, y: n.y, n }))];
    people.sort((a, b) => a.y - b.y);
    const b = LOCKER.bounds;
    const outside = me.x < b.x0 || me.x > b.x1; // on the way through a doorway
    for (const { p, x, y } of people) {
      place(p, x, y);
      if (!(p === me && outside)) p.drawShadow(ctx);
    }
    // You: drawn over the room, and in a doorway only inside its opening, so the wall hides you as you walk through.
    const drawMe = () => {
      for (const area of [[ROOM_AREA], [DOORWAYS.exit, DOORWAYS.court]]) {
        ctx.save();
        ctx.beginPath();
        for (const points of area) polygon(ctx, points);
        ctx.clip();
        me.draw(ctx);
        ctx.restore();
      }
    };
    const person = ({ p, n }) => {
      if (n && n.id === 'press') drawCamera(ctx, n);
      if (p === me) drawMe();
      else p.draw(ctx);
      if (n && n.id === 'press') rect(ctx, p.sx + p.facing * 9, p.by - 44, 2, 6, '#1a1c2c'); // the mic
      if (n && n.id === 'coach' && mood === 'win') drawGameBall(ctx, p);
      if (n && mood === 'loss' && (n.id === 'mate1' || n.id === 'mate2')) drawTowel(ctx, p);
    };
    for (const one of people) person(one);
    // After a loss the room is half lit and blue.
    if (mood === 'loss') rect(ctx, 0, 0, VIEW_W, VIEW_H, 'rgba(41, 54, 111, 0.3)');
    // Talking: the room dims, except for you two.
    const speaker = NPCS.find((n) => n.id === talking);
    if (speaker) {
      rect(ctx, 0, 0, VIEW_W, VIEW_H, LOCKER.dim);
      for (const one of people) if (one.p === me || one.n === speaker) person(one);
    }
    if (!talking) for (const n of NPCS) drawMarker(ctx, n);
    const who = talking || walkOut ? null : nearby();
    if (who) {
      const at = who === 'case' ? { x: LOCKER.caseSpot.x, y: 172 } : { x: NPCS.find((n) => n.id === who).x, y: NPCS.find((n) => n.id === who).y - 112 };
      const text = `${Input.keyLabel('action')} ${who === 'case' ? 'TROPHIES' : 'TALK'}`;
      const w = textWidth(text, 2) + 10;
      rect(ctx, at.x - w / 2, at.y - 4, w, 16, '#1a1c2c');
      drawText(ctx, text, at.x, at.y, '#ffcd75', { align: 'center', scale: 2 });
    }
    // The last game, across the top for a few seconds.
    if (mood && time < 4) {
      const text = `${mood === 'win' ? 'WIN' : 'LOSS'} ${last.us}-${last.them}${last.opp ? ` VS ${last.opp}` : ''}`;
      const w = textWidth(text, 2) + 16;
      rect(ctx, VIEW_W / 2 - w / 2, 4, w, 18, '#1a1c2c');
      drawText(ctx, text, VIEW_W / 2, 8, mood === 'win' ? '#a7f070' : '#94b0c2', { align: 'center', scale: 2 });
    }
    rect(ctx, 0, VIEW_H - 18, VIEW_W, 18, '#1a1c2c');
    drawText(ctx, `${Input.moveLabel()} WALK  ${Input.keyLabel('action')} TALK  DOOR: MENU  ARCH: NEXT GAME`, VIEW_W / 2, VIEW_H - 14, COLORS.hint, { align: 'center', scale: 2 });
  }

  // Quest markers over heads: a speech bubble with a red ! (a quest to hand out), a grey bubble with the progress (a
  // quest in progress), or a spinning gold token with sparkles (tokens to claim).
  function drawMarker(ctx, n) {
    const q = Quests.status(n.id);
    const x = n.x;
    const y = n.y - 92;
    if (q.state === 'done') {
      const w = Math.max(2, Math.round(Math.abs(Math.cos(time * 4)) * 12));
      const bob = Math.round(Math.sin(time * 3) * 2);
      rect(ctx, x - w / 2 - 1, y + bob - 1, w + 2, 14, '#8a6a2a');
      rect(ctx, x - w / 2, y + bob, w, 12, '#ffcd75');
      if (w > 6) rect(ctx, x - 1, y + bob + 3, 2, 6, '#b86f50');
      if (Math.sin(time * 6) > 0.3) {
        rect(ctx, x + 9, y + bob - 3, 1, 3, '#f4f4f4');
        rect(ctx, x + 8, y + bob - 2, 3, 1, '#f4f4f4');
      }
      return;
    }
    const text = q.state === 'offer' ? '!' : q.n ? `${q.progress}/${q.n}` : '...';
    const w = Math.max(12, textWidth(text, 2) + 8);
    const fill = q.state === 'offer' ? '#f4f4f4' : '#94b0c2';
    rect(ctx, x - w / 2 - 1, y - 1, w + 2, 16, '#1a1c2c');
    rect(ctx, x - w / 2, y, w, 14, fill);
    rect(ctx, x - 2, y + 14, 4, 2, fill); // the bubble's tail
    rect(ctx, x - 1, y + 16, 2, 2, fill);
    drawText(ctx, text, x, y + 2, q.state === 'offer' ? '#e43b44' : '#1a1c2c', { align: 'center', scale: 2 });
  }

  function rect(ctx, x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  }

  // The whiteboard: plays, or after your last game its score (a big W) or NEXT TIME.
  function drawBoard(ctx, x, y, frame, face, ink) {
    rect(ctx, x, y, 116, 84, frame);
    rect(ctx, x + 3, y + 3, 110, 78, face);
    if (mood === 'win') {
      drawText(ctx, 'W', x + 24, y + 18, '#38b764', { align: 'center', scale: 6 });
      drawText(ctx, `${last.us}-${last.them}`, x + 76, y + 24, ink, { align: 'center', scale: 2 });
      if (last.opp) drawText(ctx, `VS ${last.opp}`, x + 76, y + 44, ink, { align: 'center', scale: 2 });
      return;
    }
    if (mood === 'loss') {
      drawText(ctx, 'NEXT TIME', x + 58, y + 34, ink, { align: 'center', scale: 2 });
      for (let i = 0; i < 30; i++) rect(ctx, x + 10 + i * 3, y + 54 + (i % 3), 3, 6, mix(face, ink, 0.15)); // half erased
      return;
    }
    drawText(ctx, 'PLAYS', x + 58, y + 8, '#566c86', { align: 'center' });
    for (const [px, py] of [[22, 34], [52, 60], [86, 30]]) drawText(ctx, 'O', x + px, y + py, dynasty ? '#73eff7' : '#3b5dc9', { scale: 2 });
    for (const [px, py] of [[36, 26], [68, 50], [94, 62]]) drawText(ctx, 'X', x + px, y + py, dynasty ? '#ffcd75' : '#b13e53', { scale: 2 });
    for (let i = 0; i < 24; i++) rect(ctx, x + 28 + i * 2, y + 40 + Math.round(Math.sin(i / 4) * 6), 2, 1, ink);
  }

  // The two doorways in the side walls, seen edge-on so they narrow away: corners from the near edge at the front of
  // the room to the far edge by the back wall. The black EXIT door is on the left, the tunnel to the court on the
  // right; you walk through them (see walkOut) and the wall hides you as you go.
  const DOORWAYS = {
    exit: [[6, 216], [34, 120], [34, 197], [6, 331]],
    court: [[VIEW_W - 6, 206], [VIEW_W - 60, 104], [VIEW_W - 60, 192], [VIEW_W - 6, 338]], // in the wider right wall
  };
  // Everything in front of the side walls (the room itself), for clipping someone walking out through a doorway.
  const ROOM_AREA = [[40, 0], [VIEW_W - 70, 0], [VIEW_W - 70, 168], [VIEW_W, 360], [0, 360], [40, 168]];

  function polygon(ctx, points) {
    ctx.moveTo(points[0][0], points[0][1]);
    for (const [x, y] of points.slice(1)) ctx.lineTo(x, y);
    ctx.closePath();
  }

  // A point a share `a` across a doorway (0 the near edge, 1 the far one) and `b` down it (0 its top, 1 the floor).
  function doorPoint(points, a, b) {
    const [nt, ft, fb, nb] = points;
    const top = [lerp(nt[0], ft[0], a), lerp(nt[1], ft[1], a)];
    const bottom = [lerp(nb[0], fb[0], a), lerp(nb[1], fb[1], a)];
    return [lerp(top[0], bottom[0], b), lerp(top[1], bottom[1], b)];
  }

  // A sign hanging from the ceiling on two chains above a doorway, lit from inside.
  function hangingSign(ctx, cx, y, text, fill, ink) {
    const w = textWidth(text) + 10;
    const x = Math.round(cx - w / 2);
    rect(ctx, x + 3, 14, 1, y - 14, '#566c86');
    rect(ctx, x + w - 4, 14, 1, y - 14, '#566c86');
    rect(ctx, x - 1, y - 1, w + 2, 13, '#1a1c2c');
    rect(ctx, x, y, w, 11, fill);
    rect(ctx, x, y, w, 1, mix(fill, '#f4f4f4', 0.4));
    drawText(ctx, text, cx, y + 3, ink, { align: 'center' });
    ctx.fillStyle = `rgba(${parseInt(fill.slice(1, 3), 16)}, ${parseInt(fill.slice(3, 5), 16)}, ${parseInt(fill.slice(5, 7), 16)}, 0.15)`;
    ctx.fillRect(x - 3, y + 12, w + 6, 4); // its glow on the wall below
  }

  // The side walls: the black EXIT door on the left (in a frame deep enough to show the wall's thickness, with the
  // corridor's light under it) and the tunnel to the court on the right (a lit hallway running away from the room: a
  // concrete floor with the team runner, cage lights overhead, and the court's glow at the end), each under its sign.
  function drawSideWalls(ctx, wall, frame, signFill, signInk) {
    const side = (x0, x1) => {
      ctx.fillStyle = wall;
      ctx.beginPath();
      polygon(ctx, [[x0, 14], [x1, 30], [x1, 168], [x0, 360]]);
      ctx.fill();
    };
    side(0, 40);
    side(VIEW_W, VIEW_W - 70); // wider, so the tunnel to the court has room to show its depth

    // The exit: the frame, the jamb (the wall's thickness, lit on its inside face), the door, its handle and the
    // light from the corridor beyond along its bottom.
    const exit = DOORWAYS.exit;
    ctx.fillStyle = frame;
    ctx.beginPath();
    polygon(ctx, exit);
    ctx.fill();
    ctx.fillStyle = '#566c86';
    ctx.beginPath();
    polygon(ctx, [doorPoint(exit, 0.82, 0), exit[1], exit[2], doorPoint(exit, 0.82, 1)]);
    ctx.fill();
    ctx.fillStyle = '#0b0c14';
    ctx.beginPath();
    polygon(ctx, [doorPoint(exit, 0.08, 0.03), doorPoint(exit, 0.82, 0.03), doorPoint(exit, 0.82, 0.97), doorPoint(exit, 0.08, 0.97)]);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 205, 117, 0.35)';
    ctx.beginPath();
    polygon(ctx, [doorPoint(exit, 0.08, 0.96), doorPoint(exit, 0.82, 0.96), doorPoint(exit, 0.82, 1), doorPoint(exit, 0.08, 1)]);
    ctx.fill();
    const [hx, hy] = doorPoint(exit, 0.7, 0.55);
    rect(ctx, hx, hy, 2, 6, '#94b0c2');
    hangingSign(ctx, 22, 94, 'EXIT', signFill, signInk);

    // The tunnel: drawn inside the doorway, as if looking down a hallway that turns toward the court.
    const court = DOORWAYS.court;
    ctx.save();
    ctx.beginPath();
    polygon(ctx, court);
    ctx.clip();
    ctx.fillStyle = '#20263b';
    ctx.fillRect(VIEW_W - 70, 90, 70, 270);
    // The hallway's far wall: concrete blocks, darker the deeper they are.
    for (let i = 0; i < 6; i++) {
      const a = 0.25 + i * 0.12;
      ctx.fillStyle = mix('#333c57', '#1a1c2c', i / 6);
      ctx.beginPath();
      polygon(ctx, [doorPoint(court, a, 0), doorPoint(court, a + 0.12, 0), doorPoint(court, a + 0.12, 0.62), doorPoint(court, a, 0.62)]);
      ctx.fill();
    }
    // The floor, with the team runner and its arrows pointing to the court.
    ctx.fillStyle = '#566c86';
    ctx.beginPath();
    polygon(ctx, [doorPoint(court, 0, 0.62), doorPoint(court, 1, 0.62), doorPoint(court, 1, 1), doorPoint(court, 0, 1)]);
    ctx.fill();
    ctx.fillStyle = game.look(0).jersey;
    ctx.beginPath();
    polygon(ctx, [doorPoint(court, 0, 0.74), doorPoint(court, 1, 0.7), doorPoint(court, 1, 0.84), doorPoint(court, 0, 0.9)]);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      const [ax, ay] = doorPoint(court, 0.2 + i * 0.28, 0.8);
      rect(ctx, ax - 2, ay, 3, 1, '#f4f4f4');
    }
    // Cage lights down the ceiling.
    for (let i = 0; i < 4; i++) {
      const [lx, ly] = doorPoint(court, 0.12 + i * 0.24, 0.06);
      rect(ctx, lx - 2, ly, 4, 3, '#ffcd75');
    }
    // The court at the end: its light and a glimpse of the floor.
    const glow = 0.45 + Math.sin(time * 2) * 0.08;
    ctx.fillStyle = `rgba(255, 205, 117, ${glow})`;
    ctx.beginPath();
    polygon(ctx, [doorPoint(court, 0.86, 0), court[1], court[2], doorPoint(court, 0.86, 1)]);
    ctx.fill();
    ctx.fillStyle = '#d99c66';
    ctx.beginPath();
    polygon(ctx, [doorPoint(court, 0.86, 0.66), doorPoint(court, 1, 0.66), court[2], doorPoint(court, 0.86, 1)]);
    ctx.fill();
    ctx.restore();
    // The doorway's frame, then its sign.
    ctx.strokeStyle = frame;
    ctx.lineWidth = 2;
    ctx.beginPath();
    polygon(ctx, court);
    ctx.stroke();
    hangingSign(ctx, VIEW_W - 34, 80, 'TO COURT', '#ffcd75', '#1a1c2c');
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
    drawBoard(ctx, 48, 36, '#94b0c2', '#f4f4f4', '#566c86');

    // Lockers: the team's color, three with your names on them
    const body = mix(jersey, '#1a1c2c', 0.35);
    const edge = mix(jersey, '#1a1c2c', 0.6);
    for (let i = 0; i < 5; i++) {
      const x = 156 + i * 56;
      rect(ctx, x, 30, 52, 130, edge);
      rect(ctx, x + 2, 32, 48, 126, body);
      for (let v = 0; v < 4; v++) rect(ctx, x + 12, 42 + v * 5, 28, 2, edge);
      rect(ctx, x + 40, 92, 3, 12, '#94b0c2');
      const mate = [null, 0, 1, 2, null][i];
      if (mate !== null) {
        rect(ctx, x + 6, 66, 40, 11, '#1a1c2c');
        drawText(ctx, game.name(mate).toUpperCase().slice(0, 9), x + 26, 69, '#f4f4f4', { align: 'center' });
      }
    }
    drawCase(ctx, '#8f563b', '#29366f', '#c98d5a');

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
    drawBench(ctx, '#c98d5a', '#8f563b');
    drawSideWalls(ctx, '#262b44', '#566c86', '#b13e53', '#f4f4f4');
  }

  // The Dynasty Room (after your first career season): a banner for every title under a coffered ceiling, team
  // color over gold-railed wood paneling, open wood stalls with your jerseys hanging, a glowing play board, a trophy
  // wall with the Finals cup on a pedestal, team-color carpet with a DYNASTY rug, and a gold-framed door.
  function drawDynastyRoom(ctx) {
    const jersey = game.look(0).jersey;
    const look = game.look(0);
    const c = Career.get();
    rect(ctx, 0, 0, VIEW_W, VIEW_H, '#1a1c2c');
    for (let x = 20; x < VIEW_W; x += 60) {
      rect(ctx, x, 2, 40, 10, '#262b44');
      rect(ctx, x + 18, 6, 4, 3, '#ffcd75'); // downlights
    }
    rect(ctx, 0, 14, VIEW_W, 46, mix(jersey, '#1a1c2c', 0.45));
    rect(ctx, 0, 60, VIEW_W, 100, '#7a4a32');
    for (let x = 0; x < VIEW_W; x += 24) rect(ctx, x, 62, 1, 98, '#5a3524');
    rect(ctx, 0, 58, VIEW_W, 3, '#ffcd75'); // the gold rail
    rect(ctx, 0, 160, VIEW_W, 8, '#5a3524');
    // A banner per title (at least the motto).
    const titles = Math.max(c.titles, 0);
    const banners = Math.min(titles, 8);
    for (let i = 0; i < banners; i++) {
      const x = 156 + i * 34;
      rect(ctx, x, 16, 30, 30, jersey);
      rect(ctx, x, 16, 30, 2, '#ffcd75');
      drawText(ctx, 'CHAMPS', x + 15, 22, '#ffcd75', { align: 'center' });
      drawText(ctx, String(i + 1), x + 15, 32, '#f4f4f4', { align: 'center' });
    }
    drawText(ctx, 'WIN TODAY', banners ? 160 + banners * 34 + 40 : 320, 26, '#ffcd75', { align: banners ? 'left' : 'center', scale: 2 });
    drawBoard(ctx, 48, 36, '#5a3524', '#1a1c2c', '#73eff7');

    // Open wood stalls: a light, the jersey on a hanger, a cushion, a brass plate
    for (let i = 0; i < 5; i++) {
      const x = 156 + i * 56;
      rect(ctx, x, 64, 52, 96, '#5a3524');
      rect(ctx, x + 3, 67, 46, 90, '#3a2418');
      rect(ctx, x + 20, 68, 12, 2, '#ffcd75');
      rect(ctx, x + 12, 80, 28, 34, jersey);
      rect(ctx, x + 8, 80, 4, 10, jersey);
      rect(ctx, x + 40, 80, 4, 10, jersey);
      rect(ctx, x + 22, 80, 8, 3, '#3a2418');
      const mate = [null, 0, 1, 2, null][i];
      const number = mate === null ? '' : String(mate === 0 ? look.number : game.look(mate).number);
      if (number) drawText(ctx, number, x + 26, 90, isLightColor(jersey) ? '#1a1c2c' : '#f4f4f4', { align: 'center', scale: 2 });
      rect(ctx, x + 3, 140, 46, 8, mix(jersey, '#1a1c2c', 0.3));
      rect(ctx, x + 10, 150, 32, 7, '#ffcd75');
      drawText(ctx, mate === null ? (i === 4 ? 'ROOKIE' : 'OPEN') : game.name(mate).toUpperCase().slice(0, 6), x + 26, 151, '#5a3524', { align: 'center' });
    }
    drawCase(ctx, '#5a3524', '#1a1c2c', '#ffcd75');
    // The Finals cup on its pedestal, once there's a title.
    if (titles) {
      rect(ctx, 550, 124, 18, 36, '#94b0c2');
      rect(ctx, 548, 122, 22, 4, '#c0cbdc');
      rect(ctx, 552, 104, 14, 12, '#ffcd75');
      rect(ctx, 556, 116, 6, 6, '#ffcd75');
      rect(ctx, 548, 106, 4, 6, '#ffcd75');
      rect(ctx, 566, 106, 4, 6, '#ffcd75');
    }

    // Carpet in the team color, a gold-ringed rug that says DYNASTY
    const carpet = mix(jersey, '#1a1c2c', 0.55);
    rect(ctx, 0, 168, VIEW_W, VIEW_H - 168, carpet);
    for (let i = 0; i < 400; i++) rect(ctx, hash2(i, 1) * VIEW_W, 168 + hash2(i, 2) * (VIEW_H - 168), 1, 1, mix(carpet, '#f4f4f4', 0.12));
    ctx.fillStyle = mix(jersey, '#1a1c2c', 0.3);
    ctx.beginPath();
    ctx.ellipse(320, 286, 96, 32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffcd75';
    ctx.lineWidth = 3;
    ctx.stroke();
    drawText(ctx, 'DYNASTY', 320, 280, '#ffcd75', { align: 'center', scale: 3 });
    drawBench(ctx, '#8f563b', '#5a3524');
    drawSideWalls(ctx, '#3a2418', '#ffcd75', '#38b764', '#f4f4f4');
  }

  // The trophy case on the back wall: three glass shelves of cups.
  function drawCase(ctx, frame, glass, shelf) {
    rect(ctx, 440, 24, 108, 138, frame);
    rect(ctx, 444, 28, 100, 130, glass);
    drawText(ctx, 'TROPHIES', 494, 32, '#ffcd75', { align: 'center' });
    const cups = Trophies.earned();
    for (let s = 0; s < 3; s++) {
      const shelfY = 70 + s * 40;
      rect(ctx, 444, shelfY, 100, 3, shelf);
      cups.slice(s * 7, s * 7 + 7).forEach((t, i) => drawCup(ctx, 452 + i * 13, shelfY, t.color));
    }
    rect(ctx, 450, 34, 2, 110, 'rgba(244, 244, 244, 0.25)'); // glass glint
  }

  // The bench in front of the lockers.
  function drawBench(ctx, top, legs) {
    rect(ctx, 156, 176, 276, 6, top);
    rect(ctx, 156, 182, 276, 2, legs);
    for (const x of [166, 292, 418]) rect(ctx, x, 184, 4, 10, legs);
  }

  // After a win: streamers over the lockers, confetti on the floor (fixed, so it doesn't flicker) and the tipped
  // drinks cooler in its puddle.
  function drawWinDressing(ctx) {
    const colors = ['#e43b44', '#ffcd75', '#3b5dc9', '#38b764', '#f4f4f4', '#ef7d57'];
    for (let x = 150; x < 440; x += 2) rect(ctx, x, 26 + Math.round(Math.abs(Math.sin(x / 9)) * 6), 2, 2, colors[Math.floor(x / 18) % 3]);
    for (let i = 0; i < 160; i++) {
      rect(ctx, 44 + hash2(i, 5) * 550, 174 + hash2(i, 6) * 166, 2, 1, colors[Math.floor(hash2(i, 7) * colors.length)]);
    }
    ctx.fillStyle = 'rgba(115, 239, 247, 0.35)';
    ctx.beginPath();
    ctx.ellipse(150, 322, 30, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    rect(ctx, 122, 306, 22, 14, '#3b5dc9');
    rect(ctx, 122, 306, 22, 3, '#f4f4f4');
  }

  // The coach holds up the game ball (after a win).
  function drawGameBall(ctx, p) {
    drawRects(ctx, ballSprite(0, 0, 0, 10), p.sx + p.facing * 10 - 5, p.by - 82);
    rect(ctx, p.sx + p.facing * 10 - 1, p.by - 74, 2, 4, '#e43b44'); // the ribbon
  }

  // A towel over a head (after a loss).
  function drawTowel(ctx, p) {
    const k = p.scale;
    rect(ctx, p.sx - 10 * k, p.by - 76 * k, 20 * k, 10 * k, '#f4f4f4');
    rect(ctx, p.sx - 10 * k, p.by - 66 * k, 4 * k, 10 * k, '#f4f4f4');
    rect(ctx, p.sx + 6 * k, p.by - 66 * k, 4 * k, 10 * k, '#f4f4f4');
    rect(ctx, p.sx - 10 * k, p.by - 76 * k, 20 * k, 2 * k, '#c0cbdc');
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
    rect(ctx, x + 6, y - 42, 3, 3, mood === 'win' && Math.sin(time * 4) > 0 ? '#a7f070' : '#e43b44'); // live after a win
  }

  return { init, enter, update, draw, nameOf, noteResult, isOpen: () => open };
})();
