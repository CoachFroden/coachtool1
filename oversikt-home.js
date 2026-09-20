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

const DUPLICATE_START_CLEANUP_DATE = "2026-08-30";
const DUPLICATE_START_CLEANUP_OPPONENT = "bønes";

const els = {
  userLine: document.getElementById("userLine"),
  logoutBtn: document.getElementById("logoutBtn"),
  coachOnlyBtn: document.getElementById("coachOnlyBtn"),
  nextOpponent: document.getElementById("nextOpponent"),
  nextMeta: document.getElementById("nextMeta"),
  nextVenue: document.getElementById("nextVenue"),
  nextCountdown: document.getElementById("nextCountdown"),
  lineupBtn: document.getElementById("lineupBtn"),
  startMatchBtn: document.getElementById("startMatchBtn"),
  upcomingList: document.getElementById("upcomingList"),
  lastMatch: document.getElementById("lastMatch"),
  allMatchesBtn: document.getElementById("allMatchesBtn"),
  allPlayedBtn: document.getElementById("allPlayedBtn"),
  statsBtn: document.getElementById("statsBtn"),
  errorMsg: document.getElementById("errorMsg")
};

let nextMatch = null;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("no");
}

function isStartEvent(event) {
  const rawText = normalizeText(event?.rawText);
  if (rawText === "kamp startet") return true;

  if (event?.type && event.type !== "text") return false;

  const textWithoutClock = String(event?.text || "")
    .replace(/^\s*\d{1,2}:\d{2}\s*[–-]\s*/u, "")
    .trim();

  return normalizeText(textWithoutClock) === "kamp startet";
}

async function cleanupDuplicateStartEvents(matches) {
  const targets = matches.filter(match => {
    const date = String(match?.meta?.date || "");
    const opponent = normalizeText(match?.meta?.opponent);
    return date === DUPLICATE_START_CLEANUP_DATE && opponent.includes(DUPLICATE_START_CLEANUP_OPPONENT);
  });

  for (const match of targets) {
    const events = Array.isArray(match.events) ? match.events : [];
    const startIndexes = [];

    events.forEach((event, index) => {
      if (isStartEvent(event)) startIndexes.push(index);
    });

    if (startIndexes.length <= 1) continue;

    const keepIndex = startIndexes[startIndexes.length - 1];
    const cleanedEvents = events.filter((event, index) => {
      if (!isStartEvent(event)) return true;
      return index === keepIndex;
    });

    try {
      await updateDoc(doc(db, "matches", match.id), {
        events: cleanedEvents,
        updatedAt: serverTimestamp()
      });
      match.events = cleanedEvents;
      console.info(`Ryddet ${startIndexes.length - 1} duplikate kampstart-hendelser i ${match.id}`);
    } catch (error) {
      console.warn("Kunne ikke rydde duplikate kampstart-hendelser", error);
    }
  }
}

function dateValue(match) {
  const date = match?.meta?.date || "";
  const time = match?.meta?.time || "00:00";
  if (!date) return Number.POSITIVE_INFINITY;
  const d = new Date(`${date}T${time || "00:00"}:00`);
  return Number.isNaN(d.getTime()) ? Number.POSITIVE_INFINITY : d.getTime();
}

