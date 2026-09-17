import { db } from "./firebase-refleksjon.js";
import {
  doc,
  getDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { recalculateMatchPlayingTime } from "./postmatch-playingtime-sync.js?v=20260918-5";
import {
  PLAYING_TIME_SCHEMA_VERSION,
  MANUAL_OVERRIDE_VERSION,
  calculatePlayingTime
} from "./postmatch-playingtime-core.js?v=20260918-5";

let activeMatchId = null;

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

const FIXED_BY_ID = new Map(FIXED_PLAYERS.map(([id, name]) => [id, { id, name }]));
const FIXED_BY_FIRST = new Map(
  FIXED_PLAYERS.flatMap(([id, name]) => {
    const first = normalizeFirstName(name);
    const rows = [[first, { id, name }]];
    if (first === "nicolai") rows.push(["nico", { id, name }]);
    return rows;
  })
);

function installStyles() {
  if (document.getElementById("playedPlayerAdminStyles")) return;
  const style = document.createElement("style");
  style.id = "playedPlayerAdminStyles";
  style.textContent = `
    .playerTimeBtn{grid-column:1/-1;min-height:42px;border:1px solid rgba(167,139,250,.28);border-radius:12px;background:rgba(124,58,237,.08);color:#ddd6fe;font:inherit;font-size:11px;font-weight:800;cursor:pointer}
    .playerTimeBtn:active{transform:translateY(1px)}
    .playerAdminDialog{width:min(94vw,560px);max-height:90vh;padding:0;border:1px solid rgba(148,163,184,.2);border-radius:20px;background:#0b1727;color:#f8fafc;box-shadow:0 28px 80px rgba(0,0,0,.55)}
    .playerAdminDialog::backdrop{background:rgba(0,6,14,.76);backdrop-filter:blur(4px)}
    .playerAdminForm{display:grid;gap:14px;padding:20px}
    .playerAdminHeader{display:flex;justify-content:space-between;gap:14px;align-items:flex-start}
    .playerAdminHeader h2{margin:3px 0 5px;font-size:22px;letter-spacing:-.035em}
    .playerAdminHeader p{margin:0;color:#8094ad;font-size:11px}
    .playerAdminKicker{display:block;color:#c4b5fd;font-size:9px;font-weight:900;letter-spacing:.15em}
    .playerAdminClose{width:38px;height:38px;flex:0 0 38px;border:1px solid rgba(148,163,184,.15);border-radius:11px;background:rgba(255,255,255,.035);color:#aebed0;font-size:22px}
    .playerAdminHelp{margin:0;padding:10px 12px;border:1px solid rgba(125,211,252,.12);border-radius:12px;background:rgba(14,116,144,.05);color:#8fa4bd;font-size:10px;line-height:1.5}
    .playerAdminColumns{display:grid;grid-template-columns:minmax(0,1fr) 54px 58px 80px;gap:8px;align-items:center;padding:0 8px;color:#667b94;font-size:9px;font-weight:850;text-transform:uppercase;letter-spacing:.06em}
    .playerAdminList{display:grid;gap:6px;max-height:52vh;overflow:auto;padding-right:2px}
    .playerAdminRow{display:grid;grid-template-columns:minmax(0,1fr) 54px 58px 80px;gap:8px;align-items:center;padding:9px 8px;border:1px solid rgba(148,163,184,.1);border-radius:12px;background:rgba(255,255,255,.022)}
    .playerAdminRow.notPresent{opacity:.52}
    .playerAdminName{min-width:0;font-size:12px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .playerAdminCheck{display:grid;place-items:center}
    .playerAdminCheck input{width:18px;height:18px;accent-color:#3b82f6}
    .playerAdminMinutes{width:100%;min-height:36px;border:1px solid rgba(148,163,184,.18);border-radius:9px;background:#07111d;color:#f8fafc;padding:7px 8px;font:inherit;font-size:12px;text-align:center;outline:none}
    .playerAdminMinutes:focus{border-color:rgba(59,130,246,.7);box-shadow:0 0 0 3px rgba(59,130,246,.1)}
    .playerAdminMinutes:disabled{opacity:.45}
    .playerAdminFooter{display:grid;grid-template-columns:1fr 1.3fr;gap:8px}
    .playerAdminFooter button{min-height:45px;border-radius:12px;font:inherit;font-size:12px;font-weight:850;cursor:pointer}
    .playerAdminCancel{border:1px solid rgba(148,163,184,.15);background:rgba(255,255,255,.035);color:#b8c6d7}
    .playerAdminSave{border:1px solid rgba(59,130,246,.5);background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff}
    .playerAdminSave:disabled{opacity:.55;cursor:wait}
    .playerAdminError{min-height:16px;margin:0;color:#fb7185;font-size:10px}
    @media(max-width:420px){.playerAdminForm{padding:16px}.playerAdminColumns,.playerAdminRow{grid-template-columns:minmax(0,1fr) 48px 50px 66px;gap:5px}.playerAdminColumns{font-size:8px}.playerAdminName{font-size:11px}.playerAdminFooter{grid-template-columns:1fr}}
  `;
  document.head.appendChild(style);
}

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function norm(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("no");
}

function normalizeFirstName(value) {
  return norm(value).split(" ")[0] || "";
}

function fixedPlayer(id, name) {
  const cleanId = String(id || "").trim();
  if (FIXED_BY_ID.has(cleanId)) return FIXED_BY_ID.get(cleanId);
  return FIXED_BY_FIRST.get(normalizeFirstName(name)) || null;
}

function playerIdentity(id, name) {
  const fixed = fixedPlayer(id, name);
  if (fixed) return `fixed:${fixed.id}`;
  const cleanName = norm(name);
  if (cleanName) return `name:${cleanName}`;
  return `id:${String(id || "unknown")}`;
}

function canonicalPlayerData(id, name) {
  const fixed = fixedPlayer(id, name);
  if (fixed) return fixed;
  return {
    id: String(id || `name:${norm(name)}`),
    name: String(name || "Ukjent spiller").trim()
  };
}

function existingManualOverrides(match) {
  const map = new Map();
  if (Number(match?.playingTimeManualOverrideVersion) !== MANUAL_OVERRIDE_VERSION) {
    return map;
  }
  const rows = Array.isArray(match?.playingTimeManualOverrides)
    ? match.playingTimeManualOverrides
    : [];
  for (const item of rows) {
    const identity = playerIdentity(item?.id, item?.name);
    if (!identity) continue;
    map.set(identity, {
      id: item?.id || "",
      name: item?.name || "",
      minutes: Math.max(0, Math.round(Number(item?.minutes) || 0)),
      setAt: item?.setAt || ""
    });
  }
  return map;
}

function ensureDialog() {
  let dialog = document.getElementById("playedPlayerAdminDialog");
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "playedPlayerAdminDialog";
  dialog.className = "playerAdminDialog";
  dialog.innerHTML = `
    <form id="playedPlayerAdminForm" class="playerAdminForm" method="dialog">
      <div class="playerAdminHeader">
        <div>
          <span class="playerAdminKicker">ETTERKORRIGERING</span>
          <h2>Spillere og spilletid</h2>
          <p id="playedPlayerAdminFixture"></p>
        </div>
        <button id="playedPlayerAdminClose" class="playerAdminClose" type="button" aria-label="Lukk">×</button>
      </div>
      <p class="playerAdminHelp">
        Rett hvem som faktisk var med og hvem som startet. Spilletiden beregnes automatisk
        fra startellever, bytter og kampslutt. Bytter redigeres under Hendelser.
      </p>
      <div class="playerAdminColumns" aria-hidden="true">
        <span>Spiller</span><span>Med</span><span>Start</span><span>Min</span>
      </div>
      <div id="playedPlayerAdminList" class="playerAdminList"></div>
      <p id="playedPlayerAdminError" class="playerAdminError"></p>
      <div class="playerAdminFooter">
        <button id="playedPlayerAdminCancel" class="playerAdminCancel" type="button">Avbryt</button>
        <button id="playedPlayerAdminSave" class="playerAdminSave" type="submit">Lagre korrigering</button>
      </div>
    </form>`;

  document.body.appendChild(dialog);
  document.getElementById("playedPlayerAdminClose").onclick = () => dialog.close();
  document.getElementById("playedPlayerAdminCancel").onclick = () => dialog.close();
  document.getElementById("playedPlayerAdminForm").addEventListener("submit", saveCorrections);
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}

function collectPlayers(match) {
  const map = new Map();

  const add = (id, name, source = {}) => {
    const cleanName = String(name || "").trim();
    if (!cleanName) return null;

    const identity = playerIdentity(id, cleanName);
    const canonical = canonicalPlayerData(id, cleanName);
    let row = map.get(identity);

    if (!row) {
      row = {
        identity,
        id: canonical.id,
        name: canonical.name,
        present: false,
        starter: false,
        minutes: 0,
        cards: []
      };
      map.set(identity, row);
    }

    if (Object.prototype.hasOwnProperty.call(source, "minutes") &&
        Number.isFinite(Number(source.minutes))) {
      row.minutes = Math.max(row.minutes, Number(source.minutes));
    }
    if (Array.isArray(source.cards) && source.cards.length >= row.cards.length) {
      row.cards = source.cards;
    }
    return row;
  };

  const raw = rawPlayerSource(match);
  Object.entries(raw).forEach(([id, player]) => {
    add(player?.id || id, player?.name, {
      cards: player?.cards || []
    });
  });

  for (const player of match?.playingTime || []) add(player?.id, player?.name, player);
  for (const player of match?.lineup || []) add(player?.id, player?.name, player);
  for (const player of match?.squad?.present || []) add(player?.id, player?.name, player);
  for (const player of match?.squad?.starters || []) add(player?.id, player?.name, player);

  const markPresent = player => {
    const row = add(player?.id, player?.name, player);
    if (row) row.present = true;
    return row;
  };
  const markStarter = player => {
    const row = markPresent(player);
    if (row) row.starter = true;
  };

  const corrected = Boolean(match?.postMatchPlayerCorrection?.correctedAt);
  const squadPresent = Array.isArray(match?.squad?.present) ? match.squad.present : [];
  const squadStarters = Array.isArray(match?.squad?.starters) ? match.squad.starters : [];

  if (corrected && (squadPresent.length || squadStarters.length)) {
    // Etter etterkorrigering er squad-feltene eneste fasit for Med/Start.
    squadPresent.forEach(markPresent);
    squadStarters.forEach(markStarter);
  } else {
    Object.entries(raw).forEach(([id, player]) => {
      const candidate = { id: player?.id || id, name: player?.name };
      if (player?.present === true) markPresent(candidate);
      if (player?.present === true && player?.starter === true) markStarter(candidate);
    });

    squadPresent.forEach(markPresent);
    squadStarters.forEach(markStarter);

    if (![...map.values()].some(player => player.starter)) {
      for (const player of match?.lineup || []) markStarter(player);
    }
  }

  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "no"));
}

