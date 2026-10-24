// Player tuning: the config values that shape how players move, shoot, dunk, dash, pass and defend, editable in
// the pause menu (the Dev tab, with ?dev=1), most important first. Every one applies to all players, the user's
// and the AI's alike (the user and the AI have their own steal/block/intercept/stuff odds, so those are scaled).
// Each entry names a value by its path in the config (`also` lists values that must follow it), with a short tip. Changes are saved; anything left at its
// default isn't.
const TUNING_STORAGE_KEY = 'retroball.tuning';

const TUNING = [
  // Movement (everyone)
  { path: 'PLAYER.speedBrackets.2.speed', also: ['PLAYER.topSpeed'], label: 'Top speed', tip: 'Running speed after holding a direction 1s', min: 40, max: 300, step: 5 },
  { path: 'PLAYER.speedBrackets.1.speed', label: 'Mid speed', tip: 'Running speed after 0.5s', min: 30, max: 300, step: 5 },
  { path: 'PLAYER.speedBrackets.0.speed', label: 'Start speed', tip: 'Running speed when a player starts moving', min: 20, max: 300, step: 5 },
  { path: 'PLAYER.ballSpeed', label: 'Dribble speed', tip: 'Speed with the ball, as a share of normal', min: 0.3, max: 1.5, step: 0.05 },
  { path: 'PLAYER.accel', label: 'Acceleration', tip: 'How fast players get up to speed', min: 100, max: 4000, step: 50 },
  { path: 'PLAYER.decel', label: 'Braking', tip: 'How fast players stop when they let go', min: 100, max: 4000, step: 50 },
  { path: 'PLAYER.depthSpeed', label: 'Up/down speed', tip: 'Boost for moving up and down the court', min: 0.5, max: 3, step: 0.05 },
  { path: 'PLAYER.turnLoss', label: 'Turn penalty', tip: 'How much turning slows a player back down', min: 0, max: 5, step: 0.1 },

  // Shooting
  { path: 'SHOT.greenMax', label: 'Green (close)', tip: 'Make window on the meter, near the hoop', min: 0.02, max: 0.5, step: 0.01 },
  { path: 'SHOT.greenMin', label: 'Green (deep)', tip: 'Smallest make window, from far out', min: 0.01, max: 0.3, step: 0.01 },
  { path: 'SHOT.greenShrink', label: 'Green shrink', tip: 'How fast the window narrows with distance', min: 0, max: 0.003, step: 0.0001 },
  { path: 'SHOT.greenCenter', label: 'Green spot', tip: 'Where on the meter the window sits', min: 0.4, max: 0.95, step: 0.01 },
  { path: 'SHOT.meterTimeFar', label: 'Meter time far', tip: 'Seconds to fill the meter on long shots', min: 0.2, max: 2, step: 0.05 },
  { path: 'SHOT.meterTimeClose', label: 'Meter time close', tip: 'Seconds to fill the meter near the hoop', min: 0.2, max: 2, step: 0.05 },
  { path: 'SHOT.slightMakeChance', label: 'Near-miss makes', tip: 'Odds a slightly early/late shot goes in', min: 0, max: 1, step: 0.05 },
  { path: 'SHOT.goodMargin', label: 'Near-miss band', tip: 'Width of "slightly" early/late either side', min: 0, max: 0.3, step: 0.01 },
  { path: 'SHOT.fadeGreen', label: 'Fadeaway green', tip: 'Make window on a fadeaway, as a share', min: 0.1, max: 1.5, step: 0.05 },
  { path: 'SHOT.fadeDist', label: 'Fadeaway drift', tip: 'How far a fadeaway jumps back', min: 0, max: 80, step: 1 },
  { path: 'SHOT.fadeContest', label: 'Fadeaway cover', tip: 'How much defense still bothers a fadeaway', min: 0, max: 1, step: 0.05 },
  { path: 'SHOT.deepFrames', label: 'Half-court green', tip: 'Frames of green from past half court', min: 1, max: 20, step: 1 },
  { path: 'SHOT.hideChance', label: 'Hidden green', tip: 'Odds the green is invisible past 3/4 court', min: 0, max: 1, step: 0.05 },
  { path: 'SHOT.deepLuck', label: 'Deep luck', tip: 'Odds a mistimed half-court shot still drops', min: 0, max: 1, step: 0.01 },
  { path: 'SHOT.jumpHeight', label: 'Jump shot height', tip: 'How high a jump shot rises', min: 0, max: 40, step: 1 },

  // Dunking
  { path: 'DUNK.baseRange', label: 'Dunk range', tip: 'How far out a standing dunk works', min: 0, max: 120, step: 1 },
  { path: 'DUNK.rangePerSpeed', label: 'Dunk run-up', tip: 'Extra dunk range per unit of speed', min: 0, max: 1.5, step: 0.05 },
  { path: 'DEFENSE.stuffOdds', label: 'Stuff odds', tip: 'Scales everyone\'s odds to stuff a dunk', min: 0, max: 4, step: 0.05 },

  // Dash
  { path: 'DASH.speed', label: 'Dash speed', tip: 'Speed of the double-tap burst', min: 50, max: 800, step: 10 },
  { path: 'DASH.time', label: 'Dash length', tip: 'Seconds the burst lasts', min: 0.03, max: 0.6, step: 0.01 },
  { path: 'DASH.cooldown', label: 'Dash cooldown', tip: 'Seconds before a player can dash again', min: 0, max: 10, step: 0.25 },
  { path: 'DASH.depthScale', label: 'Up/down dash', tip: 'Up/down dash distance vs sideways', min: 0.1, max: 2, step: 0.05 },

  // Passing
  { path: 'PASS.speed', label: 'Pass speed', tip: 'How fast passes fly', min: 100, max: 900, step: 10 },
  { path: 'PASS.lead', label: 'Pass lead', tip: 'How far ahead of a runner passes go', min: 0, max: 2, step: 0.05 },
  { path: 'PASS.catchRadius', label: 'Catch reach', tip: 'How far a receiver can reach for a pass', min: 4, max: 50, step: 1 },
  { path: 'CALL.speed', label: 'Ball recall', tip: 'Free shot: speed the called ball flies back', min: 100, max: 900, step: 10 },
  { path: 'PICKUP.radius', label: 'Pickup reach', tip: 'How close a player must be to grab a loose ball', min: 4, max: 40, step: 1 },

  // Defense
  { path: 'DEFENSE.stealRange', label: 'Steal reach', tip: 'How far a steal can reach', min: 5, max: 60, step: 1 },
  { path: 'DEFENSE.stealOdds', label: 'Steal odds', tip: 'Scales everyone\'s steal success', min: 0, max: 4, step: 0.05 },
  { path: 'FOUL.maxChance', label: 'Foul odds', tip: 'Foul odds reaching in pressed up close', min: 0, max: 1, step: 0.05 },
  { path: 'DEFENSE.stealCooldown', label: 'Steal cooldown', tip: 'Seconds between steal attempts', min: 0, max: 3, step: 0.05 },
  { path: 'DEFENSE.stealStun', label: 'Whiff slowdown', tip: 'Seconds slowed after a missed steal', min: 0, max: 3, step: 0.05 },
  { path: 'DEFENSE.stolenStun', label: 'Stripped stun', tip: 'Seconds dazed after the ball is stolen', min: 0, max: 3, step: 0.05 },
  { path: 'DEFENSE.blockOdds', label: 'Block odds', tip: 'Scales everyone\'s odds to block a shot', min: 0, max: 4, step: 0.05 },
  { path: 'DEFENSE.blockRange', label: 'Block reach', tip: 'How close a defender must be to block', min: 2, max: 50, step: 1 },
  { path: 'DEFENSE.jumpHeight', label: 'Block jump', tip: 'How high a defensive jump goes', min: 0, max: 50, step: 1 },
  { path: 'DEFENSE.interceptOdds', label: 'Intercept odds', tip: 'Scales everyone\'s odds to pick off a pass', min: 0, max: 4, step: 0.05 },
  { path: 'DEFENSE.contestMax', label: 'Contest power', tip: 'Most a close-out shrinks the green', min: 0, max: 1, step: 0.05 },
  { path: 'DEFENSE.contestRange', label: 'Contest range', tip: 'How close a defender must be to bother', min: 0, max: 120, step: 1 },
  { path: 'DEFENSE.retreatSpeed', label: 'Get-back speed', tip: 'Speed boost running back on defense', min: 1, max: 3, step: 0.05 },
];

