// Én ren beregningsmotor for spilletid i ferdigspilte kamper.
// Ingen Firestore, ingen reloads, ingen sideeffekter.

export const PLAYING_TIME_SCHEMA_VERSION = 10;
export const MANUAL_OVERRIDE_VERSION = 2;

function norm(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("no");
}

function canonicalFirstName(value) {
  const first = norm(value).split(" ")[0] || "";
  if (first === "nico") return "nicolai";
  return first;
}

export function playerKey(id, name) {
  const first = canonicalFirstName(name);
  return first ? `name:${first}` : `id:${String(id || "unknown")}`;
}

export function parseMatchMinute(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const plus = text.match(/^(\d+)\s*\+\s*(\d+)$/);
  if (plus) return Number(plus[1]) + Number(plus[2]);
  return /^\d+$/.test(text) ? Number(text) : null;
}

function eventTimeMs(event) {
  const minute = parseMatchMinute(event?.minute);
  if (minute != null) return Math.max(0, minute * 60000);
  const ms = Number(event?.timeMs);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

export function eventAffectsPlayingTime(event) {
  if (!event) return false;
  if (event.type === "substitution" || event.type === "sub") return true;
  return event.type === "card" &&
    event.team === "home" &&
    event.cardType === "red";
}

function playerSource(match) {
  if (match?.players?.home && typeof match.players.home === "object") {
    return match.players.home;
  }
  if (match?.players && typeof match.players === "object" && !Array.isArray(match.players)) {
    return match.players;
  }
  return {};
}

function buildRegistry(match) {
  const registry = new Map();
  const idToKey = new Map();

  function add(id, name, source = {}, priority = 0) {
    const cleanName = String(name || "").trim();
    if (!cleanName && !id) return null;

    const key = playerKey(id, cleanName);
    const existing = registry.get(key);

    if (!existing) {
      registry.set(key, {
        key,
        id: String(id || key),
        name: cleanName || String(id),
        priority,
        cards: Array.isArray(source?.cards) ? source.cards : []
      });
    } else {
      if (priority > existing.priority) {
        if (id) existing.id = String(id);
        if (cleanName) existing.name = cleanName;
        existing.priority = priority;
      }
      if (Array.isArray(source?.cards) && source.cards.length > existing.cards.length) {
        existing.cards = source.cards;
      }
    }

    if (id) idToKey.set(String(id), key);
    return key;
  }

  const stored = playerSource(match);
  Object.entries(stored).forEach(([id, player]) => {
    add(player?.id || id, player?.name, player || {}, 100);
  });

  for (const player of match?.squad?.present || []) add(player?.id, player?.name, player, 90);
  for (const player of match?.squad?.starters || []) add(player?.id, player?.name, player, 95);
  for (const player of match?.lineup || []) add(player?.id, player?.name, player, 60);
  for (const player of match?.playingTime || []) add(player?.id, player?.name, player, 70);

  for (const event of match?.events || []) {
    if (event?.type === "substitution" || event?.type === "sub") {
      add(event?.outPlayerId, event?.outPlayerName, {}, 50);
      add(event?.inPlayerId, event?.inPlayerName, {}, 50);
    } else if (event?.type === "card" && event?.team === "home") {
      add(event?.playerId, event?.playerName, {}, 50);
    }
  }

  function resolve(id, name) {
    if (id && idToKey.has(String(id))) return idToKey.get(String(id));
    const key = playerKey(null, name);
    if (name && registry.has(key)) return key;
    return add(id, name, {}, 20);
  }

  return { registry, resolve };
}

function authoritativeRoster(match, resolve, explicitPresent, explicitStarters) {
  const present = new Set();
  const starters = new Set();

  const addPresent = player => {
    const key = resolve(player?.id, player?.name);
    if (key) present.add(key);
    return key;
  };

  const addStarter = player => {
    const key = addPresent(player);
    if (key) starters.add(key);
  };

  if (Array.isArray(explicitPresent) || Array.isArray(explicitStarters)) {
    for (const player of explicitPresent || []) addPresent(player);
    for (const player of explicitStarters || []) addStarter(player);
    return { present, starters };
  }

  const corrected = Boolean(match?.postMatchPlayerCorrection?.correctedAt);
  const squadPresent = Array.isArray(match?.squad?.present) ? match.squad.present : [];
  const squadStarters = Array.isArray(match?.squad?.starters) ? match.squad.starters : [];

  // Etter en etterkorrigering er squad-listene fasit. Verken en gammel lineup
  // eller gamle player.starter-flagg får lov til å overstyre dem.
  if (corrected && (squadPresent.length || squadStarters.length)) {
    for (const player of squadPresent) addPresent(player);
    for (const player of squadStarters) addStarter(player);
    return { present, starters };
  }

  if (squadPresent.length || squadStarters.length) {
    for (const player of squadPresent) addPresent(player);
    for (const player of squadStarters) addStarter(player);
    if (starters.size) return { present, starters };
  }

  const stored = playerSource(match);
  Object.values(stored).forEach(player => {
    if (player?.present === true) addPresent(player);
    if (player?.present === true && player?.starter === true) addStarter(player);
  });
  if (starters.size) return { present, starters };

  for (const player of match?.lineup || []) addStarter(player);
  return { present, starters };
}

function findMatchEndMs(match) {
  const halfMinutes = Number(match?.meta?.halfLengthMin) || 35;
  const officialMs = halfMinutes * 2 * 60000;
  const timerMs = Number(match?.timer?.elapsedMs);
  let endMs = Number.isFinite(timerMs) && timerMs > 0
    ? Math.max(officialMs, timerMs)
    : officialMs;

  for (const event of match?.events || []) {
    const ms = eventTimeMs(event);
    if (Number.isFinite(ms)) endMs = Math.max(endMs, ms);
  }
  return endMs;
}

export function calculatePlayingTime(match, options = {}) {
  const { registry, resolve } = buildRegistry(match);
  const { present, starters } = authoritativeRoster(
    match,
    resolve,
    options.presentPlayers,
    options.starterPlayers
  );
  const endMs = findMatchEndMs(match);
  const states = new Map();
  const referenced = new Set();

  function stateFor(key) {
    if (!states.has(key)) {
      states.set(key, { onField: false, enteredAt: null, totalMs: 0 });
    }
    return states.get(key);
  }

  function enter(key, atMs) {
    if (!key) return;
    referenced.add(key);
    const state = stateFor(key);
    if (state.onField) return;
    state.onField = true;
    state.enteredAt = Math.max(0, Math.min(atMs, endMs));
  }

  function leave(key, atMs) {
    if (!key) return;
    referenced.add(key);
    const state = stateFor(key);
    if (!state.onField || state.enteredAt == null) return;

    const leaveAt = Math.max(state.enteredAt, Math.min(atMs, endMs));
    state.totalMs += Math.max(0, leaveAt - state.enteredAt);
    state.onField = false;
    state.enteredAt = null;
  }

  starters.forEach(key => enter(key, 0));

  const timeline = (match?.events || [])
    .map((event, index) => ({ event, index, at: eventTimeMs(event) }))
    .filter(item => Number.isFinite(item.at) && eventAffectsPlayingTime(item.event))
    .sort((a, b) => a.at - b.at || a.index - b.index);

  for (const { event, at } of timeline) {
    if (event.type === "substitution" || event.type === "sub") {
      leave(resolve(event?.outPlayerId, event?.outPlayerName), at);
      enter(resolve(event?.inPlayerId, event?.inPlayerName), at);
    } else {
      leave(resolve(event?.playerId, event?.playerName), at);
    }
  }

  for (const [key, state] of states) {
    if (state.onField) leave(key, endMs);
  }

  const oldByKey = new Map(
    (match?.playingTime || []).map(player => [playerKey(player?.id, player?.name), player])
  );
  const rows = [];

  for (const player of registry.values()) {
    const state = states.get(player.key);
    const totalMs = Math.max(0, Number(state?.totalMs) || 0);
    const participated =
      totalMs > 0 ||
      starters.has(player.key) ||
      referenced.has(player.key);

    if (!present.has(player.key) && !participated) continue;

    const old = oldByKey.get(player.key);
    rows.push({
      id: player.id,
      name: String(player.name || "").trim(),
      minutes: Math.floor(totalMs / 60000),
      cards: Array.isArray(player.cards) && player.cards.length
        ? player.cards
        : (Array.isArray(old?.cards) ? old.cards : [])
    });
  }

  rows.sort((a, b) => norm(a.name).localeCompare(norm(b.name), "no"));
  return {
    playingTime: rows,
    matchEndMs: endMs,
    starterCount: starters.size
  };
}

export function getManualOverrides(match) {
  if (Number(match?.playingTimeManualOverrideVersion) !== MANUAL_OVERRIDE_VERSION) {
    return new Map();
  }

  const map = new Map();
  for (const item of Array.isArray(match?.playingTimeManualOverrides)
    ? match.playingTimeManualOverrides
    : []) {
    const key = playerKey(item?.id, item?.name);
    if (!key) continue;
    map.set(key, {
      id: item?.id || "",
      name: item?.name || "",
      minutes: Math.max(0, Math.round(Number(item?.minutes) || 0)),
      setAt: item?.setAt || ""
    });
  }
  return map;
}

export function applyManualOverrides(match, autoRows) {
  const overrides = getManualOverrides(match);
  if (!overrides.size) return autoRows.map(row => ({ ...row }));

  const result = autoRows.map(row => ({ ...row }));
  const byKey = new Map(result.map(row => [playerKey(row?.id, row?.name), row]));

  for (const [key, override] of overrides) {
    const row = byKey.get(key);
    if (row) {
      row.minutes = override.minutes;
      continue;
    }

    const old = (match?.playingTime || []).find(player =>
      playerKey(player?.id, player?.name) === key
    );
    result.push({
      id: override.id || old?.id || key,
      name: override.name || old?.name || "Ukjent spiller",
      minutes: override.minutes,
      cards: Array.isArray(old?.cards) ? old.cards : []
    });
  }

  result.sort((a, b) => norm(a.name).localeCompare(norm(b.name), "no"));
  return result;
}

export function comparablePlayingTime(rows) {
  return (rows || [])
    .map(row => ({
      key: playerKey(row?.id, row?.name),
      minutes: Math.max(0, Math.floor(Number(row?.minutes) || 0))
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

export function samePlayingTime(a, b) {
  return JSON.stringify(comparablePlayingTime(a)) ===
    JSON.stringify(comparablePlayingTime(b));
}
