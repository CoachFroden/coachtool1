import { db } from "./firebase-refleksjon.js";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { recalculateMatchPlayingTime } from "./postmatch-playingtime-sync.js?v=20260918-5";

let activeMatchId = null;
let activeEventIndex = null;

function installStyles() {
  if (document.getElementById("playedEventAdminStyles")) return;
  const style = document.createElement("style");
  style.id = "playedEventAdminStyles";
  style.textContent = `
    .eventRow.eventAdminReady{grid-template-columns:38px minmax(0,1fr) auto;align-items:center}
    .eventAdminActions{display:flex;gap:5px;align-items:center;padding-left:4px}
    .eventAdminBtn{width:32px;height:32px;border:1px solid rgba(148,163,184,.16);border-radius:9px;background:rgba(255,255,255,.035);color:#a9bad0;font:inherit;font-size:13px;font-weight:800;cursor:pointer;display:grid;place-items:center}
    .eventAdminBtn.edit{color:#bae6fd;border-color:rgba(125,211,252,.22);background:rgba(14,116,144,.07)}
    .eventAdminBtn.delete{color:#fda4af;border-color:rgba(251,113,133,.22);background:rgba(190,24,93,.06)}
    .eventAdminBtn:active{transform:translateY(1px)}
    .eventAdminDialog .substitutionFields{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .eventAdminDialog .dialogHint{margin:-4px 0 0;color:#71869f;font-size:9px;line-height:1.4}
    @media(max-width:390px){.eventAdminDialog .substitutionFields{grid-template-columns:1fr}.eventAdminBtn{width:30px;height:30px}}
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

function parseMatchMinute(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const plus = text.match(/^(\d+)\s*\+\s*(\d+)$/);
  if (plus) return Number(plus[1]) + Number(plus[2]);
  if (/^\d+$/.test(text)) return Number(text);
  return null;
}

function eventSortValue(event) {
  const ms = Number(event?.timeMs);
  if (Number.isFinite(ms)) return ms;
  const minute = parseMatchMinute(event?.minute);
  return minute == null ? Number.MAX_SAFE_INTEGER : minute * 60000;
}

function sortedEventEntries(events) {
  return (Array.isArray(events) ? events : [])
    .map((event, index) => ({ event, index }))
    .sort((a, b) => eventSortValue(a.event) - eventSortValue(b.event));
}

function stripClockPrefix(value) {
  return String(value || "")
    .replace(/^\s*\d{1,2}:\d{2}\s*[–-]\s*/u, "")
    .trim();
}

function editableDescription(event) {
  return stripClockPrefix(event?.rawText || event?.text || "")
    .replace(/^📝\s*/u, "")
    .trim();
}

function minuteTextForEvent(event) {
  if (String(event?.minute ?? "").trim()) return String(event.minute).trim();
  const ms = Number(event?.timeMs);
  if (Number.isFinite(ms) && ms > 0) return String(Math.max(1, Math.ceil(ms / 60000)));
  return "";
}

function playersForMatch(match) {
  const candidates = [];
  if (match?.players?.home && typeof match.players.home === "object") {
    candidates.push(...Object.values(match.players.home));
  } else if (match?.players && !Array.isArray(match.players) && typeof match.players === "object") {
    candidates.push(...Object.values(match.players));
  }
  if (!candidates.length && Array.isArray(match?.playingTime)) candidates.push(...match.playingTime);
  if (!candidates.length && Array.isArray(match?.squad?.present)) candidates.push(...match.squad.present);

  const unique = new Map();
  for (const player of candidates) {
    if (!player?.name) continue;
    const id = String(player.id || player.playerId || player.name);
    if (!unique.has(id)) unique.set(id, { id, name: player.name });
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, "no"));
}

function eventFormType(event) {
  if (!event) return "goal";
  if (event.type === "goal") return "goal";
  if (event.type === "card") return event.cardType === "red" ? "red" : "yellow";
  if (event.type === "substitution" || event.type === "sub") return "substitution";
  return "note";
}

function ensureOptionByName(select, name) {
  if (!select || !name) return;
  const existing = [...select.options].find(option => option.textContent.trim() === String(name).trim());
  if (existing) {
    select.value = existing.value;
    return;
  }
  const option = document.createElement("option");
  option.value = `name:${name}`;
  option.textContent = name;
  select.appendChild(option);
  select.value = option.value;
}

function ensureDialog() {
  let dialog = document.getElementById("playedEventAdminDialog");
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "playedEventAdminDialog";
  dialog.className = "postMatchDialog eventAdminDialog";
  dialog.innerHTML = `
    <form id="playedEventAdminForm" class="postMatchForm" method="dialog">
      <div class="dialogHeader">
        <div>
          <span id="playedEventAdminKicker" class="dialogKicker">ETTERREGISTRERING</span>
          <h2 id="playedEventAdminTitle">Legg til hendelse</h2>
          <p id="playedEventAdminFixture"></p>
        </div>
        <button id="playedEventAdminClose" class="dialogClose" type="button" aria-label="Lukk">×</button>
      </div>

      <label>Hendelse
        <select id="playedEventType">
          <option value="goal">Mål</option>
          <option value="yellow">Gult kort</option>
          <option value="red">Rødt kort</option>
          <option value="substitution">Bytte</option>
          <option value="note">Annen hendelse</option>
        </select>
      </label>

      <label id="playedEventTeamRow">Lag
        <select id="playedEventTeam"></select>
      </label>

      <label id="playedEventMinuteRow">Kampminutt
        <input id="playedEventMinute" type="text" inputmode="numeric" placeholder="f.eks. 42 eller 70 + 2" />
      </label>

      <label id="playedEventPlayerRow">Spiller
        <select id="playedEventPlayer"></select>
      </label>

      <label id="playedEventOpponentPlayerRow" class="hidden">Spiller hos motstander <small>(valgfritt)</small>
        <input id="playedEventOpponentPlayer" type="text" placeholder="Navn eller draktnr" />
      </label>

      <div id="playedEventSubstitutionRows" class="substitutionFields hidden">
        <label>Spiller ut
          <select id="playedEventOutPlayer"></select>
        </label>
        <label>Spiller inn
          <select id="playedEventInPlayer"></select>
        </label>
      </div>

      <label id="playedEventDescriptionRow" class="hidden">Beskrivelse
        <textarea id="playedEventDescription" rows="3" placeholder="Hva skjedde?"></textarea>
      </label>

      <p id="playedEventAdminHint" class="dialogHint"></p>
      <p id="playedEventAdminError" class="dialogError"></p>
      <div class="dialogActions">
        <button id="playedEventAdminCancel" class="dialogSecondary" type="button">Avbryt</button>
        <button id="playedEventAdminSave" class="dialogPrimary" type="submit">Lagre hendelse</button>
      </div>
    </form>`;
  document.body.appendChild(dialog);

  document.getElementById("playedEventAdminClose").onclick = () => dialog.close();
  document.getElementById("playedEventAdminCancel").onclick = () => dialog.close();
  document.getElementById("playedEventType").addEventListener("change", updateDialogFields);
  document.getElementById("playedEventTeam").addEventListener("change", updateDialogFields);
  document.getElementById("playedEventAdminForm").addEventListener("submit", saveDialogEvent);
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}

function fillPlayerSelect(select, players, emptyLabel = "Velg spiller") {
  select.replaceChildren();
  const empty = document.createElement("option");
  empty.value = "";
  empty.textContent = emptyLabel;
  select.appendChild(empty);
  for (const player of players) {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = player.name;
    select.appendChild(option);
  }
}

function updateDialogFields() {
  const type = document.getElementById("playedEventType")?.value;
  const team = document.getElementById("playedEventTeam")?.value;
  if (!type || !team) return;

  const isNote = type === "note";
  const isSubstitution = type === "substitution";
  const needsPlayer = !isNote && !isSubstitution;

  document.getElementById("playedEventTeamRow").classList.toggle("hidden", isNote || isSubstitution);
  document.getElementById("playedEventPlayerRow").classList.toggle("hidden", !needsPlayer || team !== "home");
  document.getElementById("playedEventOpponentPlayerRow").classList.toggle("hidden", !needsPlayer || team !== "away");
  document.getElementById("playedEventSubstitutionRows").classList.toggle("hidden", !isSubstitution);
  document.getElementById("playedEventDescriptionRow").classList.toggle("hidden", !isNote);

  document.getElementById("playedEventAdminHint").textContent = isNote
    ? "Vanlige kampstatus-hendelser kan også korrigeres her."
    : "Endringen oppdaterer også Live-visningen dersom kampen ligger der.";
}

async function openEventDialog(matchId, eventIndex = null) {
  const ref = doc(db, "matches", matchId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;
  const match = { id: snap.id, ...snap.data() };
  if (String(match.status || "").toUpperCase() !== "ENDED") return;

  activeMatchId = matchId;
  activeEventIndex = Number.isInteger(eventIndex) ? eventIndex : null;
  const original = activeEventIndex == null ? null : match.events?.[activeEventIndex];

  const dialog = ensureDialog();
  const meta = match.meta || {};
  document.getElementById("playedEventAdminKicker").textContent = original ? "KORRIGERING" : "ETTERREGISTRERING";
  document.getElementById("playedEventAdminTitle").textContent = original ? "Rediger hendelse" : "Legg til hendelse";
  document.getElementById("playedEventAdminFixture").textContent = `${meta.ourTeam || "Samnanger"} – ${meta.opponent || "Motstander"}`;

  const teamSelect = document.getElementById("playedEventTeam");
  teamSelect.innerHTML = `
    <option value="home">${esc(meta.ourTeam || "Samnanger")}</option>
    <option value="away">${esc(meta.opponent || "Motstander")}</option>`;

  const players = playersForMatch(match);
  fillPlayerSelect(document.getElementById("playedEventPlayer"), players);
  fillPlayerSelect(document.getElementById("playedEventOutPlayer"), players, "Velg spiller ut");
  fillPlayerSelect(document.getElementById("playedEventInPlayer"), players, "Velg spiller inn");

  const type = eventFormType(original);
  document.getElementById("playedEventType").value = type;
  teamSelect.value = original?.team === "away" ? "away" : "home";
  document.getElementById("playedEventMinute").value = minuteTextForEvent(original);
  document.getElementById("playedEventOpponentPlayer").value = original?.team === "away" ? (original.playerName || "") : "";
  document.getElementById("playedEventDescription").value = original ? editableDescription(original) : "";
  document.getElementById("playedEventAdminError").textContent = "";

  const playerSelect = document.getElementById("playedEventPlayer");
  if (original?.team !== "away" && original?.playerName) ensureOptionByName(playerSelect, original.playerName);
  if (original?.outPlayerName) ensureOptionByName(document.getElementById("playedEventOutPlayer"), original.outPlayerName);
  if (original?.inPlayerName) ensureOptionByName(document.getElementById("playedEventInPlayer"), original.inPlayerName);

  document.getElementById("playedEventAdminSave").textContent = original ? "Lagre endring" : "Lagre hendelse";
  updateDialogFields();
  dialog.showModal();
}

function eventText({ type, team, minuteText, playerName, opponent, outPlayerName, inPlayerName, description }) {
  if (type === "goal") return `⚽ ${minuteText} – ${playerName}${team === "away" ? ` (${opponent})` : ""}`;
  if (type === "yellow" || type === "red") {
    const icon = type === "red" ? "🟥" : "🟨";
    return `${icon} ${minuteText} – ${playerName}${team === "away" ? ` (${opponent})` : ""}`;
  }
  if (type === "substitution") return `🔄 ${minuteText} – ${outPlayerName} ut, ${inPlayerName} inn`;
  return description;
}

function goalContribution(event) {
  if (event?.type !== "goal") return { our: 0, their: 0 };
  return event.team === "away" ? { our: 0, their: 1 } : { our: 1, their: 0 };
}

function scoreAfterChange(score, previousEvent, nextEvent) {
  const next = {
    our: Number(score?.our) || 0,
    their: Number(score?.their) || 0
  };
  const before = goalContribution(previousEvent);
  const after = goalContribution(nextEvent);
  next.our = Math.max(0, next.our - before.our + after.our);
  next.their = Math.max(0, next.their - before.their + after.their);
  return next;
}

function eventAffectsPlayingTime(event) {
  if (!event) return false;
  if (event.type === "substitution" || event.type === "sub") return true;
  return event.type === "card" && event.team === "home" && event.cardType === "red";
}

function normalizePublicEventType(event) {
  if (event?.type === "yellow" || event?.type === "red" || event?.type === "card") return "card";
  if (event?.type === "sub") return "substitution";
  if (event?.type === "note") return "text";
  return event?.type || "text";
}

function buildPublicEvents(match) {
  const halfLength = Number(match?.meta?.halfLengthMin) || 35;
  return (Array.isArray(match?.events) ? match.events : []).map(event => {
    const minuteNumber = parseMatchMinute(event?.minute);
    const timeMs = Number.isFinite(Number(event?.timeMs))
      ? Number(event.timeMs)
      : minuteNumber == null ? 0 : Math.max(0, minuteNumber - 1) * 60000;
    return {
      id: String(event?.id || ""),
      type: normalizePublicEventType(event),
      team: event?.team || "",
      playerName: event?.playerName || "",
      minute: event?.minute ?? "",
      period: Number(event?.period) || (minuteNumber != null && minuteNumber > halfLength ? 2 : 1),
      timeMs,
      rawText: event?.rawText || stripClockPrefix(event?.text || ""),
      createdClock: event?.createdClock || "",
      reportedAt: event?.reportedAt || event?.addedAt || event?.editedAt || "",
      edited: event?.edited === true,
      cardType: event?.cardType || "",
      outPlayerName: event?.outPlayerName || "",
      inPlayerName: event?.inPlayerName || ""
    };
  });
}

async function syncPublicMatch(matchId, match) {
  const publicRef = doc(db, "publicMatches", matchId);
  const featuredRef = doc(db, "publicMatches", "samnanger-g14-live");
  try {
    const [publicSnap, featuredSnap] = await Promise.all([getDoc(publicRef), getDoc(featuredRef)]);
    if (!publicSnap.exists() && match?.liveSharingEnabled !== true) return;

    const publicData = {
      status: match.status || "ENDED",
      period: Number(match.period) || 1,
      score: {
        our: Number(match?.score?.our) || 0,
        their: Number(match?.score?.their) || 0
      },
      meta: {
        ourTeam: match?.meta?.ourTeam || "Samnanger",
        opponent: match?.meta?.opponent || "Motstander",
        date: match?.meta?.date || "",
        startTime: match?.meta?.startTime || match?.meta?.time || "",
        venue: match?.meta?.venue || match?.meta?.venueType || "home",
        type: match?.meta?.type || "league",
        halfLengthMin: Number(match?.meta?.halfLengthMin) || 35
      },
      events: buildPublicEvents(match),
      updatedAt: serverTimestamp()
    };

    const writes = [setDoc(publicRef, publicData, { merge: true })];
    if (featuredSnap.exists() && featuredSnap.data()?.sourceMatchId === matchId) {
      writes.push(setDoc(featuredRef, { ...publicData, sourceMatchId: matchId }, { merge: true }));
    }
    await Promise.all(writes);
  } catch (error) {
    console.error("Kunne ikke oppdatere Live-visningen etter hendelsesendring:", error);
  }
}

function buildEventFromForm(match, original) {
  const type = document.getElementById("playedEventType").value;
  const team = document.getElementById("playedEventTeam").value;
  const minuteText = document.getElementById("playedEventMinute").value.trim();
  const minuteNumber = parseMatchMinute(minuteText);
  const description = document.getElementById("playedEventDescription").value.trim();
  const errorEl = document.getElementById("playedEventAdminError");

  if (type !== "note" && (minuteNumber == null || minuteNumber < 1)) {
    errorEl.textContent = "Skriv inn et gyldig kampminutt.";
    return null;
  }
  if (type === "note" && !description) {
    errorEl.textContent = "Skriv en beskrivelse av hendelsen.";
    return null;
  }

  let playerId = null;
  let playerName = "";
  let outPlayerId = "";
  let outPlayerName = "";
  let inPlayerId = "";
  let inPlayerName = "";

  if (type === "goal" || type === "yellow" || type === "red") {
    if (team === "home") {
      const select = document.getElementById("playedEventPlayer");
      playerId = select.value || null;
      playerName = select.options[select.selectedIndex]?.textContent || "";
      if (!playerId) {
        errorEl.textContent = "Velg spiller.";
        return null;
      }
    } else {
      playerName = document.getElementById("playedEventOpponentPlayer").value.trim() || "Ukjent spiller";
    }
  }

  if (type === "substitution") {
    const outSelect = document.getElementById("playedEventOutPlayer");
    const inSelect = document.getElementById("playedEventInPlayer");
    outPlayerId = outSelect.value || "";
    inPlayerId = inSelect.value || "";
    outPlayerName = outSelect.options[outSelect.selectedIndex]?.textContent || "";
    inPlayerName = inSelect.options[inSelect.selectedIndex]?.textContent || "";
    if (!outSelect.value || !inSelect.value) {
      errorEl.textContent = "Velg både spiller ut og spiller inn.";
      return null;
    }
    if (outSelect.value === inSelect.value) {
      errorEl.textContent = "Spiller ut og spiller inn må være forskjellige.";
      return null;
    }
  }

  const halfLength = Number(match?.meta?.halfLengthMin) || 35;
  const renderedText = eventText({
    type,
    team,
    minuteText,
    playerName,
    opponent: match?.meta?.opponent || "Motstander",
    outPlayerName,
    inPlayerName,
    description
  });
  const now = new Date().toISOString();
  const next = {
    ...(original || {}),
    id: String(original?.id || `post-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    type: type === "yellow" || type === "red" ? "card" : type === "note" ? "text" : type,
    team: type === "note" ? null : type === "substitution" ? "home" : team,
    minute: type === "note" && !minuteText ? null : minuteText,
    timeMs: minuteNumber == null ? null : Math.max(0, minuteNumber - 1) * 60000,
    period: minuteNumber == null ? (Number(original?.period) || 1) : (minuteNumber > halfLength ? 2 : 1),
    playerId: type === "goal" || type === "yellow" || type === "red" ? playerId : null,
    playerName: type === "goal" || type === "yellow" || type === "red" ? playerName : null,
    outPlayerId: type === "substitution" ? outPlayerId : "",
    outPlayerName: type === "substitution" ? outPlayerName : "",
    inPlayerId: type === "substitution" ? inPlayerId : "",
    inPlayerName: type === "substitution" ? inPlayerName : "",
    cardType: type === "yellow" || type === "red" ? type : "",
    rawText: renderedText,
    text: renderedText
  };

  if (original) {
    next.edited = true;
    next.editedAt = now;
  } else {
    next.addedAfterMatch = true;
    next.addedAt = now;
    next.reportedAt = now;
  }
  return next;
}

