// Online play (PROTOTYPE): one person hosts, another joins with the host's 4-letter code or from the lobby finder.
// The host's game is the real one, a 2 Player versus game (see Duo) where player 2's keys come over the network;
// the guest's screen just draws the host's snapshots (SNAP_HZ a second) and sends its keys back every tick.
//
// The transport is swappable. Today it's a BroadcastChannel, which connects tabs of the same browser on one computer
// (good for testing everything but the internet). Real online play needs a relay the two browsers can both reach,
// e.g. a small WebSocket server or WebRTC with a signaling service: anything with the same send / onmessage shape
// drops in at `connect`.
const Net = (() => {
  const CHANNEL = 'retroball.net';
  const ANNOUNCE_EVERY = 1;  // seconds between a host's lobby-finder announcements
  const LOBBY_TIMEOUT = 3.5; // a lobby not heard from this long drops off the finder
  const SNAP_HZ = 30;
  const PEER_TIMEOUT = 5;    // nothing from the other side this long: the connection is gone
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

  let transport = null;
  let role = null;     // null, 'host' or 'guest'
  let code = null;     // the game's code
  let joined = false;  // host: a guest is in; guest: the host welcomed us
  let lastHeard = 0;
  let announceT = 0;
  let snapT = 0;
  let latest = null;   // guest: the newest snapshot not yet applied
  let hostName = '';   // host: the name the lobby finder shows
  let onChange = () => {};
  const lobbies = new Map(); // code -> { name, format, seen }
  // This browser tab's id (its own messages come back on the channel and are skipped).
  const id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const now = () => performance.now() / 1000;

  // The guest's keys as the host last heard them, read through the same pad shape as the keyboard (see Input.pad).
  const remote = { move: { x: 0, y: 0 }, shoot: false, action: false, pass: false, dash: null };
  const remotePad = {
    move: () => remote.move,
    shoot: () => remote.shoot,
    action: () => remote.action,
    pass: () => remote.pass,
    takeDash() {
      const d = remote.dash;
      remote.dash = null;
      return d;
    },
  };

  function connect() {
    if (transport) return true;
    if (typeof BroadcastChannel === 'undefined') return false;
    transport = new BroadcastChannel(CHANNEL);
    transport.onmessage = (e) => receive(e.data);
    return true;
  }

  function send(msg) {
    if (transport) transport.postMessage({ ...msg, from: id });
  }

  function newCode() {
    let s = '';
    for (let i = 0; i < 4; i++) s += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    return s;
  }

  // Host: open a game others can find; it starts once someone joins.
  function host(name) {
    if (!connect()) return null;
    leave();
    role = 'host';
    code = newCode();
    hostName = name;
    announceT = 0;
    onChange();
    return code;
  }

  // Guest: ask the game with this code to let us in.
  function join(c) {
    if (!connect()) return false;
    leave();
    role = 'guest';
    code = String(c).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    lastHeard = now();
    send({ type: 'join', code });
    onChange();
    return true;
  }

  function leave() {
    if (role && code) send({ type: 'bye', code });
    role = null;
    code = null;
    joined = false;
    latest = null;
    Input.setRemote(null);
    onChange();
  }

  function receive(m) {
    if (!m || m.from === id) return;
    if (m.type === 'announce') {
      lobbies.set(m.code, { name: m.name, format: m.format, seen: now() });
      onChange();
      return;
    }
    if (!code || m.code !== code) return;
    lastHeard = now();
    if (role === 'host') {
      if (m.type === 'join' && !joined) {
        joined = true;
        send({ type: 'welcome', code });
        Input.setRemote(remotePad);
        startMatch();
        onChange();
      } else if (m.type === 'keys' && joined) {
        Object.assign(remote, m.keys, { dash: m.keys.dash || remote.dash });
      } else if (m.type === 'bye') {
        joined = false;
        Input.setRemote(null);
        onChange();
      }
    } else if (role === 'guest') {
      if (m.type === 'welcome') {
        joined = true;
        onChange();
      } else if (m.type === 'snap') {
        latest = m.s;
      } else if (m.type === 'bye') {
        leave();
      }
    }
  }

  // Every tick of the frame loop (host and guest): lobby announcements, keys, snapshots, dropped connections.
  function tick(dt) {
    const t = now();
    for (const [c, l] of lobbies) {
      if (t - l.seen > LOBBY_TIMEOUT) {
        lobbies.delete(c);
        onChange();
      }
    }
    if (!role) return;
    if (role === 'host' && !joined) {
      announceT -= dt;
      if (announceT <= 0) {
        announceT = ANNOUNCE_EVERY;
        send({ type: 'announce', code, name: hostName, format: Duo.format() });
      }
      return;
    }
    if (joined && t - lastHeard > PEER_TIMEOUT) {
      if (role === 'guest') leave();
      else {
        joined = false;
        Input.setRemote(null);
        onChange();
      }
      return;
    }
    if (role === 'guest' && joined) {
      const pad = Input.pad('solo');
      send({ type: 'keys', code, keys: { move: pad.move(), shoot: pad.shoot(), action: pad.action(), pass: pad.pass(), dash: pad.takeDash() } });
    }
    if (role === 'host' && joined) {
      snapT -= dt;
      if (snapT <= 0) {
        snapT = 1 / SNAP_HZ;
        send({ type: 'snap', code, s: Snapshot.take() });
      }
    }
  }

  // Guest: draw the newest snapshot.
  function applyLatest() {
    if (!latest) return false;
    Snapshot.apply(latest);
    latest = null;
    return true;
  }

  function lobbyList() {
    return [...lobbies.entries()].map(([c, l]) => ({ code: c, name: l.name, format: l.format }));
  }

  // The host's match: 2 Player versus with player 2 online (Main menu ends it).
  let startMatch = () => {};

  return {
    host,
    join,
    leave,
    tick,
    applyLatest,
    lobbyList,
    // The lobby finder starts hearing hosts once this is called (the Online screen does).
    listen: connect,
    role: () => role,
    code: () => code,
    joined: () => joined,
    isGuest: () => role === 'guest' && joined,
    online: () => !!role && joined,
    set onChange(fn) {
      onChange = fn;
    },
    set startMatch(fn) {
      startMatch = fn;
    },
  };
})();

