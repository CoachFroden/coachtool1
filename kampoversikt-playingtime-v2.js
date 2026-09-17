import { db } from "./firebase-refleksjon.js";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const CALC_VERSION = 8;
const RELOAD_KEY = "coachtool1:playingtime-v2-reloaded";

function timestamp(value) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function norm(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("no");
}

function firstName(value) {
  return norm(value).split(" ")[0] || "";
}

function keyFor(id, name) {
  const first = firstName(name);
  return first ? `name:${first}` : `id:${String(id || "unknown")}`;
}

function manualOverrides(match) {
  const rows = Array.isArray(match?.playingTimeManualOverrides)
    ? match.playingTimeManualOverrides
    : [];
  const map = new Map();
  for (const item of rows) {
    const key = keyFor(item?.id, item?.name);
    if (!key) continue;
    map.set(key, {
      id: item?.id || "",
      name: item?.name || "",
      minutes: Math.max(0, Math.round(Number(item?.minutes) || 0))
    });
  }
  return map;
}

function applyManualOverrides(match, rows) {
  const overrides = manualOverrides(match);
  if (!overrides.size) return rows;

  const result = rows.map(row => ({ ...row }));
  const byKey = new Map(result.map(row => [keyFor(row?.id, row?.name), row]));

  for (const [key, override] of overrides) {
    const row = byKey.get(key);
    if (row) {
      row.minutes = override.minutes;
      continue;
    }

    const old = (match?.playingTime || []).find(player =>
      keyFor(player?.id, player?.name) === key
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

function parseMinute(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const plus = text.match(/^(\d+)\s*\+\s*(\d+)$/);
  if (plus) return Number(plus[1]) + Number(plus[2]);
  return /^\d+$/.test(text) ? Number(text) : null;
}

function eventTimeMs(event) {
  const minute = parseMinute(event?.minute);
  if (minute != null) return Math.max(0, minute * 60000);
  const ms = Number(event?.timeMs);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

function playerSource(match) {
  if (match?.players?.home && typeof match.players.home === "object") return match.players.home;
  if (match?.players && typeof match.players === "object" && !Array.isArray(match.players)) return match.players;
  return {};
}

function buildRegistry(match) {
  const registry = new Map();
  const idToKey = new Map();

  function add(id, name, source = {}, priority = 0) {
    const cleanName = String(name || "").trim();
    if (!cleanName && !id) return null;
    const key = keyFor(id, cleanName);
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
        existing.id = String(id || existing.id);
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
  Object.entries(stored).forEach(([id, player]) => add(player?.id || id, player?.name, player, 100));
  for (const player of match?.squad?.present || []) add(player?.id, player?.name, player, 80);
  for (const player of match?.squad?.starters || []) add(player?.id, player?.name, player, 85);
  for (const player of match?.lineup || []) add(player?.id, player?.name, player, 70);
  for (const player of match?.playingTime || []) add(player?.id, player?.name, player, 60);

  for (const event of match?.events || []) {
    if (event?.type === "substitution" || event?.type === "sub") {
      add(event?.outPlayerId, event?.outPlayerName, {}, 40);
      add(event?.inPlayerId, event?.inPlayerName, {}, 40);
    } else if (event?.type === "card" && event?.team === "home") {
      add(event?.playerId, event?.playerName, {}, 40);
    }
  }

  function resolve(id, name) {
    if (id && idToKey.has(String(id))) return idToKey.get(String(id));
    const byName = keyFor(null, name);
    if (name && registry.has(byName)) return byName;
    return add(id, name, {}, 20);
  }

  return { registry, resolve };
}

function correctedPlayerKeys(match, resolve) {
  const present = new Set();
  const starters = new Set();
  const stored = playerSource(match);
  const hasPostMatchCorrection = Boolean(match?.postMatchPlayerCorrection?.correctedAt);

  const addPresent = player => {
    const key = resolve(player?.id, player?.name);
    if (key) present.add(key);
    return key;
  };

  const addStarter = player => {
    const key = addPresent(player);
    if (key) starters.add(key);
  };

  // Etter en manuell etterkorrigering er squad-listene den autoritative
  // kampfasiten. lineup er bare en visuell baneplassering og skal aldri kunne
  // gjøre en spiller til starter igjen.
  if (hasPostMatchCorrection) {
    const correctedPresent = Array.isArray(match?.squad?.present)
      ? match.squad.present
      : [];
    const correctedStarters = Array.isArray(match?.squad?.starters)
      ? match.squad.starters
      : [];

    if (correctedPresent.length || correctedStarters.length) {
      for (const player of correctedPresent) addPresent(player);
      for (const player of correctedStarters) addStarter(player);
      return { present, starters };
    }

    // Fallback for eldre korrigerte kamper som mangler squad-listene.
    Object.values(stored).forEach(player => {
      if (player?.present === true) addPresent(player);
      if (player?.present === true && player?.starter === true) addStarter(player);
    });
    return { present, starters };
  }

  for (const player of match?.squad?.present || []) addPresent(player);
  for (const player of match?.squad?.starters || []) addStarter(player);

  if (!starters.size) {
    Object.values(stored).forEach(player => {
      if (player?.present === true) addPresent(player);
      if (player?.starter === true) addStarter(player);
    });
  }

  if (!starters.size) {
    for (const player of match?.lineup || []) addStarter(player);
  }

  return { present, starters };
}

function matchEndMs(match) {
  const halfMinutes = Number(match?.meta?.halfLengthMin) || 35;
  const official = halfMinutes * 2 * 60000;
  const timer = Number(match?.timer?.elapsedMs);
  let end = Number.isFinite(timer) && timer > 0 ? Math.max(official, timer) : official;

  for (const event of match?.events || []) {
    const ms = eventTimeMs(event);
    if (Number.isFinite(ms)) end = Math.max(end, ms);
  }
  return end;
}

function calculate(match) {
  const { registry, resolve } = buildRegistry(match);
  const { present, starters } = correctedPlayerKeys(match, resolve);
  const endMs = matchEndMs(match);
  const states = new Map();
  const referenced = new Set();

  function stateFor(key) {
    if (!states.has(key)) states.set(key, { on: false, enteredAt: null, totalMs: 0 });
    return states.get(key);
  }

  function enter(key, at) {
    if (!key) return;
    referenced.add(key);
    const state = stateFor(key);
    if (state.on) return;
    state.on = true;
    state.enteredAt = Math.max(0, Math.min(at, endMs));
  }

  function leave(key, at) {
    if (!key) return;
    referenced.add(key);
    const state = stateFor(key);
    if (!state.on || state.enteredAt == null) return;
    const leaveAt = Math.max(state.enteredAt, Math.min(at, endMs));
    state.totalMs += Math.max(0, leaveAt - state.enteredAt);
    state.on = false;
    state.enteredAt = null;
  }

  starters.forEach(key => enter(key, 0));

  const timeline = (match?.events || [])
    .map((event, index) => ({ event, index, at: eventTimeMs(event) }))
    .filter(item => Number.isFinite(item.at))
    .filter(item => item.event?.type === "substitution" || item.event?.type === "sub" ||
      (item.event?.type === "card" && item.event?.team === "home" && item.event?.cardType === "red"))
    .sort((a, b) => a.at - b.at || a.index - b.index);

  for (const { event, at } of timeline) {
    if (event?.type === "substitution" || event?.type === "sub") {
      leave(resolve(event?.outPlayerId, event?.outPlayerName), at);
      enter(resolve(event?.inPlayerId, event?.inPlayerName), at);
    } else {
      leave(resolve(event?.playerId, event?.playerName), at);
    }
  }

  for (const [key, state] of states) {
    if (state.on) leave(key, endMs);
  }

  const oldByKey = new Map((match?.playingTime || []).map(player => [keyFor(player?.id, player?.name), player]));
  const result = [];

  for (const player of registry.values()) {
    const state = states.get(player.key);
    const totalMs = Math.max(0, Number(state?.totalMs) || 0);
    const participated = totalMs > 0 || starters.has(player.key) || referenced.has(player.key);
    if (!present.has(player.key) && !participated) continue;

    const old = oldByKey.get(player.key);
    const cards = player.cards.length ? player.cards : (Array.isArray(old?.cards) ? old.cards : []);
    result.push({
      id: player.id,
      name: String(player.name || "").split(/\s+/)[0] || player.name,
      minutes: Math.floor(totalMs / 60000),
      cards
    });
  }

  result.sort((a, b) => norm(a.name).localeCompare(norm(b.name), "no"));
  return { playingTime: result, matchEndMs: endMs, starterCount: starters.size };
}

function comparable(rows) {
  return (rows || [])
    .map(row => ({
      key: keyFor(row?.id, row?.name),
      minutes: Math.max(0, Math.floor(Number(row?.minutes) || 0))
    }))
    .sort((a, b) => a.key.localeCompare(b.key));
}

function samePlayingTime(a, b) {
  return JSON.stringify(comparable(a)) === JSON.stringify(comparable(b));
}

async function reconcile() {
  const params = new URLSearchParams(window.location.search);
  const matchId = params.get("matchId");
  if (!matchId || params.get("view") !== "played") return;

  const ref = doc(db, "matches", matchId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const match = { id: snap.id, ...snap.data() };
  if (String(match.status || "").toUpperCase() !== "ENDED") return;

  const requestedAt = timestamp(match?.playingTimeRecalcRequestedAt);
  const overrides = manualOverrides(match);
  const legacyGlobalManual =
    match?.playingTimeCalculation?.mode === "manual" &&
    !Array.isArray(match?.playingTimeManualOverrides);

  const version = Number(match?.playingTimeCalculation?.version) || 0;

  // Normalt regner vi bare når en spiller-/bytteendring eksplisitt ber om det.
  // Ny beregningsversjon får også kjøre én gang for å reparere eldre data.
  if (!requestedAt && !legacyGlobalManual && version >= CALC_VERSION) {
    sessionStorage.removeItem(`${RELOAD_KEY}:${matchId}`);
    return;
  }

  const calculated = calculate(match);
  const finalPlayingTime = applyManualOverrides(match, calculated.playingTime);
  const needsWrite =
    requestedAt > 0 ||
    legacyGlobalManual ||
    version < CALC_VERSION ||
    !samePlayingTime(match.playingTime, finalPlayingTime);

  if (!needsWrite) {
    sessionStorage.removeItem(`${RELOAD_KEY}:${matchId}`);
    return;
  }

  await updateDoc(ref, {
    playingTime: finalPlayingTime,
    playingTimeAutoCalculated: true,
    playingTimeAutoCalculatedAt: new Date().toISOString(),
    playingTimeRecalcRequestedAt: null,
    playingTimeCalculation: {
      source: overrides.size
        ? "auto-with-player-manual-overrides"
        : "corrected-starters-substitutions-match-end",
      mode: overrides.size ? "mixed" : "auto",
      version: CALC_VERSION,
      matchEndMs: calculated.matchEndMs,
      starterCount: calculated.starterCount
    },
    updatedAt: serverTimestamp()
  });

  const reloadKey = `${RELOAD_KEY}:${matchId}`;
  if (sessionStorage.getItem(reloadKey) !== "1") {
    sessionStorage.setItem(reloadKey, "1");
    window.location.reload();
  }
}

reconcile().catch(error => {
  console.error("Kunne ikke synkronisere spilletid etter kampkorrigering:", error);
});