async function saveDialogEvent(event) {
  event.preventDefault();
  const saveBtn = document.getElementById("playedEventAdminSave");
  const errorEl = document.getElementById("playedEventAdminError");
  errorEl.textContent = "";
  if (!activeMatchId) return;

  saveBtn.disabled = true;
  saveBtn.textContent = "Lagrer…";
  try {
    const ref = doc(db, "matches", activeMatchId);
    const snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Kampen finnes ikke lenger.");
    const fresh = { id: snap.id, ...snap.data() };
    if (String(fresh.status || "").toUpperCase() !== "ENDED") throw new Error("Bare ferdigspilte kamper kan korrigeres her.");

    const events = [...(Array.isArray(fresh.events) ? fresh.events : [])];
    const original = activeEventIndex == null ? null : events[activeEventIndex];
    if (activeEventIndex != null && !original) throw new Error("Hendelsen ble endret et annet sted. Åpne siden på nytt.");

    const nextEvent = buildEventFromForm(fresh, original);
    if (!nextEvent) return;

    if (activeEventIndex == null) events.push(nextEvent);
    else events[activeEventIndex] = nextEvent;

    const nextScore = scoreAfterChange(fresh.score, original, nextEvent);
    const nextMatch = {
      ...fresh,
      events,
      score: nextScore,
      result: `${nextScore.our}-${nextScore.their}`
    };

    await updateDoc(ref, {
      events,
      score: nextScore,
      result: nextMatch.result,
      updatedAt: serverTimestamp()
    });

    if (eventAffectsPlayingTime(original) || eventAffectsPlayingTime(nextEvent)) {
      await recalculateMatchPlayingTime(activeMatchId, { force: true });
    }
    await syncPublicMatch(activeMatchId, nextMatch);

    ensureDialog().close();
    reopenPlayedMatch(activeMatchId);
  } catch (error) {
    console.error(error);
    errorEl.textContent = error.message || "Kunne ikke lagre hendelsen.";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = activeEventIndex == null ? "Lagre hendelse" : "Lagre endring";
  }
}

