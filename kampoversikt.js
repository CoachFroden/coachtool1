import { auth, db } from "./firebase-refleksjon.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const content = document.getElementById("content");
const pageTitle = document.getElementById("pageTitle");
const upcomingTab = document.getElementById("upcomingTab");
const playedTab = document.getElementById("playedTab");
const backBtn = document.getElementById("backBtn");
const logoutBtn = document.getElementById("logoutBtn");
const errorMsg = document.getElementById("errorMsg");

const params = new URLSearchParams(window.location.search);
let matches = [];
let currentView = params.get("view") === "played" ? "played" : "upcoming";
const requestedMatchId = params.get("matchId");
let currentUser = null;
let currentRole = null;
let editingMatchId = null;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function matchTimeValue(match) {
  const date = match?.meta?.date;
  if (!date) return Number.POSITIVE_INFINITY;
  const time = match?.meta?.time || match?.meta?.startTime || "00:00";
  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? Number.POSITIVE_INFINITY : parsed.getTime();
}

function formatDate(dateString) {
  if (!dateString) return "Dato ikke satt";
  const d = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateString;
  return new Intl.DateTimeFormat("no-NO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric"
  }).format(d);
}

function venueLabel(meta = {}) {
  const venue = meta.venueType || meta.venue;
  const base = venue === "home" ? "Hjemme" : venue === "away" ? "Borte" : "Sted ikke satt";
  return meta.venueName ? `${base} · ${meta.venueName}` : base;
}

function typeLabel(type) {
  if (type === "league" || type === "Seriekamp") return "Seriekamp";
  if (type === "cup" || type === "Cupkamp") return "Cupkamp";
  if (type === "friendly" || type === "Treningskamp") return "Treningskamp";
  return "Kamp";
}

function eventDisplayText(event) {
  if (event?.text) return String(event.text);
  if (event?.rawText) return String(event.rawText);
  const minute = event?.minute ? `${event.minute} – ` : "";
  if (event?.type === "substitution") {
    return `🔄 ${minute}${event.outPlayerName || "Ukjent"} ut, ${event.inPlayerName || "Ukjent"} inn`;
  }
  if (event?.type === "goal") {
    return `⚽ ${minute}${event.playerName || "Ukjent spiller"}`;
  }
  if (event?.type === "card") {
    const icon = event.cardType === "red" ? "🟥" : "🟨";
    return `${icon} ${minute}${event.playerName || "Ukjent spiller"}`;
  }
  return "Hendelse";
}

function eventMinute(event) {
  if (event?.minute) return `${event.minute}'`;
  const ms = Number(event?.timeMs);
  if (Number.isFinite(ms) && ms >= 0) return `${Math.max(1, Math.ceil(ms / 60000))}'`;
  return "";
}

function eventSortValue(event) {
  const ms = Number(event?.timeMs);
  if (Number.isFinite(ms)) return ms;
  const minute = parseMatchMinute(event?.minute);
  return minute == null ? Number.MAX_SAFE_INTEGER : minute * 60000;
}

function renderEvents(match) {
  const events = Array.isArray(match?.events) ? [...match.events] : [];
  events.sort((a, b) => eventSortValue(a) - eventSortValue(b));
  if (!events.length) return `<div class="noEvents">Ingen registrerte hendelser i denne kampen.</div>`;
  return events.map(event => `
    <div class="eventRow${event?.addedAfterMatch ? " postMatchEvent" : ""}">
      <span class="eventMinute">${esc(eventMinute(event))}</span>
      <span class="eventText">${esc(eventDisplayText(event))}${event?.addedAfterMatch ? '<small class="postMatchBadge">Lagt til etter kamp</small>' : ""}</span>
    </div>`).join("");
}

