// The 3v3 game clock: two halves, overtimes while tied, a shot clock and the final buzzer. Lives on game.clock
// (null in other modes). Runs only while the ball is live: it stops for free throws, dead balls, resets (the
// camera pan / fade) and the breaks between periods. A shot in the air at the buzzer still counts.
const Clock = (() => {
  function start(game) {
    endsSwapped = false;
    game.clock = {
      period: 1,
      t: periodLength(game, 1),
      shot: game.rules.shotSeconds,
      shotTeam: game.possession,
      lastHolder: null,
      rimHit: false,     // the current shot has hit the rim or board (a rebound restarts the shot clock)
      buzzer: false,     // time ran out with a shot in the air: wait for it to come down
      breakT: 0,         // seconds left of the banner before the next period
      banner: null,
      over: false,
      overT: 0,
    };
  }

  function periodLength(game, period) {
    const half = game.mode === 'demo' ? TITLE.demoHalfMinutes : game.rules.halfMinutes;
    return (period <= 2 ? half : GAME.otMinutes) * 60;
  }

  // Players hold still during the banners, a 2 Player upgrade draft, and after the final buzzer.
  function stopped(game) {
    const c = game.clock;
    return !!game.draft || (!!c && (c.breakT > 0 || c.over));
  }

  function update(dt, game, frozen) {
    const c = game.clock;
    if (!c) return;
    if (c.over) {
      c.overT += dt;
      return;
    }
    if (c.breakT > 0) {
      c.breakT -= dt;
      if (c.breakT > 0) return;
      // 2 Player: halftime upgrades first (Duo starts the 2nd half once both players are ready).
      if (game.mode === 'duo' && c.period === 1) {
        c.banner = null;
        Duo.startDraft(game, 'half');
      } else {
        startPeriod(game);
      }
      return;
    }
    const { ball } = game;
    trackShotClock(game);
    if (c.buzzer) {
      if (!ball.shot) endPeriod(game);
      return;
    }
    if (frozen || game.freeThrow || ball.lockT > 0) return;

    // The shot clock waits while a shot is in the air; it only matters once that shot is over.
    if (game.rules.shotClock && !ball.shot) {
      c.shot -= dt;
      if (c.shot <= 0) {
        violation(game);
        return;
      }
    }
    c.t -= dt;
    if (c.t <= 0) {
      c.t = 0;
      if (ball.shot) c.buzzer = true;
      else endPeriod(game);
    }
  }

  // The shot clock restarts when the other team gets the ball, or anyone grabs it after a shot hit the rim.
  function trackShotClock(game) {
    const c = game.clock;
    const { ball } = game;
    if (ball.shot && ball.touched) c.rimHit = true;
    const h = ball.holder;
    if (h && h !== c.lastHolder) {
      if (h.team !== c.shotTeam || c.rimHit) resetShot(game, h.team);
      c.rimHit = false;
    }
    c.lastHolder = h;
  }

  function resetShot(game, team = game.possession) {
    const c = game.clock;
    if (!c) return;
    c.shot = game.rules.shotSeconds;
    c.shotTeam = team;
    c.rimHit = false;
  }

  // Out of time to shoot: the other team gets the ball, checked up from their own half.
  function violation(game) {
    const offense = game.clock.shotTeam;
    Sfx.play('whistle');
    restartPlay(1 - offense);
    const h = game.ball.holder;
    addPopup(game, 'SHOT CLOCK', COLORS.bad, h.x, h.y, RESET.outTextZ, RESET.outTextTime);
  }

  function endPeriod(game) {
    const c = game.clock;
    Sfx.play('buzzer');
    c.t = 0;
    c.buzzer = false;
    game.freeThrow = null;
    if (c.period >= 2 && game.score[0] !== game.score[1]) {
      c.over = true;
      c.overT = 0;
      return;
    }
    c.banner = c.period === 1 ? 'HALFTIME' : 'OVERTIME';
    c.breakT = GAME.breakTime;
  }

  // Next period: the teams switch ends after halftime (and keep them in overtime), and the ball alternates: home
  // starts the game and every odd period, away the even ones.
  function startPeriod(game) {
    const c = game.clock;
    c.period++;
    c.t = periodLength(game, c.period);
    c.banner = null;
    endsSwapped = c.period >= 2;
    restartPlay(c.period % 2 === 1 ? 0 : 1);
  }

  // "1ST", "2ND", "OT", "2OT", ...
  function periodLabel(period) {
    if (period === 1) return '1ST';
    if (period === 2) return '2ND';
    return period === 3 ? 'OT' : `${period - 2}OT`;
  }

  // m:ss, or tenths in the last 10 seconds.
  function format(t) {
    if (t < 10) return t.toFixed(1);
    const s = Math.ceil(t);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return { start, update, stopped, resetShot, startPeriod, periodLabel, format };
})();