function matchLengthMinutes(match) {
  const timerMinutes = Math.round((Number(match?.timer?.elapsedMs) || 0) / 60000);
  if (timerMinutes > 0) return timerMinutes;
  const half = Number(match?.meta?.halfLengthMin) || 35;
  return half * 2;
}

async function openPlayerAdmin(matchId) {
  activeMatchId = matchId;

  // Sørg for at minuttallene som vises er beregnet fra den korrigerte
  // starterlisten og de faktiske byttehendelsene før dialogen åpnes.
  const recalculated = await recalculateMatchPlayingTime(matchId);
  const match = recalculated || (() => null)();
  if (!match) {
    const snap = await getDoc(doc(db, "matches", matchId));
    if (!snap.exists()) return;
    const fallback = { id: snap.id, ...snap.data() };
    if (String(fallback.status || "").toUpperCase() !== "ENDED") return;
    return renderPlayerAdmin(matchId, fallback);
  }
  if (String(match.status || "").toUpperCase() !== "ENDED") return;
  return renderPlayerAdmin(matchId, match);
}

function renderPlayerAdmin(matchId, match) {

  const dialog = ensureDialog();
  const meta = match.meta || {};
  document.getElementById("playedPlayerAdminFixture").textContent =
    `${meta.ourTeam || "Samnanger"} – ${meta.opponent || "Motstander"}`;
  document.getElementById("playedPlayerAdminError").textContent = "";

  const players = collectPlayers(match);
  const maxMinutes = Math.max(matchLengthMinutes(match), ...players.map(p => Number(p.minutes) || 0));
  const list = document.getElementById("playedPlayerAdminList");
  list.innerHTML = players.map(player => `
    <div class="playerAdminRow${player.present ? "" : " notPresent"}"
      data-player-id="${esc(player.id)}"
      data-player-name="${esc(player.name)}"
      data-player-identity="${esc(player.identity)}"
      data-original-present="${player.present ? "1" : "0"}"
      data-original-starter="${player.starter ? "1" : "0"}"
      data-original-minutes="${Math.max(0, Math.round(Number(player.minutes) || 0))}">
      <span class="playerAdminName">${esc(player.name)}</span>
      <label class="playerAdminCheck" title="Var med i kampen"><input type="checkbox" data-field="present" ${player.present ? "checked" : ""}></label>
      <label class="playerAdminCheck" title="Startet kampen"><input type="checkbox" data-field="starter" ${player.starter ? "checked" : ""} ${player.present ? "" : "disabled"}></label>
      <input class="playerAdminMinutes" data-field="minutes" type="number" value="${Math.max(0, Math.round(Number(player.minutes) || 0))}" readonly aria-readonly="true" tabindex="-1" aria-label="Beregnet spilletid for ${esc(player.name)}">
    </div>`).join("");

  list.querySelectorAll('[data-field="present"]').forEach(input => {
    input.addEventListener("change", () => {
      const row = input.closest(".playerAdminRow");
      const starter = row.querySelector('[data-field="starter"]');
      const minutes = row.querySelector('[data-field="minutes"]');
      row.classList.toggle("notPresent", !input.checked);
      starter.disabled = !input.checked;
      minutes.disabled = !input.checked;
      if (!input.checked) {
        starter.checked = false;
        minutes.value = "0";
      }
    });
  });

  dialog.showModal();
}