function renderUpcoming() {
  const rows = matches
    .filter(m => String(m.status || "").toUpperCase() !== "ENDED")
    .sort((a, b) => matchTimeValue(a) - matchTimeValue(b));

  pageTitle.textContent = "Kommende kamper";
  upcomingTab.classList.add("active");
  playedTab.classList.remove("active");

  if (!rows.length) {
    content.innerHTML = `<div class="empty">Ingen kommende kamper.</div>`;
    return;
  }

  content.innerHTML = rows.map(m => {
    const meta = m.meta || {};
    return `<article class="matchCard">
      <div class="matchTop">
        <div class="matchTitle">
          <span class="matchType">${esc(typeLabel(meta.type))}</span>
          <h2>${esc(meta.opponent || "Ukjent motstander")}</h2>
          <p>${esc(formatDate(meta.date))}${meta.time || meta.startTime ? ` · kl. ${esc(meta.time || meta.startTime)}` : ""}<br>${esc(venueLabel(meta))}</p>
        </div>
      </div>
      <div class="actions">
        <button class="lineup" type="button" data-action="lineup" data-id="${esc(m.id)}">Lagoppstilling</button>
        <button class="start" type="button" data-action="start" data-id="${esc(m.id)}">Start kamp</button>
      </div>
    </article>`;
  }).join("");

  content.querySelectorAll("button[data-action]").forEach(button => {
    button.addEventListener("click", () => {
      const id = encodeURIComponent(button.dataset.id);
      window.location.href = button.dataset.action === "lineup"
        ? `kamper.html?matchId=${id}&openLineup=true`
        : `kamp.html?matchId=${id}`;
    });
  });
}

function renderPlayed() {
  const rows = matches
    .filter(m => String(m.status || "").toUpperCase() === "ENDED")
    .sort((a, b) => matchTimeValue(b) - matchTimeValue(a));

  pageTitle.textContent = "Spilte kamper";
  playedTab.classList.add("active");
  upcomingTab.classList.remove("active");

  if (!rows.length) {
    content.innerHTML = `<div class="empty">Ingen spilte kamper funnet.</div>`;
    return;
  }

  content.innerHTML = rows.map(m => {
    const meta = m.meta || {};
    const our = Number.isFinite(m?.score?.our) ? m.score.our : "–";
    const their = Number.isFinite(m?.score?.their) ? m.score.their : "–";
    let scoreClass = "draw";
    if (Number.isFinite(m?.score?.our) && Number.isFinite(m?.score?.their)) {
      scoreClass = m.score.our > m.score.their ? "win" : m.score.our < m.score.their ? "loss" : "draw";
    }
    const count = Array.isArray(m.events) ? m.events.length : 0;
    const open = requestedMatchId === m.id;
    return `<article class="matchCard" id="match-${esc(m.id)}">
      <div class="matchTop">
        <div class="matchTitle">
          <span class="matchType">${esc(typeLabel(meta.type))}</span>
          <h2>${esc(meta.opponent || "Ukjent motstander")}</h2>
          <p>${esc(formatDate(meta.date))}${meta.time || meta.startTime ? ` · kl. ${esc(meta.time || meta.startTime)}` : ""}<br>${esc(venueLabel(meta))}</p>
        </div>
        <div class="score ${scoreClass}">${esc(our)}–${esc(their)}</div>
      </div>
      <div class="postMatchActions">
        <button class="shareResultBtn" type="button" data-share-match="${esc(m.id)}">↗ Del resultat</button>
        <button class="addEventBtn" type="button" data-add-event="${esc(m.id)}">＋ Legg til hendelse</button>
      </div>
      <button class="eventsToggle" type="button" data-events="${esc(m.id)}" aria-expanded="${open ? "true" : "false"}">
        <span>Hendelser</span><span>${count} ${open ? "⌃" : "⌄"}</span>
      </button>
      <div class="eventsPanel" id="events-${esc(m.id)}" ${open ? "" : "hidden"}>${renderEvents(m)}</div>
    </article>`;
  }).join("");

  content.querySelectorAll(".eventsToggle").forEach(button => {
    button.addEventListener("click", () => {
      const panel = document.getElementById(`events-${button.dataset.events}`);
      if (!panel) return;
      const willOpen = panel.hidden;
      panel.hidden = !willOpen;
      button.setAttribute("aria-expanded", String(willOpen));
      const count = panel.querySelectorAll(".eventRow").length;
      button.lastElementChild.textContent = `${count} ${willOpen ? "⌃" : "⌄"}`;
    });
  });

  content.querySelectorAll("[data-share-match]").forEach(button => {
    button.addEventListener("click", () => {
      const match = matches.find(m => m.id === button.dataset.shareMatch);
      if (match) shareMatchResult(match, button);
    });
  });

  content.querySelectorAll("[data-add-event]").forEach(button => {
    button.addEventListener("click", () => {
      const match = matches.find(m => m.id === button.dataset.addEvent);
      if (match) openAddEventDialog(match);
    });
  });

  if (requestedMatchId) {
    document.getElementById(`match-${requestedMatchId}`)?.scrollIntoView({ block: "start" });
  }
}