// What the guest needs to draw the host's game: every moving thing's fields, the score, clocks, popups, camera.
// Players and hoops inside are sent as references ({ $p: roster index }, { $h: hoop index }) and turned back.
const Snapshot = (() => {
  const SKIP_PLAYER = new Set(['mind', 'look', 'upgrades', 'stats', 'prevShoot', 'prevDunk']);
  const STATE_KEYS = ['time', 'mode', 'score', 'stats', 'popups', 'possession', 'abbrs', 'draft', 'freeThrow', 'fade', 'hitStop', 'outFor', 'clock', 'debris', 'replayReady', 'challenge'];

  function replacer(key, v) {
    if (v instanceof Player) {
      const i = state.roster.indexOf(v);
      return i >= 0 ? { $p: i } : v === state.ref ? { $p: 'ref' } : null;
    }
    if (v && HOOPS.includes(v) && key !== '') return { $h: HOOPS.indexOf(v) };
    return v;
  }

  function reviver(key, v) {
    if (v && typeof v === 'object' && '$p' in v) return v.$p === 'ref' ? state.ref : state.roster[v.$p] || null;
    if (v && typeof v === 'object' && '$h' in v) return HOOPS[v.$h];
    return v;
  }

  const fields = (o, skip = new Set()) => Object.fromEntries(Object.entries(o).filter(([k, v]) => !skip.has(k) && typeof v !== 'function'));

  function take() {
    return JSON.stringify({
      state: Object.fromEntries(STATE_KEYS.map((k) => [k, state[k]])),
      players: state.roster.map((p) => fields(p, SKIP_PLAYER)),
      onCourt: state.players.map((p) => state.roster.indexOf(p)),
      humans: state.humans.map((h) => ({ team: h.team, player: h.player })),
      ref: state.ref && fields(state.ref, SKIP_PLAYER),
      ball: fields(state.ball, new Set(['events'])),
      hoops: HOOPS.map((h) => fields(h)),
      camera: fields(camera),
      crowd: { ...crowdHype },
      endsSwapped,
    }, replacer);
  }

  function apply(text) {
    const s = JSON.parse(text, reviver);
    // A different game (format or mode) on the host: set the same one up here first, so the players exist.
    if (state.mode !== s.state.mode || state.players.length !== s.onCourt.length) newGame(s.state.mode);
    Object.assign(state, s.state);
    s.players.forEach((f, i) => Object.assign(state.roster[i], f));
    state.players = s.onCourt.map((i) => state.roster[i]);
    state.humans = s.humans.map((h, i) => ({ pad: i ? 'p2' : 'p1', team: h.team, start: h.player, player: h.player, prevKeys: {}, ctl: null }));
    if (state.ref && s.ref) Object.assign(state.ref, s.ref);
    Object.assign(state.ball, s.ball);
    s.hoops.forEach((h, i) => Object.assign(HOOPS[i], h));
    Object.assign(camera, s.camera);
    Object.assign(crowdHype, s.crowd);
    endsSwapped = s.endsSwapped;
  }

  return { take, apply };
})();
