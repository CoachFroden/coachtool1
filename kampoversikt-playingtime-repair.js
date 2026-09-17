import { db } from "./firebase-refleksjon.js";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const CALCULATION_VERSION = 2;

function norm(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("no");
}

function firstNameKey(value) {
  return norm(value).split(" ")[0] || "";
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

function isSubstitution(event) {
  return event?.type === "substitution" || event?.type === "sub";
}

function isHomeRedCard(event) {
  return event?.type === "card" && event?.team === "home" && event?.cardType === "red";
}

function getPlayerSource(match) {
  if (match?.players?.home && typeof match.players.home === "object") return match.players.home;
  if (match?.players && typeof match.players === "object" && !Array.isArray(match.players)) return match.players;
  return {};
}

function makeRegistry(match) {
  const registry = new Map();

  const add = (id, name, source = {}, priority = 0) => {
    const cleanName = String(name || "").trim();
    if (!cleanName && !id) return null;
    const nameKey = firstNameKey(cleanName);
    const key = nameKey ? `name:${nameKey}` : `id:${String(id)}`;
    let row = registry.get(key);

    if (!row) {
      row = {
        key,
        id: id ? String(id) : key,
        name: cleanName || String(id),
        priority,
        present: source?.present === true,
        cards: Array.isArray(source?.cards) ? source.cards : []
      };
      registry.set(key, row);
    } else {
      if (priority > row.priority) {
        if (id) row.id = String(id);
        if (cleanName) row.name = cleanName;
        row.priority = priority;
      }
      if (source?.present === true) row.present = true;
      if (Array.isArray(source?.cards) && source.cards.length > row.cards.length) row.cards = source.cards;
    }
    return key;
  };

  const storedPlayers = getPlayerSource(match);
  Object.entries(storedPlayers).forEach(([id, player]) => {
    add(player?.id || id, player?.name, player || {}, 60);
  });

  for (const player of match?.squad?.present || []) {
    add(player?.id, player?.name, { present: true }, 50);
  }
  for (const player of match?.squad?.starters || []) {
    add(player?.id, player?.name, { present: true }, 50);
  }
  for (const player of match?.playingTime || []) {
    add(player?.id, player?.name, { present: true, cards: player?.cards || [] }, 40);
  }
  for (const player of match?.lineup || []) {
    add(player?.id, player?.name, {}, 30);
  }

  for (const event of match?.events || []) {
    if (isSubstitution(event)) {
      add(event?.outPlayerId, event?.outPlayerName, {}, 20);
      add(event?.inPlayerId, event?.inPlayerName, { present: true }, 20);
    } else if (isHomeRedCard(event)) {
      add(event?.playerId, event?.playerName, {}, 20);
    }
  }

  const resolve = (id, name) => {
    const nameKey = firstNameKey(name);
    if (nameKey && registry.has(`name:${nameKey}`)) return `name:${nameKey}`;
    if (nameKey) return add(id, name, {}, 10);
    if (id) {
      for (const row of registry.values()) {
        if (String(row.id) === String(id)) return row.key;
      }
    }
    return null;
  };

  return { registry, resolve };
}

function authoritativeStarterKeys(match, resolve) {
  const starters = new Set();
  const storedPlayers = getPlayerSource(match);
  const hasPostMatchCorrection = Boolean(match?.postMatchPlayerCorrection?.correctedAt);

  // Etter en manuell etterkorrigering er starter-flagget i players fasiten.
  if (hasPostMatchCorrection) {
    Object.entries(storedPlayers)
      .filter(([, player]) => player?.present === true && player?.starter === true)
      .forEach(([id, player]) => {
        const key = resolve(player?.id || id, player?.name);
        if (key) starters.add(key);
      });
    if (starters.size) return starters;
  }

  for (const player of match?.squad?.starters || []) {
    const key = resolve(player?.id, player?.name);
    if (key) starters.add(key);
  }
  if (starters.size) return starters;

  Object.entries(storedPlayers)
    .filter(([, player]) => player?.starter === true)
    .forEach(([id, player]) => {
      const key = resolve(player?.id || id, player?.name);
      if (key) starters.add(key);
    });
  if (starters.size) return starters;

  for (const player of match?.lineup || []) {
    const key = resolve(player?.id, player?.name);
    if (key) starters.add(key);
  }
  return starters;
}

function matchEndMs(match) {
  const halfMinutes = Number(match?.meta?.halfLengthMin) || 35;
  let endMs = halfMinutes * 2 * 60 * 1000;
  const timerMs = Number(match?.timer?.elapsedMs);
  if (Number.isFinite(timerMs) && timerMs > 0) endMs = Math.max(endMs, timerMs);
  for (const event of match?.events || []) {
    const ms = eventClockMs(event);
    if (Number.isFinite(ms)) endMs = Math.max(endMs, ms);
  }
  return endMs;
}

function recalculate(match) {
  const endMs = matchEndMs(match);
  const { registry, resolve } = makeRegistry(match);
  const starterKeys = authoritativeStarterKeys(match, resolve);
  const states = new Map();

  const stateFor = key => {
    if (!key) return null;
    if (!states.has(key)) states.set(key, { onField: false, enteredAt: null, totalMs: 0 });
    return states.get(key);
  };

  for (const key of starterKeys) {
    const state = stateFor(key);
    state.onField = true;
    state.enteredAt = 0;
    const player = registry.get(key);
    if (player) player.present = true;
  }

  const events = (match?.events || [])
    .map((event, index) => ({ event, index, ms: eventClockMs(event) }))
    .filter(item => Number.isFinite(item.ms) && (isSubstitution(item.event) || isHomeRedCard(item.event)))
    .sort((a, b) => a.ms - b.ms || a.index - b.index);

  const takeOff = (key, at) => {
    const state = stateFor(key);
    if (!state?.onField || state.enteredAt == null) return;
    const end = Math.max(state.enteredAt, Math.min(at, endMs));
    state.totalMs += Math.max(0, end - state.enteredAt);
    state.onField = false;
    state.enteredAt = null;
  };

  const putOn = (key, at) => {
    const state = stateFor(key);
    if (!state || state.onField) return;
    state.onField = true;
    state.enteredAt = Math.max(0, Math.min(at, endMs));
    const player = registry.get(key);
    if (player) player.present = true;
  };

  for (const { event, ms } of events) {
    if (isSubstitution(event)) {
      takeOff(resolve(event?.outPlayerId, event?.outPlayerName), ms);
      putOn(resolve(event?.inPlayerId, event?.inPlayerName), ms);
    } else {
      takeOff(resolve(event?.playerId, event?.playerName), ms);
    }
  }

  for (const [key, state] of states) {
    if (state.onField) takeOff(key, endMs);
  }

  const oldByName = new Map(
    (match?.playingTime || []).map(player => [firstNameKey(player?.name), player])
  );
  const playingTime = [];

  for (const player of registry.values()) {
    const state = states.get(player.key);
    const totalMs = Math.max(0, Number(state?.totalMs) || 0);
    const participated = totalMs > 0 || starterKeys.has(player.key);
    if (!player.present && !participated) continue;

    const old = oldByName.get(firstNameKey(player.name));
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
  return { playingTime, matchEndMs: endMs, starterKeys };
}

function timestamp(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function needsRepair(match, starterKeys) {
  if (!match?.postMatchPlayerCorrection?.correctedAt) return false;

  const version = Number(match?.playingTimeCalculation?.version) || 0;
  if (version < CALCULATION_VERSION) return true;

  const correctedAt = timestamp(match.postMatchPlayerCorrection.correctedAt);
  const calculatedAt = timestamp(match.playingTimeAutoCalculatedAt);
  if (correctedAt > calculatedAt) return true;

  const byName = new Map((match?.playingTime || []).map(player => [firstNameKey(player?.name), player]));
  for (const key of starterKeys) {
    const nameKey = key.startsWith("name:") ? key.slice(5) : "";
    const row = nameKey ? byName.get(nameKey) : null;
    if (!row || Number(row.minutes) <= 0) return true;
  }
  return false;
}

function delay(ms) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}

async function repairIfNeeded() {
  const params = new URLSearchParams(window.location.search);
  const matchId = params.get("matchId");
  if (!matchId || params.get("view") !== "played") return;

  // Den ordinære omberegningen lastes før dette scriptet. Vent til den eventuelt
  // er ferdig, og kontroller deretter resultatet mot den korrigerte starterlisten.
  await delay(1600);

  const ref = doc(db, "matches", matchId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const match = { id: snap.id, ...snap.data() };
  if (String(match.status || "").toUpperCase() !== "ENDED") return;

  const preview = recalculate(match);
  if (!needsRepair(match, preview.starterKeys)) return;

  await updateDoc(ref, {
    playingTime: preview.playingTime,
    playingTimeAutoCalculated: true,
    playingTimeAutoCalculatedAt: new Date().toISOString(),
    playingTimeCalculation: {
      source: "corrected-starters-substitutions-match-end",
      version: CALCULATION_VERSION,
      matchEndMs: preview.matchEndMs
    },
    updatedAt: serverTimestamp()
  });

  const reloadKey = `coachtool1:playingtime-repair-v${CALCULATION_VERSION}:${matchId}`;
  if (sessionStorage.getItem(reloadKey) !== "1") {
    sessionStorage.setItem(reloadKey, "1");
    window.location.reload();
  } else {
    sessionStorage.removeItem(reloadKey);
  }
}

repairIfNeeded().catch(error => {
  console.error("Kunne ikke reparere spilletid etter starterkorrigering:", error);
});