function setView(view) {
  currentView = view;
  const url = new URL(window.location.href);
  url.searchParams.set("view", view);
  window.history.replaceState({}, "", url);
  if (view === "played") renderPlayed();
  else renderUpcoming();
}

function cleanShareEventText(event) {
  let text = eventDisplayText(event).trim();
  text = text.replace(/^\d{1,2}:\d{2}\s*[–-]\s*/, "");
  return text;
}

function buildMatchShareText(match) {
  const meta = match.meta || {};
  const ourTeam = meta.ourTeam || "Samnanger";
  const opponent = meta.opponent || "Motstander";
  const our = Number.isFinite(match?.score?.our) ? match.score.our : "–";
  const their = Number.isFinite(match?.score?.their) ? match.score.their : "–";
  const lines = [
    "Kampresultat",
    `${ourTeam} ${our}–${their} ${opponent}`,
    formatDate(meta.date),
    "",
    "Hendelser:"
  ];

  const events = Array.isArray(match.events) ? [...match.events] : [];
  events.sort((a, b) => eventSortValue(a) - eventSortValue(b));
  if (!events.length) {
    lines.push("Ingen registrerte hendelser.");
  } else {
    for (const event of events) {
      const minute = eventMinute(event);
      lines.push(`${minute ? `${minute} ` : ""}${cleanShareEventText(event)}`.trim());
    }
  }
  return lines.join("\n");
}

async function shareMatchResult(match, button) {
  const originalText = button.textContent;
  const text = buildMatchShareText(match);
  try {
    if (navigator.share) {
      await navigator.share({ title: "Kampresultat", text });
      button.textContent = "✓ Delt";
    } else if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      button.textContent = "✓ Kopiert";
    } else {
      throw new Error("Deling støttes ikke i denne nettleseren.");
    }
  } catch (error) {
    if (error?.name !== "AbortError") {
      console.error(error);
      showPageMessage("Kunne ikke dele kampresultatet.", true);
    }
  } finally {
    setTimeout(() => { button.textContent = originalText; }, 1800);
  }
}

function ensureAddEventDialog() {
  let dialog = document.getElementById("addPostMatchEventDialog");
  if (dialog) return dialog;

  dialog = document.createElement("dialog");
  dialog.id = "addPostMatchEventDialog";
  dialog.className = "postMatchDialog";
  dialog.innerHTML = `
    <form id="postMatchEventForm" class="postMatchForm" method="dialog">
      <div class="dialogHeader">
        <div>
          <span class="dialogKicker">ETTERREGISTRERING</span>
          <h2>Legg til hendelse</h2>
          <p id="postMatchFixture"></p>
        </div>
        <button id="closePostMatchDialog" class="dialogClose" type="button" aria-label="Lukk">×</button>
      </div>

      <label>Hendelse
        <select id="postEventType">
          <option value="goal">Mål</option>
          <option value="yellow">Gult kort</option>
          <option value="red">Rødt kort</option>
          <option value="note">Annen hendelse</option>
        </select>
      </label>

      <label id="postTeamRow">Lag
        <select id="postEventTeam"></select>
      </label>

      <label id="postMinuteRow">Kampminutt
        <input id="postEventMinute" type="text" inputmode="numeric" placeholder="f.eks. 42 eller 70 + 2" />
      </label>

      <label id="postHomePlayerRow">Spiller
        <select id="postEventPlayer"></select>
      </label>

      <label id="postAwayPlayerRow" class="hidden">Spiller hos motstander <small>(valgfritt)</small>
        <input id="postOpponentPlayer" type="text" placeholder="Navn eller draktnr" />
      </label>

      <label id="postDescriptionRow" class="hidden">Beskrivelse
        <textarea id="postEventDescription" rows="3" placeholder="Hva skjedde?"></textarea>
      </label>

      <p id="postEventError" class="dialogError"></p>
      <div class="dialogActions">
        <button id="cancelPostEventBtn" class="dialogSecondary" type="button">Avbryt</button>
        <button id="savePostEventBtn" class="dialogPrimary" type="submit">Lagre hendelse</button>
      </div>
    </form>`;
  document.body.appendChild(dialog);

  document.getElementById("closePostMatchDialog").addEventListener("click", () => dialog.close());
  document.getElementById("cancelPostEventBtn").addEventListener("click", () => dialog.close());
  document.getElementById("postEventType").addEventListener("change", updatePostEventForm);
  document.getElementById("postEventTeam").addEventListener("change", updatePostEventForm);
  document.getElementById("postMatchEventForm").addEventListener("submit", savePostMatchEvent);
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}