function rawPlayerSource(match) {
  if (match?.players?.home && typeof match.players.home === "object") return match.players.home;
  if (match?.players && typeof match.players === "object" && !Array.isArray(match.players)) return match.players;
  return {};
}

function rawCandidatesForIdentity(rawPlayers, identity) {
  return Object.entries(rawPlayers)
    .filter(([key, player]) => playerIdentity(player?.id || key, player?.name) === identity)
    .map(([key, player]) => ({ key, player: player || {} }));
}

function mergeCards(candidates, fallbackCards = []) {
  const result = [];
  const seen = new Set();
  for (const card of [...candidates.flatMap(item => item.player?.cards || []), ...fallbackCards]) {
    const key = String(card?.id || `${card?.type || ""}:${card?.timeMs || ""}`);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(card);
  }
  return result;
}

function richestCandidate(candidates) {
  return candidates
    .slice()
    .sort((a, b) => {
      const aIntervals = Array.isArray(a.player?.intervals) ? a.player.intervals.length : 0;
      const bIntervals = Array.isArray(b.player?.intervals) ? b.player.intervals.length : 0;
      const aCards = Array.isArray(a.player?.cards) ? a.player.cards.length : 0;
      const bCards = Array.isArray(b.player?.cards) ? b.player.cards.length : 0;
      return (bIntervals + bCards) - (aIntervals + aCards);
    })[0] || null;
}

