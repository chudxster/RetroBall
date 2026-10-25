// Online play (PROTOTYPE): one person hosts, another joins with the host's 4-letter code or from the lobby finder.
// The host's game is the real one, a 2 Player versus game (see Duo) where player 2's keys come over the network;
// the guest's screen just draws the host's snapshots (SNAP_HZ a second) and sends its keys back every tick.
//
// Two networks (the Online screen picks one; see `transports`):
//   'internet' - a public MQTT relay over secure WebSockets (RELAY). Lobby announcements go to one shared topic,
//                each game's traffic to a topic named after its code. The mqtt.js library loads from a CDN the
//                first time it's needed, so the game itself still has no dependencies and runs offline. The public
//                relay is open (anyone could read the traffic), which is fine for playtests; a relay of our own
//                drops in by changing RELAY.
//   'local'    - a BroadcastChannel: tabs of the same browser on one computer, no internet needed (for testing).
const Net = (() => {
  const CHANNEL = 'retroball.net';
  const RELAY = {
    url: 'wss://broker.emqx.io:8084/mqtt',
    lib: 'https://unpkg.com/mqtt@5.10.1/dist/mqtt.min.js',
    topic: 'retroball/v1',
  };
  const ANNOUNCE_EVERY = 1;  // seconds between a host's lobby-finder announcements
  const LOBBY_TIMEOUT = 3.5; // a lobby not heard from this long drops off the finder
  const SNAP_HZ = 20;
  const PEER_TIMEOUT = 5;    // nothing from the other side this long: the connection is gone
  const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

  let transport = null;
  let role = null;     // null, 'host' or 'guest'
  let code = null;     // the game's code
  let joined = false;  // host: a guest is in; guest: the host welcomed us
  let peer = null;     // the other side's id once joined
  let peerName = '';   // the other side's name
  let myName = '';     // guest: the name the host's lobby shows for us
  let lobbyFormat = 'vs3'; // guest: the host's format
  let playing = false; // the match has started (before that the two are in the lobby)
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

  let network = 'internet'; // which of `transports`
  let status = '';          // how the connection is doing, for the Online screen

  // Each transport: { send(msg), room(code or null): which game's traffic to hear, close() }.
  const transports = {
    local() {
      const bc = new BroadcastChannel(CHANNEL);
      bc.onmessage = (e) => receive(e.data);
      return { send: (m) => bc.postMessage(m), room() {}, close: () => bc.close() };
    },
    internet() {
      const lobbyTopic = `${RELAY.topic}/lobby`;
      let client = null;
      let roomTopic = null;
      const waiting = []; // messages sent before the relay connected (only the ones worth keeping)
      const publish = (m) => client.publish(m.type === 'announce' ? lobbyTopic : roomTopic, JSON.stringify(m));
      const start = () => {
        client = mqtt.connect(RELAY.url, { clean: true, connectTimeout: 8000, reconnectPeriod: 2000 });
        client.on('connect', () => {
          status = '';
          client.subscribe(roomTopic ? [lobbyTopic, roomTopic] : lobbyTopic);
          while (waiting.length) publish(waiting.shift());
          onChange();
        });
        client.on('message', (topic, payload) => {
          try {
            receive(JSON.parse(payload.toString()));
          } catch (e) {
            // Not one of ours.
          }
        });
        client.on('offline', () => {
          status = 'Lost the online relay, reconnecting...';
          onChange();
        });
        client.on('error', () => {
          status = 'Can\'t reach the online relay';
          onChange();
        });
      };
      status = 'Connecting...';
      if (window.mqtt) {
        start();
      } else {
        const s = document.createElement('script');
        s.src = RELAY.lib;
        s.onload = start;
        s.onerror = () => {
          status = 'Couldn\'t load the online library (no internet?)';
          onChange();
        };
        document.head.append(s);
      }
      return {
        send(m) {
          if (m.type !== 'announce' && !roomTopic) return;
          if (client && client.connected) publish(m);
          else if (m.type !== 'snap' && m.type !== 'keys') waiting.push(m);
        },
        room(c) {
          if (client && roomTopic) client.unsubscribe(roomTopic);
          roomTopic = c ? `${RELAY.topic}/game/${c}` : null;
          if (client && client.connected && roomTopic) client.subscribe(roomTopic);
        },
        close() {
          if (client) client.end(true);
        },
      };
    },
  };

  function connect() {
    if (transport) return true;
    if (network === 'local' && typeof BroadcastChannel === 'undefined') return false;
    transport = transports[network]();
    return true;
  }

  // Switching networks drops whatever was going on (and the lobby list, which belongs to the old network).
  function setNetwork(next) {
    if (next === network || !transports[next]) return;
    leave();
    if (transport) transport.close();
    transport = null;
    status = '';
    lobbies.clear();
    network = next;
    connect();
    onChange();
  }

  function send(msg) {
    if (transport) transport.send({ ...msg, from: id });
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
    transport.room(code);
    hostName = name;
    announceT = 0;
    onChange();
    return code;
  }

  // Guest: ask the game with this code to let us in (again every JOIN_RETRY until it answers or JOIN_GIVE_UP).
  function join(c, name) {
    if (!connect()) return false;
    leave();
    role = 'guest';
    myName = name;
    code = String(c).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    transport.room(code);
    joinStarted = now();
    joinT = 0;
    onChange();
    return true;
  }
  const NO_GAME = 'No open game with that code';
  const KEYS_EVERY = 0.25;
  let lastKeys = '';
  let keysT = 0;
  const JOIN_RETRY = 1;
  const JOIN_GIVE_UP = 8;
  let joinStarted = 0;
  let joinT = 0;

  function leave() {
    if (status === NO_GAME) status = '';
    if (role && code) send({ type: 'bye', code });
    if (transport) transport.room(null);
    role = null;
    code = null;
    joined = false;
    playing = false;
    peer = null;
    peerName = '';
    latest = null;
    Input.setRemote(null);
    onChange();
  }

  // Host: everyone's in the lobby, so the match starts (on this computer; the guest plays it from theirs).
  function start() {
    if (role !== 'host' || !joined || playing) return;
    playing = true;
    send({ type: 'start', code });
    Input.setRemote(remotePad);
    startMatch();
    onChange();
  }

  // The guest left (or went quiet): the host's lobby opens up again and any match in progress ends.
  function guestGone() {
    const was = playing;
    joined = false;
    playing = false;
    peer = null;
    peerName = '';
    Input.setRemote(null);
    if (was) endMatch();
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
    // Once a guest is in, only they (and, for the guest, only the host) count.
    if (joined && m.from !== peer) return;
    lastHeard = now();
    if (role === 'host') {
      if (m.type === 'join') {
        // (Again if our welcome got lost and they asked again.)
        send({ type: 'welcome', code, to: m.from, name: hostName, format: Duo.format(), playing });
        if (joined) return;
        joined = true;
        peer = m.from;
        peerName = m.name || 'Guest';
        onChange();
      } else if (m.type === 'keys' && joined) {
        if (playing) Object.assign(remote, m.keys, { dash: m.keys.dash || remote.dash });
      } else if (m.type === 'bye') {
        guestGone();
      }
    } else if (role === 'guest') {
      if (m.type === 'welcome' && m.to === id) {
        peer = m.from;
        peerName = m.name || 'Host';
        lobbyFormat = m.format;
        joined = true;
        if (m.playing) playing = true;
        onChange();
      } else if (m.type === 'start') {
        playing = true;
        onChange();
      } else if (m.type === 'snap') {
        playing = true;
        latest = m.s;
      } else if (m.type === 'bye') {
        leave();
        status = 'The host closed the game';
        onChange();
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
      if (role === 'guest') {
        leave();
        status = 'Lost the host';
        onChange();
      } else {
        guestGone();
      }
      return;
    }
    // In the lobby the host says "still here" now and then (in a match its snapshots do that).
    if (role === 'host' && !playing) {
      announceT -= dt;
      if (announceT <= 0) {
        announceT = ANNOUNCE_EVERY;
        send({ type: 'lobby', code });
      }
    }
    if (role === 'guest' && !joined) {
      if (t - joinStarted > JOIN_GIVE_UP) {
        leave();
        status = NO_GAME;
        onChange();
        return;
      }
      joinT -= dt;
      if (joinT <= 0) {
        joinT = JOIN_RETRY;
        send({ type: 'join', code, name: myName });
      }
      return;
    }
    // The guest's keys: whenever they change, and a few times a second anyway (they double as "still here").
    if (role === 'guest' && joined) {
      const pad = Input.pad('solo');
      const keys = { move: pad.move(), shoot: pad.shoot(), action: pad.action(), pass: pad.pass(), dash: pad.takeDash() };
      const text = JSON.stringify(keys);
      keysT -= dt;
      if (text !== lastKeys || keysT <= 0) {
        send({ type: 'keys', code, keys });
        lastKeys = text;
        keysT = KEYS_EVERY;
      }
    }
    if (role === 'host' && playing) {
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

  // The host's match: 2 Player versus with player 2 online (Main menu ends it). endMatch: the guest left mid-game.
  let startMatch = () => {};
  let endMatch = () => {};

  return {
    host,
    join,
    leave,
    start,
    tick,
    applyLatest,
    lobbyList,
    // The lobby finder starts hearing hosts once this is called (the Online screen does).
    listen: connect,
    setNetwork,
    network: () => network,
    status: () => status,
    role: () => role,
    code: () => code,
    joined: () => joined,
    playing: () => playing,
    // The lobby as this side sees it: { code, host, guest, format, isHost } (null when not in one).
    lobby: () => (role && joined ? { code, host: role === 'host' ? hostName : peerName, guest: role === 'host' ? peerName : myName, format: role === 'host' ? Duo.format() : lobbyFormat, isHost: role === 'host' } : null),
    isGuest: () => role === 'guest' && playing,
    online: () => !!role && playing,
    set onChange(fn) {
      onChange = fn;
    },
    set endMatch(fn) {
      endMatch = fn;
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
  const STATE_KEYS = ['time', 'mode', 'score', 'stats', 'popups', 'possession', 'abbrs', 'draft', 'freeThrow', 'fade', 'hitStop', 'outFor', 'clock', 'debris', 'replayReady', 'challenge', 'countdown', 'goT', 'goalMet'];

  // Numbers go as 2 decimals (plenty for drawing, and much smaller); Infinity (an endless rim hang, a dead ball) as
  // BIG, since JSON has no Infinity.
  const BIG = 1e9;
  function replacer(key, v) {
    if (typeof v === 'number') return v === Infinity ? BIG : Number.isInteger(v) ? v : Math.round(v * 100) / 100;
    if (v instanceof Player) {
      const i = state.roster.indexOf(v);
      return i >= 0 ? { $p: i } : v === state.ref ? { $p: 'ref' } : null;
    }
    if (v && HOOPS.includes(v) && key !== '') return { $h: HOOPS.indexOf(v) };
    return v;
  }

  function reviver(key, v) {
    if (v === BIG) return Infinity;
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
      // The host's cosmetics for the whole game: the ball and the banner in the rafters (players' gear rides along
      // in their fields, the rim and net in the hoops').
      ballSkin,
      banner: arenaBanner,
      court: court.id,
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
    setBallSkin(s.ballSkin || null);
    if (s.court && s.court !== court.id) setCourt(courtById(s.court)); // the host's court
    arenaBanner = s.banner || null;
  }

  return { take, apply };
})();