function playersForMatch(match) {
  const candidates = [];
  if (match?.players?.home && typeof match.players.home === "object") {
    candidates.push(...Object.values(match.players.home));
  } else if (match?.players && !Array.isArray(match.players) && typeof match.players === "object") {
    candidates.push(...Object.values(match.players));
  }
  if (!candidates.length && Array.isArray(match?.playingTime)) {
    candidates.push(...match.playingTime);
  }
  if (!candidates.length && Array.isArray(match?.squad?.present)) {
    candidates.push(...match.squad.present);
  }

  const unique = new Map();
  for (const player of candidates) {
    if (!player?.name) continue;
    const id = String(player.id || player.playerId || player.name);
    if (!unique.has(id)) unique.set(id, { id, name: player.name });
  }
  return [...unique.values()].sort((a, b) => a.name.localeCompare(b.name, "no"));
}

function openAddEventDialog(match) {
  editingMatchId = match.id;
  const dialog = ensureAddEventDialog();
  const meta = match.meta || {};
  document.getElementById("postMatchFixture").textContent = `${meta.ourTeam || "Samnanger"} – ${meta.opponent || "Motstander"}`;

  const teamSelect = document.getElementById("postEventTeam");
  teamSelect.innerHTML = `
    <option value="home">${esc(meta.ourTeam || "Samnanger")}</option>
    <option value="away">${esc(meta.opponent || "Motstander")}</option>`;

  const playerSelect = document.getElementById("postEventPlayer");
  playerSelect.innerHTML = '<option value="">Velg spiller</option>';
  for (const player of playersForMatch(match)) {
    const option = document.createElement("option");
    option.value = player.id;
    option.textContent = player.name;
    playerSelect.appendChild(option);
  }

  document.getElementById("postEventType").value = "goal";
  teamSelect.value = "home";
  document.getElementById("postEventMinute").value = "";
  document.getElementById("postOpponentPlayer").value = "";
  document.getElementById("postEventDescription").value = "";
  document.getElementById("postEventError").textContent = "";
  updatePostEventForm();
  dialog.showModal();
}

function updatePostEventForm() {
  const type = document.getElementById("postEventType")?.value;
  const team = document.getElementById("postEventTeam")?.value;
  if (!type || !team) return;
  const isNote = type === "note";
  document.getElementById("postTeamRow").classList.toggle("hidden", isNote);
  document.getElementById("postHomePlayerRow").classList.toggle("hidden", isNote || team !== "home");
  document.getElementById("postAwayPlayerRow").classList.toggle("hidden", isNote || team !== "away");
  document.getElementById("postDescriptionRow").classList.toggle("hidden", !isNote);
}

function parseMatchMinute(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const plus = text.match(/^(\d+)\s*\+\s*(\d+)$/);
  if (plus) return Number(plus[1]) + Number(plus[2]);
  if (/^\d+$/.test(text)) return Number(text);
  return null;
}

function eventTextForPostMatch({ type, team, minuteText, playerName, description, opponent }) {
  if (type === "goal") {
    return `⚽ ${minuteText} – ${playerName}${team === "away" ? ` (${opponent})` : ""}`;
  }
  if (type === "yellow" || type === "red") {
    const icon = type === "red" ? "🟥" : "🟨";
    return `${icon} ${minuteText} – ${playerName}${team === "away" ? ` (${opponent})` : ""}`;
  }
  return `📝 ${description}`;
}