async function resolveEventFromRow(row) {
  const panel = row.closest(".eventsPanel");
  if (!panel?.id?.startsWith("events-")) return null;
  const matchId = panel.id.slice("events-".length);
  const visibleRows = [...panel.querySelectorAll(".eventRow")];
  const visibleIndex = visibleRows.indexOf(row);
  if (visibleIndex < 0) return null;

  const snap = await getDoc(doc(db, "matches", matchId));
  if (!snap.exists()) return null;
  const match = { id: snap.id, ...snap.data() };
  const entry = sortedEventEntries(match.events)[visibleIndex];
  if (!entry) return null;
  return { match, matchId, event: entry.event, eventIndex: entry.index };
}

async function deleteEventFromRow(row) {
  const resolved = await resolveEventFromRow(row);
  if (!resolved) return;
  const { match, matchId, event, eventIndex } = resolved;
  const label = stripClockPrefix(event?.text || event?.rawText || "hendelsen");
  if (!window.confirm(`Slette denne hendelsen?\n\n${label}`)) return;

  const events = [...(Array.isArray(match.events) ? match.events : [])];
  events.splice(eventIndex, 1);
  const nextScore = scoreAfterChange(match.score, event, null);
  const nextMatch = {
    ...match,
    events,
    score: nextScore,
    result: `${nextScore.our}-${nextScore.their}`
  };

  await updateDoc(doc(db, "matches", matchId), {
    events,
    score: nextScore,
    result: nextMatch.result,
    updatedAt: serverTimestamp()
  });

  if (eventAffectsPlayingTime(event)) {
    await recalculateMatchPlayingTime(matchId, { force: true });
  }
  await syncPublicMatch(matchId, nextMatch);
  reopenPlayedMatch(matchId);
}

