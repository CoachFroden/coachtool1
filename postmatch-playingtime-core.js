// Én ren beregningsmotor for spilletid i ferdigspilte kamper.
// Ingen Firestore, ingen reloads, ingen sideeffekter.
//
// Identitetsregel:
// - Tropp/startellever: fast spiller-ID er fasit.
// - Historiske hendelser/bytter: synlig spillernavn er fasit når navn finnes.

export const PLAYING_TIME_SCHEMA_VERSION = 13;
export const MANUAL_OVERRIDE_VERSION = 4;

const FIXED_PLAYERS = [
  ["h1", "Ask"],
  ["h2", "Brage"],
  ["h3", "Gabriel"],
  ["h4", "Lars"],
  ["h5", "Liam"],
  ["h6", "Lukas"],
  ["h7", "Martin"],
  ["h8", "Nicolai"],
  ["h9", "Nytveit"],
  ["h10", "Noah"],
  ["h11", "Oliver"],
  ["h12", "Snorre"],
  ["h13", "Sondre"],
  ["h14", "Sverre"],
  ["h15", "Thage"],
  ["h16", "Theodor"],
  ["h17", "Torvald"]
];

const FIXED_BY_ID = new Map(FIXED_PLAYERS);

function norm(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("no");
}

function canonicalFirstName(value) {
  const first = norm(value).split(" ")[0] || "";
  if (first === "nico") return "nicolai";
  return first;
}

function nameKey(name) {
  const first = canonicalFirstName(name);
  return first ? `name:${first}` : "";
}

function rosterName(id, name) {
  const cleanId = String(id || "").trim();
  if (FIXED_BY_ID.has(cleanId)) return FIXED_BY_ID.get(cleanId);
  return String(name || "").trim();
}

function eventName(id, name) {
  const cleanName = String(name || "").trim();
  if (cleanName) return cleanName;
  const cleanId = String(id || "").trim();
  if (FIXED_BY_ID.has(cleanId)) return FIXED_BY_ID.get(cleanId);
  return cleanId;
}

export function playerKey(id, name) {
  const canonicalName = rosterName(id, name);
  return nameKey(canonicalName) || `id:${String(id || "unknown")}`;
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
  const rosterIdToKey = new Map();

  function upsert(key, id, name, source = {}, priority = 0) {
    if (!key) return null;
    const cleanName = String(name || "").trim();
    const existing = registry.get(key);

    if (!existing) {
      registry.set(key, {
        key,
        id: String(id || key),
        name: cleanName || String(id || key),
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
    return key;
  }

  function addRoster(id, name, source = {}, priority = 0) {
    const canonicalName = rosterName(id, name);
    if (!canonicalName && !id) return null;
    const key = nameKey(canonicalName) || `id:${String(id)}`;
    upsert(key, id, canonicalName, source, priority);
    if (id) rosterIdToKey.set(String(id), key);
    return key;
  }

  function addEvent(id, name, source = {}, priority = 0) {
    const canonicalName = eventName(id, name);
    if (!canonicalName && !id) return null;
    const key = nameKey(canonicalName) || `id:${String(id)}`;
    upsert(key, id, canonicalName, source, priority);
    return key;
  }

  const stored = playerSource(match);
  Object.entries(stored).forEach(([id, player]) => {
    addRoster(player?.id || id, player?.name, player || {}, 100);
  });

  for (const player of match?.squad?.present || []) addRoster(player?.id, player?.name, player, 95);
  for (const player of match?.squad?.starters || []) addRoster(player?.id, player?.name, player, 98);
  for (const player of match?.lineup || []) addRoster(player?.id, player?.name, player, 70);
  for (const player of match?.playingTime || []) addRoster(player?.id, player?.name, player, 75);

  for (const event of match?.events || []) {
    if (event?.type === "substitution" || event?.type === "sub") {
      addEvent(event?.outPlayerId, event?.outPlayerName, {}, 50);
      addEvent(event?.inPlayerId, event?.inPlayerName, {}, 50);
    } else if (event?.type === "card" && event?.team === "home") {
      addEvent(event?.playerId, event?.playerName, {}, 50);
    }
  }

  function resolveRoster(id, name) {
    const cleanId = String(id || "").trim();
    if (cleanId && FIXED_BY_ID.has(cleanId)) {
      const canonicalName = FIXED_BY_ID.get(cleanId);
      const key = nameKey(canonicalName);
      if (!registry.has(key)) addRoster(cleanId, canonicalName, {}, 20);
      return key;
    }
    if (cleanId && rosterIdToKey.has(cleanId)) return rosterIdToKey.get(cleanId);

    const canonicalName = String(name || "").trim();
    const key = nameKey(canonicalName);
    if (key && registry.has(key)) return key;
    return addRoster(id, canonicalName, {}, 20);
  }

  function resolveEvent(id, name) {
    const canonicalName = eventName(id, name);
    const key = nameKey(canonicalName);

    // Ved historiske hendelser er navnet på hendelsen fasit når det finnes.
    if (key) {
      if (!registry.has(key)) addEvent(id, canonicalName, {}, 20);
      return key;
    }

    const cleanId = String(id || "").trim();
    if (cleanId && rosterIdToKey.has(cleanId)) return rosterIdToKey.get(cleanId);
    return addEvent(id, canonicalName, {}, 20);
  }

  return { registry, resolveRoster, resolveEvent };
}

function authoritativeRoster(match, resolveRoster, explicitPresent, explicitStarters) {
  const present = new Set();
  const starters = new Set();

  const addPresent = player => {
    const key = resolveRoster(player?.id, player?.name);
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
  Object.entries(stored).forEach(([id, player]) => {
    const candidate = { id: player?.id || id, name: player?.name };
    if (player?.present === true) addPresent(candidate);
    if (player?.present === true && player?.starter === true) addStarter(candidate);
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
  const { registry, resolveRoster, resolveEvent } = buildRegistry(match);
  const { present, starters } = authoritativeRoster(
    match,
    resolveRoster,
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
      leave(resolveEvent(event?.outPlayerId, event?.outPlayerName), at);
      enter(resolveEvent(event?.inPlayerId, event?.inPlayerName), at);
    } else {
      leave(resolveEvent(event?.playerId, event?.playerName), at);
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