async function savePostMatchEvent(event) {
  event.preventDefault();
  const errorEl = document.getElementById("postEventError");
  const saveBtn = document.getElementById("savePostEventBtn");
  errorEl.textContent = "";

  const match = matches.find(m => m.id === editingMatchId);
  if (!match) {
    errorEl.textContent = "Fant ikke kampen.";
    return;
  }

  const type = document.getElementById("postEventType").value;
  const team = document.getElementById("postEventTeam").value;
  const minuteText = document.getElementById("postEventMinute").value.trim();
  const minuteNumber = parseMatchMinute(minuteText);
  const description = document.getElementById("postEventDescription").value.trim();

  if (type !== "note" && (minuteNumber == null || minuteNumber < 1)) {
    errorEl.textContent = "Skriv inn et gyldig kampminutt.";
    return;
  }
  if (type === "note" && !description) {
    errorEl.textContent = "Skriv en beskrivelse av hendelsen.";
    return;
  }

  let playerId = null;
  let playerName = "";
  if (type !== "note" && team === "home") {
    const playerSelect = document.getElementById("postEventPlayer");
    playerId = playerSelect.value || null;
    playerName = playerSelect.options[playerSelect.selectedIndex]?.textContent || "";
    if (!playerId) {
      errorEl.textContent = "Velg spiller.";
      return;
    }
  } else if (type !== "note") {
    playerName = document.getElementById("postOpponentPlayer").value.trim() || "Ukjent spiller";
  }

  saveBtn.disabled = true;
  saveBtn.textContent = "Lagrer…";

  try {
    const ref = doc(db, "matches", match.id);
    const freshSnap = await getDoc(ref);
    if (!freshSnap.exists()) throw new Error("Kampen finnes ikke lenger.");
    const fresh = { id: freshSnap.id, ...freshSnap.data() };
    if (String(fresh.status || "").toUpperCase() !== "ENDED") {
      throw new Error("Etterregistrering kan bare gjøres på ferdigspilte kamper.");
    }

    const meta = fresh.meta || {};
    const newEvent = {
      type: type === "yellow" || type === "red" ? "card" : type === "note" ? "text" : "goal",
      team: type === "note" ? null : team,
      minute: type === "note" ? null : minuteText,
      timeMs: type === "note" ? null : minuteNumber * 60000,
      playerId: type === "note" ? null : playerId,
      playerName: type === "note" ? null : playerName,
      text: eventTextForPostMatch({
        type,
        team,
        minuteText,
        playerName,
        description,
        opponent: meta.opponent || "Motstander"
      }),
      rawText: type === "note" ? description : null,
      addedAfterMatch: true,
      addedAt: new Date().toISOString(),
      addedBy: currentUser?.uid || null
    };
    if (type === "yellow" || type === "red") newEvent.cardType = type;

    const nextEvents = [...(Array.isArray(fresh.events) ? fresh.events : []), newEvent];
    const updates = {
      events: nextEvents,
      updatedAt: serverTimestamp()
    };

    if (type === "goal") {
      const nextScore = {
        our: Number(fresh?.score?.our || 0),
        their: Number(fresh?.score?.their || 0)
      };
      if (team === "home") nextScore.our += 1;
      else nextScore.their += 1;
      updates.score = nextScore;
      updates.result = `${nextScore.our}-${nextScore.their}`;
    }

    await updateDoc(ref, updates);

    const index = matches.findIndex(m => m.id === match.id);
    if (index >= 0) {
      matches[index] = {
        ...fresh,
        events: nextEvents,
        score: updates.score || fresh.score,
        result: updates.result || fresh.result
      };
    }

    document.getElementById("addPostMatchEventDialog").close();
    showPageMessage(type === "goal" ? "Målet er lagt til og resultatet er oppdatert." : "Hendelsen er lagt til.");
    renderPlayed();
    document.getElementById(`events-${match.id}`)?.removeAttribute("hidden");
    document.getElementById(`match-${match.id}`)?.scrollIntoView({ block: "center", behavior: "smooth" });
  } catch (error) {
    console.error(error);
    errorEl.textContent = error.message || "Kunne ikke lagre hendelsen.";
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Lagre hendelse";
  }
}

function showPageMessage(text, isError = false) {
  errorMsg.textContent = text;
  errorMsg.classList.toggle("success", !isError);
  errorMsg.classList.toggle("error", isError);
  clearTimeout(showPageMessage.timer);
  showPageMessage.timer = setTimeout(() => {
    errorMsg.textContent = "";
    errorMsg.classList.remove("success");
  }, 3500);
}

upcomingTab.addEventListener("click", () => setView("upcoming"));
playedTab.addEventListener("click", () => setView("played"));
backBtn.addEventListener("click", () => window.location.href = "oversikt.html");
logoutBtn.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  try {
    currentUser = user;
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const role = userSnap.exists() ? userSnap.data()?.role : null;
    currentRole = role;
    if (role !== "coach" && role !== "assistantCoach") {
      await signOut(auth);
      window.location.href = "index.html";
      return;
    }

    const snap = await getDocs(query(collection(db, "matches"), limit(100)));
    matches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    setView(currentView);
  } catch (error) {
    console.error(error);
    content.innerHTML = "";
    errorMsg.textContent = "Kunne ikke hente kampene. Prøv å laste siden på nytt.";
  }
});