function reopenPlayedMatch(matchId) {
  const url = new URL(window.location.href);
  url.searchParams.set("view", "played");
  url.searchParams.set("matchId", matchId);
  window.location.href = url.toString();
}

function enhanceRows() {
  document.querySelectorAll(".eventsPanel .eventRow").forEach(row => {
    if (row.dataset.eventAdminReady === "1") return;
    row.dataset.eventAdminReady = "1";
    row.classList.add("eventAdminReady");

    const actions = document.createElement("span");
    actions.className = "eventAdminActions";
    actions.innerHTML = `
      <button class="eventAdminBtn edit" type="button" data-event-edit aria-label="Rediger hendelse" title="Rediger hendelse">✎</button>
      <button class="eventAdminBtn delete" type="button" data-event-delete aria-label="Slett hendelse" title="Slett hendelse">×</button>`;
    row.appendChild(actions);
  });
}

const observer = new MutationObserver(enhanceRows);
observer.observe(document.getElementById("content"), { childList: true, subtree: true });

// Fang "Legg til hendelse" før den eldre handleren på knappen får kjøre.
document.addEventListener("click", async event => {
  const addButton = event.target.closest("[data-add-event]");
  if (addButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    await openEventDialog(addButton.dataset.addEvent, null);
    return;
  }

  const editButton = event.target.closest("[data-event-edit]");
  if (editButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const row = editButton.closest(".eventRow");
    const resolved = row ? await resolveEventFromRow(row) : null;
    if (resolved) await openEventDialog(resolved.matchId, resolved.eventIndex);
    return;
  }

  const deleteButton = event.target.closest("[data-event-delete]");
  if (deleteButton) {
    event.preventDefault();
    event.stopImmediatePropagation();
    const row = deleteButton.closest(".eventRow");
    if (row) await deleteEventFromRow(row);
  }
}, true);

installStyles();
enhanceRows();