const Tuning = (() => {
  const roots = { PLAYER, SHOT, DUNK, DASH, PASS, CALL, PICKUP, DEFENSE, FOUL };

  // The object holding the value at `path` and its key there.
  function locate(path) {
    const parts = path.split('.');
    let obj = roots[parts[0]];
    for (const p of parts.slice(1, -1)) obj = obj[p];
    return { obj, key: parts[parts.length - 1] };
  }

  function get(path) {
    const { obj, key } = locate(path);
    return obj[key];
  }

  function set(entry, value) {
    for (const path of [entry.path, ...(entry.also || [])]) {
      const { obj, key } = locate(path);
      obj[key] = value;
    }
  }

  // Defaults are whatever config.js says, captured before any saved changes are applied.
  const defaults = new Map(TUNING.map((e) => [e.path, get(e.path)]));

  function clean(entry, value) {
    const v = Number(value);
    if (!Number.isFinite(v)) return null;
    const stepped = Math.round(v / entry.step) * entry.step;
    return clamp(Number(stepped.toFixed(6)), entry.min, entry.max);
  }

  function save() {
    const changed = {};
    for (const e of TUNING) if (get(e.path) !== defaults.get(e.path)) changed[e.path] = get(e.path);
    saveStored(TUNING_STORAGE_KEY, changed);
  }

  function load() {
    const saved = loadStored(TUNING_STORAGE_KEY) || {};
    for (const e of TUNING) {
      if (!(e.path in saved)) continue;
      const v = clean(e, saved[e.path]);
      if (v !== null) set(e, v);
    }
  }

  // Set from user input (cleaned to the entry's range and step); returns the value used.
  function change(entry, value) {
    const v = clean(entry, value);
    if (v !== null) set(entry, v);
    save();
    return get(entry.path);
  }

  function reset(entry) {
    set(entry, defaults.get(entry.path));
    save();
  }

  function resetAll() {
    for (const e of TUNING) set(e, defaults.get(e.path));
    save();
  }

  load();

  return { get, change, reset, resetAll, defaultOf: (entry) => defaults.get(entry.path) };
})();
