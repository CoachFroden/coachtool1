import { auth, db } from "./firebase-refleksjon.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import { collection, doc, getDoc, getDocs, limit, query } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const summary = document.getElementById("summary");
const goalSummary = document.getElementById("goalSummary");
const playerStats = document.getElementById("playerStats");
const errorMsg = document.getElementById("errorMsg");
const matchSelect = document.getElementById("matchSelect");
const statsTitle = document.getElementById("statsTitle");

document.getElementById("backBtn").onclick = () => location.href = "oversikt.html";
document.getElementById("logoutBtn").onclick = async () => {
  await signOut(auth);
  location.href = "index.html";
};

const norm = value => String(value || "").trim().toLocaleLowerCase("no");
const esc = value => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

function getPlayer(map, id, name) {
  const cleanName = String(name || "").trim();
  if (!cleanName) return null;
  if (norm(cleanName) === "torvald") return null;
  const idKey = id ? String(id) : "";
  if (idKey && map.has(idKey)) return map.get(idKey);
  for (const row of map.values()) if (norm(row.name) === norm(cleanName)) return row;
  const key = idKey || `name:${norm(cleanName)}`;
  const row = { key, name: cleanName, matches: 0, minutes: 0, goals: 0, yellow: 0, red: 0 };
  map.set(key, row);
  return row;
}

function buildStats(matches) {
  const team = { matches: 0, wins: 0, draws: 0, losses: 0, gf: 0, ga: 0 };
  const players = new Map();

  for (const match of matches) {
    team.matches++;
    const our = Number(match?.score?.our);
    const their = Number(match?.score?.their);
    if (Number.isFinite(our) && Number.isFinite(their)) {
      team.gf += our; team.ga += their;
      if (our > their) team.wins++;
      else if (our < their) team.losses++;
      else team.draws++;
    }

    const seen = new Set();
    for (const player of match.playingTime || []) {
      const row = getPlayer(players, player?.id, player?.name);
      if (!row) continue;
      if (!seen.has(row.key)) { row.matches++; seen.add(row.key); }
      const minutes = Number(player?.minutes);
      if (Number.isFinite(minutes)) row.minutes += minutes;
    }

    for (const event of match.events || []) {
      if (event?.team !== "home") continue;
      if (event?.type !== "goal" && event?.type !== "card") continue;
      const row = getPlayer(players, event?.playerId, event?.playerName);
      if (!row) continue;
      if (event.type === "goal") row.goals++;
      if (event.type === "card") event.cardType === "red" ? row.red++ : row.yellow++;
    }
  }

  return { team, players: [...players.values()].sort((a,b) => b.minutes-a.minutes || b.goals-a.goals || a.name.localeCompare(b.name,"no")) };
}

function render({ team, players }) {
  summary.innerHTML = `<div class="summaryCard"><span>Kamper</span><strong>${team.matches}</strong></div><div class="summaryCard"><span>Seier</span><strong>${team.wins}</strong></div><div class="summaryCard"><span>Uavgjort</span><strong>${team.draws}</strong></div><div class="summaryCard"><span>Tap</span><strong>${team.losses}</strong></div>`;
  goalSummary.textContent = `${team.gf}–${team.ga}`;
  playerStats.innerHTML = players.length ? players.map(p => `<div class="statsRow"><span class="player">${esc(p.name)}</span><span>${p.matches}</span><span class="minutes">${Math.round(p.minutes)}</span><span class="goals">${p.goals}</span><span class="yellow">${p.yellow}</span><span class="red">${p.red}</span></div>`).join("") : `<div class="empty">Ingen spillerstatistikk funnet ennå.</div>`;
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = String(value).split("-");
  return year && month && day ? `${day}.${month}.${year}` : String(value);
}

function matchLabel(match) {
  const opponent = match?.meta?.opponent || "Motstander";
  const date = formatDate(match?.meta?.date);
  const our = match?.score?.our ?? "–";
  const their = match?.score?.their ?? "–";
  return `${date ? date + " · " : ""}${opponent} · ${our}–${their}`;
}

function populateMatchSelect(matches) {
  matchSelect.innerHTML = `<option value="">Velg kamp</option>`;
  for (const match of matches) {
    const option = document.createElement("option");
    option.value = match.id;
    option.textContent = matchLabel(match);
    matchSelect.appendChild(option);
  }
}

function showSeason() {
  statsTitle.textContent = "Sesongstatistikk";
  render(buildStats(allMatches));
}

function showMatch(match) {
  statsTitle.textContent = `Kampstatistikk · ${match?.meta?.opponent || "Motstander"}`;
  render(buildStats([match]));
}

let allMatches = [];

matchSelect?.addEventListener("change", () => {
  if (!matchSelect.value) {
    showSeason();
    return;
  }
  const match = allMatches.find(m => m.id === matchSelect.value);
  if (match) showMatch(match);
});

onAuthStateChanged(auth, async user => {
  if (!user) { location.href = "index.html"; return; }
  try {
    const profile = await getDoc(doc(db, "users", user.uid));
    const role = profile.exists() ? profile.data()?.role : null;
    if (role !== "coach" && role !== "assistantCoach") { await signOut(auth); location.href = "index.html"; return; }
    const snap = await getDocs(query(collection(db, "matches"), limit(100)));
    allMatches = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(m => String(m.status || "").toUpperCase() === "ENDED")
      .sort((a,b) => String(b?.meta?.date || "").localeCompare(String(a?.meta?.date || "")));
    populateMatchSelect(allMatches);
    showSeason();
  } catch (error) {
    console.error(error);
    errorMsg.textContent = "Kunne ikke hente statistikken. Prøv å laste siden på nytt.";
  }
});