function formatDate(dateString) {
  if (!dateString) return "Dato ikke satt";
  const d = new Date(`${dateString}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateString;
  return new Intl.DateTimeFormat("no-NO", { weekday: "short", day: "numeric", month: "short" }).format(d);
}

function venueLabel(meta = {}) {
  const type = meta.venueType || meta.venue;
  const base = type === "home" ? "Hjemme" : type === "away" ? "Borte" : "Sted ikke satt";
  return meta.venueName ? `${base} · ${meta.venueName}` : base;
}

function typeLabel(type) {
  if (type === "league" || type === "Seriekamp") return "Seriekamp";
  if (type === "cup" || type === "Cupkamp") return "Cupkamp";
  if (type === "friendly" || type === "Treningskamp") return "Treningskamp";
  return "Kamp";
}

function countdown(match) {
  const when = dateValue(match);
  if (!Number.isFinite(when)) return "";
  const diff = when - Date.now();
  if (diff <= 0 && diff > -6 * 60 * 60 * 1000) return "Kampdag";
  const days = Math.ceil(diff / 86400000);
  if (days <= 0) return "I dag";
  if (days === 1) return "I morgen";
  return `Om ${days} dager`;
}

async function loadMatches() {
  const snap = await getDocs(query(collection(db, "matches"), limit(100)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

function renderNext(match) {
  nextMatch = match || null;
  if (!match) {
    els.nextOpponent.textContent = "Ingen kommende kamp";
    els.nextMeta.textContent = "Legg inn neste kamp for å få den her.";
    els.nextVenue.textContent = "";
    els.nextCountdown.textContent = "";
    els.lineupBtn.disabled = true;
    els.startMatchBtn.textContent = "Se kommende kamper";
    els.startMatchBtn.onclick = () => window.location.href = "kampoversikt.html?view=upcoming";
    return;
  }

  const meta = match.meta || {};
  els.nextOpponent.textContent = meta.opponent || "Ukjent motstander";
  els.nextMeta.textContent = `${typeLabel(meta.type)} · ${formatDate(meta.date)}${meta.time ? ` kl. ${meta.time}` : ""}`;
  els.nextVenue.textContent = venueLabel(meta);
  els.nextCountdown.textContent = countdown(match);
  els.lineupBtn.disabled = false;
  els.lineupBtn.onclick = () => window.location.href = `kamper.html?matchId=${encodeURIComponent(match.id)}&openLineup=true`;
  els.startMatchBtn.textContent = "Åpne kamp";
  els.startMatchBtn.onclick = () => window.location.href = `kamp.html?matchId=${encodeURIComponent(match.id)}`;
}

function renderUpcoming(matches) {
  const rows = matches.slice(0, 3);
  if (!rows.length) {
    els.upcomingList.innerHTML = `<div class="emptyState">Ingen kommende kamper.</div>`;
    return;
  }
  els.upcomingList.innerHTML = rows.map(m => {
    const meta = m.meta || {};
    const formatted = formatDate(meta.date).split(" ");
    return `<button class="matchRow" data-id="${esc(m.id)}" type="button">
      <span class="dateBadge"><strong>${esc(formatted.slice(1,2).join(""))}</strong><small>${esc(formatted.slice(2).join(" "))}</small></span>
      <span class="matchRowMain"><strong>${esc(meta.opponent || "Ukjent motstander")}</strong><small>${esc(venueLabel(meta))}${meta.time ? ` · ${esc(meta.time)}` : ""}</small></span>
      <span class="chevron">›</span>
    </button>`;
  }).join("");

  els.upcomingList.querySelectorAll(".matchRow").forEach(btn => {
    btn.addEventListener("click", () => {
      window.location.href = `kamper.html?matchId=${encodeURIComponent(btn.dataset.id)}&openLineup=true`;
    });
  });
}

function renderLast(match) {
  if (!match) {
    els.lastMatch.innerHTML = `<div class="emptyState">Ingen ferdigspilte kamper funnet.</div>`;
    return;
  }
  const meta = match.meta || {};
  const our = Number.isFinite(match?.score?.our) ? match.score.our : "–";
  const their = Number.isFinite(match?.score?.their) ? match.score.their : "–";
  const resultClass = Number(our) > Number(their) ? "win" : Number(our) < Number(their) ? "loss" : "draw";
  els.lastMatch.innerHTML = `<button class="lastMatchCard" type="button" id="lastMatchOpen">
    <div><span class="sectionEyebrow">${esc(formatDate(meta.date))}</span><h3>${esc(meta.opponent || "Ukjent motstander")}</h3><p>${esc(venueLabel(meta))}</p></div>
    <div class="score ${resultClass}">${esc(our)}<span>–</span>${esc(their)}</div>
  </button>`;
  document.getElementById("lastMatchOpen")?.addEventListener("click", () => {
    window.location.href = `kampoversikt.html?view=played&matchId=${encodeURIComponent(match.id)}`;
  });
}

async function initForUser(user) {
  els.userLine.textContent = user.email || "Innlogget";
  const userSnap = await getDoc(doc(db, "users", user.uid));
  const role = userSnap.exists() ? userSnap.data()?.role : null;
  if (role !== "coach" && role !== "assistantCoach") {
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

  if (role === "coach") {
    els.coachOnlyBtn.hidden = false;
    els.coachOnlyBtn.onclick = () => window.location.href = "fremside.html";
  }

  const matches = await loadMatches();

  if (role === "coach") {
    await cleanupDuplicateStartEvents(matches);
  }

  const upcoming = matches.filter(m => String(m.status || "").toUpperCase() !== "ENDED").sort((a,b) => dateValue(a) - dateValue(b));
  const played = matches.filter(m => String(m.status || "").toUpperCase() === "ENDED").sort((a,b) => dateValue(b) - dateValue(a));

  renderNext(upcoming[0]);
  renderUpcoming(upcoming.slice(1));
  renderLast(played[0]);
}

els.logoutBtn.onclick = async () => {
  await signOut(auth);
  window.location.href = "index.html";
};
els.allMatchesBtn.onclick = () => window.location.href = "kampoversikt.html?view=upcoming";
els.allPlayedBtn.onclick = () => window.location.href = "kampoversikt.html?view=played";
els.statsBtn.onclick = () => window.location.href = "statistikk.html";

onAuthStateChanged(auth, async user => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  try {
    await initForUser(user);
  } catch (error) {
    console.error(error);
    els.errorMsg.textContent = "Kunne ikke hente kampoversikten. Prøv å laste siden på nytt.";
  }
});