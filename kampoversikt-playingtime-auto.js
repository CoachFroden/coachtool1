import { db } from "./firebase-refleksjon.js";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const RECALC_KEY = "coachtool1:postmatch-playingtime-recalc";
let pendingMatchId = null;
let pendingPlayerMatchId = null;

function norm(value) {
  return String(value || "").trim().toLocaleLowerCase("no");
}

function firstNameKey(value) {
  return norm(value).split(/\s+/)[0] || "";
}

function parseMinute(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const plus = text.match(/^(\d+)\s*\+\s*(\d+)$/);
  if (plus) return Number(plus[1]) + Number(plus[2]);
  if (/^\d+$/.test(text)) return Number(text);
  return null;
}

function eventClockMs(event) {
  const minute = parseMinute(event?.minute);
  if (minute != null) return minute * 60 * 1000;
  const ms = Number(event?.timeMs);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

function eventPeriod(event, halfMinutes) {
  const explicit = Number(event?.period);
  if (explicit === 1 || explicit === 2) return explicit;
  const minute = parseMinute(event?.minute);
  if (minute != null) return minute > halfMinutes ? 2 : 1;
  return 1;
}

function isSubstitution(event) {
  return event?.type === "substitution" || event?.type === "sub";
}

function isHomeRedCard(event) {
  return event?.type === "card" &&
    event?.team === "home" &&
    event?.cardType === "red";
}

function getPlayerSource(match) {
  if (match?.players?.home && typeof match.players.home === "object") {
    return match.players.home;
  }
  if (match?.players && typeof match.players === "object" && !Array.isArray(match.players)) {
    return match.players;
  }
  return {};
}

function makeRegistry(match) {
  const registry = new Map();
  const idToKey = new Map();

  const add = (id, name, source = {}, priority = 0) => {
    const cleanName = String(name || "").trim();
    if (!cleanName && !id) return null;
    const nameKey = firstNameKey(cleanName);
    const fallbackKey = id ? `id:${id}` : `name:${nameKey}`;
    const key = nameKey ? `name:${nameKey}` : fallbackKey;
    const existing = registry.get(key);

    if (!existing) {
      registry.set(key, {
        key,
        id: id ? String(id) : key,
        name: cleanName || String(id),
        priority,
        present: source?.present === true,
        starter: source?.starter === true,
        cards: Array.isArray(source?.cards) ? source.cards : [],
        referenced: false
      });
    } else {
      if (priority > existing.priority) {
        if (id) existing.id = String(id);
        if (cleanName) existing.name = cleanName;
        existing.priority = priority;
      }
      if (source?.present === true) existing.present = true;
      if (source?.starter === true) existing.starter = true;
      if (Array.isArray(source?.cards) && source.cards.length) existing.cards = source.cards;
    }

    if (id) idToKey.set(String(id), key);
    return key;
  };

  const storedPlayers = getPlayerSource(match);
  Object.entries(storedPlayers).forEach(([id, player]) => {
    add(player?.id || id, player?.name, player || {}, 50);
  });

  for (const player of match?.playingTime || []) {
    add(player?.id, player?.name, {
      present: true,
      cards: player?.cards || []
    }, 30);
  }

  for (const player of match?.squad?.present || []) {
    add(player?.id, player?.name, { present: true }, 40);
  }

  for (const player of match?.squad?.starters || []) {
    add(player?.id, player?.name, { present: true, starter: true }, 45);
  }

  for (const player of match?.lineup || []) {
    add(player?.id, player?.name, {}, 20);
  }

  for (const event of match?.events || []) {
    if (isSubstitution(event)) {
      const outKey = add(event?.outPlayerId, event?.outPlayerName, {}, 10);
      const inKey = add(event?.inPlayerId, event?.inPlayerName, {}, 10);
      if (outKey && registry.has(outKey)) registry.get(outKey).referenced = true;
      if (inKey && registry.has(inKey)) registry.get(inKey).referenced = true;
    }
    if (isHomeRedCard(event)) {
      const key = add(event?.playerId, event?.playerName, {}, 10);
      if (key && registry.has(key)) registry.get(key).referenced = true;
    }
  }

  const resolve = (id, name) => {
    if (id && idToKey.has(String(id))) return idToKey.get(String(id));
    const key = firstNameKey(name);
    if (key && registry.has(`name:${key}`)) return `name:${key}`;
    return add(id, name, {}, 5);
  };

  return { registry, resolve };
}

function determineStarterKeys(match, registry, resolve) {
  const starterKeys = new Set();
  const explicitSquadStarters = Array.isArray(match?.squad?.starters)
    ? match.squad.starters
    : [];

  if (explicitSquadStarters.length) {
    explicitSquadStarters.forEach(player => {
      const key = resolve(player?.id, player?.name);
      if (key) starterKeys.add(key);
    });
    return starterKeys;
  }

  const storedPlayers = getPlayerSource(match);
  Object.values(storedPlayers)
    .filter(player => player?.starter === true)
    .forEach(player => {
      const key = resolve(player?.id, player?.name);
      if (key) starterKeys.add(key);
    });

  if (starterKeys.size) return starterKeys;

  for (const player of match?.lineup || []) {
    const key = resolve(player?.id, player?.name);
    if (key) starterKeys.add(key);
  }

  return starterKeys;
}

function findFirstHalfEndMs(match, halfMs) {
  const stored = Number(match?.firstHalfActualEndMs);
  if (Number.isFinite(stored) && stored >= halfMs) return stored;

  const milestone = (match?.events || []).find(event =>
    /1\. omgang avsluttet/i.test(String(event?.rawText || event?.text || ""))
  );
  const milestoneMs = milestone ? eventClockMs(milestone) : null;
  return Number.isFinite(milestoneMs) && milestoneMs >= halfMs ? milestoneMs : halfMs;
}

function findMatchEndMs(match, halfMs) {
  const officialEnd = halfMs * 2;
  const timerMs = Number(match?.timer?.elapsedMs);
  let endMs = Number.isFinite(timerMs) && timerMs > 0 ? timerMs : officialEnd;

  for (const event of match?.events || []) {
    if (eventPeriod(event, halfMs / 60000) !== 2) continue;
    const eventMs = eventClockMs(event);
    if (Number.isFinite(eventMs)) endMs = Math.max(endMs, eventMs);
  }

  return Math.max(officialEnd, endMs);
}

function recalculatePlayingTime(match) {
  const halfMinutes = Number(match?.meta?.halfLengthMin) || 35;
  const halfMs = halfMinutes * 60 * 1000;
  const firstHalfEndMs = findFirstHalfEndMs(match, halfMs);
  const matchEndMs = findMatchEndMs(match, halfMs);
  const { registry, resolve } = makeRegistry(match);
  const starterKeys = determineStarterKeys(match, registry, resolve);
  const states = new Map();

  const ensureState = key => {
    if (!key) return null;
    if (!states.has(key)) {
      states.set(key, {
        onField: false,
        enteredAt: null,
        baseMs: 0,
        firstHalfExtraMs: 0
      });
    }
    return states.get(key);
  };

  starterKeys.forEach(key => {
    const player = registry.get(key);
    if (player) {
      player.present = true;
      player.starter = true;
      player.referenced = true;
    }
    const state = ensureState(key);
    state.onField = true;
    state.enteredAt = 0;
  });

  const firstHalfEvents = [];
  const secondHalfEvents = [];
  (match?.events || []).forEach((event, index) => {
    if (!isSubstitution(event) && !isHomeRedCard(event)) return;
    const clockMs = eventClockMs(event);
    if (!Number.isFinite(clockMs)) return;
    const item = { event, index, clockMs };
    if (eventPeriod(event, halfMinutes) === 2) secondHalfEvents.push(item);
    else firstHalfEvents.push(item);
  });

  const sorter = (a, b) => a.clockMs - b.clockMs || a.index - b.index;
  firstHalfEvents.sort(sorter);
  secondHalfEvents.sort(sorter);

  const accrueFirstHalf = (key, outAt, remove = true) => {
    const state = ensureState(key);
    if (!state?.onField || state.enteredAt == null) return;
    const start = Math.max(0, state.enteredAt);
    const end = Math.max(start, Math.min(outAt, firstHalfEndMs));
    const baseStart = Math.min(start, halfMs);
    const baseEnd = Math.min(end, halfMs);
    state.baseMs += Math.max(0, baseEnd - baseStart);
    const extraStart = Math.max(start, halfMs);
    const extraEnd = Math.max(Math.min(end, firstHalfEndMs), halfMs);
    state.firstHalfExtraMs += Math.max(0, extraEnd - extraStart);
    if (remove) {
      state.onField = false;
      state.enteredAt = null;
    }
  };

  const enterFirstHalf = (key, at) => {
    const state = ensureState(key);
    if (!state || state.onField) return;
    const player = registry.get(key);
    if (player) {
      player.present = true;
      player.referenced = true;
    }
    state.onField = true;
    state.enteredAt = Math.max(0, Math.min(at, firstHalfEndMs));
  };

  for (const { event, clockMs } of firstHalfEvents) {
    const at = Math.max(0, Math.min(clockMs, firstHalfEndMs));
    if (isSubstitution(event)) {
      const outKey = resolve(event?.outPlayerId, event?.outPlayerName);
      const inKey = resolve(event?.inPlayerId, event?.inPlayerName);
      if (outKey) accrueFirstHalf(outKey, at, true);
      if (inKey) enterFirstHalf(inKey, at);
    } else {
      const key = resolve(event?.playerId, event?.playerName);
      if (key) accrueFirstHalf(key, at, true);
    }
  }

  // Avslutt regnskapet for 1. omgang, men behold hvem som faktisk står på banen.
  for (const [key, state] of states) {
    if (!state.onField) continue;
    accrueFirstHalf(key, firstHalfEndMs, false);
    state.enteredAt = halfMs;
  }

  const accrueSecondHalf = (key, outAt, remove = true) => {
    const state = ensureState(key);
    if (!state?.onField || state.enteredAt == null) return;
    const start = Math.max(halfMs, state.enteredAt);
    const end = Math.max(start, Math.min(outAt, matchEndMs));
    state.baseMs += Math.max(0, end - start);
    if (remove) {
      state.onField = false;
      state.enteredAt = null;
    }
  };

  const enterSecondHalf = (key, at) => {
    const state = ensureState(key);
    if (!state || state.onField) return;
    const player = registry.get(key);
    if (player) {
      player.present = true;
      player.referenced = true;
    }
    state.onField = true;
    state.enteredAt = Math.max(halfMs, Math.min(at, matchEndMs));
  };

  for (const { event, clockMs } of secondHalfEvents) {
    const at = Math.max(halfMs, Math.min(clockMs, matchEndMs));
    if (isSubstitution(event)) {
      const outKey = resolve(event?.outPlayerId, event?.outPlayerName);
      const inKey = resolve(event?.inPlayerId, event?.inPlayerName);
      if (outKey) accrueSecondHalf(outKey, at, true);
      if (inKey) enterSecondHalf(inKey, at);
    } else {
      const key = resolve(event?.playerId, event?.playerName);
      if (key) accrueSecondHalf(key, at, true);
    }
  }

  for (const [key, state] of states) {
    if (state.onField) accrueSecondHalf(key, matchEndMs, true);
  }

  const oldPlayingTime = Array.isArray(match?.playingTime) ? match.playingTime : [];
  const oldByKey = new Map(oldPlayingTime.map(player => [firstNameKey(player?.name), player]));
  const playingTime = [];

  for (const player of registry.values()) {
    const state = states.get(player.key) || { baseMs: 0, firstHalfExtraMs: 0 };
    const totalMs = Math.max(0, state.baseMs + state.firstHalfExtraMs);
    const participated = totalMs > 0 || starterKeys.has(player.key) || player.referenced;
    if (!player.present && !participated) continue;

    const old = oldByKey.get(firstNameKey(player.name));
    playingTime.push({
      id: player.id,
      name: player.name.split(/\s+/)[0] || player.name,
      minutes: Math.floor(totalMs / 60000),
      cards: Array.isArray(player.cards) && player.cards.length
        ? player.cards
        : (Array.isArray(old?.cards) ? old.cards : [])
    });
  }

  playingTime.sort((a, b) => a.name.localeCompare(b.name, "no"));
  return { playingTime, firstHalfEndMs, matchEndMs };
}

function markForRecalculation(matchId) {
  if (!matchId) return;
  sessionStorage.setItem(RECALC_KEY, JSON.stringify({
    matchId,
    at: Date.now()
  }));
}

function matchIdFromEventRow(element) {
  const panel = element?.closest?.(".eventsPanel");
  if (!panel?.id?.startsWith("events-")) return null;
  return panel.id.slice("events-".length);
}

// Husk hvilken kamp som skal omberegnes. Selve beregningen gjøres først etter
// at hendelses-/spillerendringen er lagret og siden lastes på nytt.
document.addEventListener("click", event => {
  const addButton = event.target.closest?.("[data-add-event]");
  if (addButton) {
    pendingMatchId = addButton.dataset.addEvent || null;
    return;
  }

  const editButton = event.target.closest?.("[data-event-edit]");
  if (editButton) {
    pendingMatchId = matchIdFromEventRow(editButton);
    return;
  }

  const deleteButton = event.target.closest?.("[data-event-delete]");
  if (deleteButton) {
    const matchId = matchIdFromEventRow(deleteButton);
    if (matchId) markForRecalculation(matchId);
    return;
  }

  const playerButton = event.target.closest?.("[data-player-time]");
  if (playerButton) {
    pendingPlayerMatchId = playerButton.dataset.playerTime || null;
  }
}, true);

document.addEventListener("submit", event => {
  if (event.target?.id === "playedEventAdminForm" && pendingMatchId) {
    markForRecalculation(pendingMatchId);
  }
  if (event.target?.id === "playedPlayerAdminForm" && pendingPlayerMatchId) {
    markForRecalculation(pendingPlayerMatchId);
  }
}, true);

async function runPendingRecalculation() {
  const params = new URLSearchParams(window.location.search);
  const pageMatchId = params.get("matchId");
  if (!pageMatchId) return;

  let marker = null;
  try {
    marker = JSON.parse(sessionStorage.getItem(RECALC_KEY) || "null");
  } catch {
    sessionStorage.removeItem(RECALC_KEY);
    return;
  }

  if (!marker?.matchId || marker.matchId !== pageMatchId) return;
  if (!Number.isFinite(marker.at) || Date.now() - marker.at > 10 * 60 * 1000) {
    sessionStorage.removeItem(RECALC_KEY);
    return;
  }
  sessionStorage.removeItem(RECALC_KEY);

  try {
    const ref = doc(db, "matches", pageMatchId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const match = { id: snap.id, ...snap.data() };
    if (String(match.status || "").toUpperCase() !== "ENDED") return;

    const { playingTime, firstHalfEndMs, matchEndMs } = recalculatePlayingTime(match);
    await updateDoc(ref, {
      playingTime,
      playingTimeAutoCalculated: true,
      playingTimeAutoCalculatedAt: new Date().toISOString(),
      playingTimeCalculation: {
        source: "starters-substitutions-match-end",
        firstHalfEndMs,
        matchEndMs
      },
      updatedAt: serverTimestamp()
    });

    // Kampoversikten har allerede lest dokumentet når dette scriptet kjører.
    // Last én gang til slik at de nye minuttene vises umiddelbart.
    const refreshedKey = `${RECALC_KEY}:refreshed:${pageMatchId}`;
    if (sessionStorage.getItem(refreshedKey) !== "1") {
      sessionStorage.setItem(refreshedKey, "1");
      window.location.reload();
      return;
    }
    sessionStorage.removeItem(refreshedKey);
  } catch (error) {
    console.error("Kunne ikke omberegne spilletid etter kampkorrigering:", error);
  }
}

runPendingRecalculation();