async function saveCorrections(event) {
  event.preventDefault();
  const errorEl = document.getElementById("playedPlayerAdminError");
  const saveBtn = document.getElementById("playedPlayerAdminSave");
  errorEl.textContent = "";
  if (!activeMatchId) return;

  saveBtn.disabled = true;
  saveBtn.textContent = "Lagrer…";

  try {
    const ref = doc(db, "matches", activeMatchId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Kampen finnes ikke lenger.");

    const match = { id: snap.id, ...snap.data() };
    if (String(match.status || "").toUpperCase() !== "ENDED") {
      throw new Error("Bare ferdigspilte kamper kan korrigeres her.");
    }

    const oldRawPlayers = rawPlayerSource(match);
    const cleanRawPlayers = {};
    const rows = [...document.querySelectorAll("#playedPlayerAdminList .playerAdminRow")];
    const squadPresent = [];
    const squadStarters = [];
    let starterCount = 0;

    for (const row of rows) {
      const id = row.dataset.playerId;
      const name = row.dataset.playerName;
      const identity = row.dataset.playerIdentity || playerIdentity(id, name);
      const present = row.querySelector('[data-field="present"]').checked;
      const starter = present && row.querySelector('[data-field="starter"]').checked;
      const originalPresent = row.dataset.originalPresent === "1";
      const originalStarter = row.dataset.originalStarter === "1";
      const rosterChanged = present !== originalPresent || starter !== originalStarter;
      if (starter) starterCount++;

      const canonical = canonicalPlayerData(id, name);
      const candidates = rawCandidatesForIdentity(oldRawPlayers, identity);
      const richest = richestCandidate(candidates);
      const playingTimeMatch = (match.playingTime || []).find(item =>
        playerIdentity(item?.id, item?.name) === identity
      );
      const cards = mergeCards(candidates, playingTimeMatch?.cards || []);
      const base = richest?.player || {};
      const storedKey = fixedPlayer(canonical.id, canonical.name)?.id || richest?.key || canonical.id;

      cleanRawPlayers[storedKey] = {
        ...base,
        id: canonical.id || base.id || storedKey,
        name: canonical.name || base.name || name,
        present,
        starter,
        intervals: Array.isArray(base.intervals) ? base.intervals : [],
        cards
      };

      if (!present) continue;

      const playerId = canonical.id || storedKey;
      squadPresent.push({ id: playerId, name: canonical.name });
      if (starter) squadStarters.push({ id: playerId, name: canonical.name });
    }

    if (starterCount > 11) {
      throw new Error("Det kan ikke være mer enn 11 startere.");
    }

    const starterIdentity = new Set(
      squadStarters.map(player => playerIdentity(player.id, player.name))
    );
    const lineupByIdentity = new Map();

    for (const player of Array.isArray(match.lineup) ? match.lineup : []) {
      const identity = playerIdentity(player?.id, player?.name);
      if (!starterIdentity.has(identity) || lineupByIdentity.has(identity)) continue;
      const canonical = canonicalPlayerData(player?.id, player?.name);
      lineupByIdentity.set(identity, {
        ...player,
        id: canonical.id,
        name: canonical.name
      });
    }

    for (const starter of squadStarters) {
      const identity = playerIdentity(starter.id, starter.name);
      if (!lineupByIdentity.has(identity)) {
        lineupByIdentity.set(identity, {
          id: starter.id,
          name: starter.name,
          x: 50,
          y: 50
        });
      }
    }

    const lineup = [...lineupByIdentity.values()];
    const playersUpdate = match?.players?.home
      ? { ...match.players, home: cleanRawPlayers }
      : cleanRawPlayers;

    const correctedAt = new Date().toISOString();
    const correctedMeta = {
      correctedAt,
      correctedPlayers: squadPresent.length,
      duplicatesCleaned: true
    };

    const draftMatch = {
      ...match,
      players: playersUpdate,
      squad: {
        ...(match.squad || {}),
        present: squadPresent,
        starters: squadStarters
      },
      lineup,
      postMatchPlayerCorrection: correctedMeta,
      playingTimeManualOverrides: [],
      playingTimeManualOverrideVersion: MANUAL_OVERRIDE_VERSION
    };

    const calculated = calculatePlayingTime(draftMatch, {
      presentPlayers: squadPresent,
      starterPlayers: squadStarters
    });
    const finalPlayingTime = calculated.playingTime;

    const updatePayload = {
      players: playersUpdate,
      playingTime: finalPlayingTime,
      squad: draftMatch.squad,
      lineup,
      lineupConfirmed: starterCount === 11,
      postMatchPlayerCorrection: correctedMeta,
      playingTimeManualOverrides: [],
      playingTimeManualOverrideVersion: MANUAL_OVERRIDE_VERSION,
      playingTimeCalculation: {
        source: "starters-substitutions-match-end",
        mode: "auto",
        version: PLAYING_TIME_SCHEMA_VERSION,
        matchEndMs: calculated.matchEndMs,
        starterCount: calculated.starterCount
      },
      playingTimeAutoCalculated: true,
      playingTimeAutoCalculatedAt: correctedAt,
      playingTimeRecalcRequestedAt: null,
      updatedAt: serverTimestamp()
    };


    await updateDoc(ref, updatePayload);
    dialogCloseAndReload(activeMatchId);
  } catch (error) {
    console.error(error);
    errorEl.textContent = error.message || "Kunne ikke lagre korrigeringen.";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Lagre korrigering";
  }
}

function dialogCloseAndReload(matchId) {
  document.getElementById("playedPlayerAdminDialog")?.close();
  const url = new URL(window.location.href);
  url.searchParams.set("view", "played");
  url.searchParams.set("matchId", matchId);
  window.location.href = url.toString();
}

function enhancePlayedCards() {
  document.querySelectorAll(".matchCard[id^='match-']").forEach(card => {
    const matchId = card.id.slice("match-".length);
    const actions = card.querySelector(".postMatchActions");
    if (!actions || actions.querySelector("[data-player-time]")) return;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "playerTimeBtn";
    button.dataset.playerTime = matchId;
    button.textContent = "👥 Spillere / spilletid";
    actions.appendChild(button);
  });
}

const observer = new MutationObserver(enhancePlayedCards);
observer.observe(document.getElementById("content"), { childList: true, subtree: true });

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-player-time]");
  if (!button) return;
  event.preventDefault();
  await openPlayerAdmin(button.dataset.playerTime);
});

installStyles();
enhancePlayedCards();