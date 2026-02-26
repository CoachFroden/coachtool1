import { auth, db } from "./firebase-refleksjon.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy,
  limit,
  where,
  addDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const userLine = document.getElementById("userLine");
const roleLine = document.getElementById("roleLine");
const logoutBtn = document.getElementById("logoutBtn");
const errorMsg = document.getElementById("errorMsg");
const tabPlayers = document.getElementById("tabPlayers");
const tabMatch = document.getElementById("tabMatch");
const playersPanel = document.getElementById("playersPanel");
const matchPanel = document.getElementById("matchPanel");
const matchSelect = document.getElementById("matchSelect");
const matchArea = document.getElementById("matchArea");

const playersSelect = document.getElementById("playersSelect");const entriesEl = document.getElementById("entries");
const selectedPlayerEl = document.getElementById("selectedPlayer");



let utviklingsbank = {};
let openPlayedMatchId = null;

async function loadUtviklingsbank() {
  const response = await fetch("utviklingsbank.json");
  utviklingsbank = await response.json();
}

const rightPanel = document.getElementById("rightPanel");
const rightTitle = document.getElementById("rightTitle");

function hideRightPanel() {
  rightPanel?.classList.add("isHidden");
}

function showRightPanel(title, hintText = "") {
  if (rightTitle) rightTitle.textContent = title;
  if (hintText && selectedPlayerEl) selectedPlayerEl.textContent = hintText;
  rightPanel?.classList.remove("isHidden");
}

let currentUid = null;

function setError(msg) {
  errorMsg.textContent = msg || "";
}

logoutBtn.onclick = async () => {
  await signOut(auth);
  window.location.href = "index.html"; // tilbake til login
};

async function loadPlayers() {
  playersSelect.innerHTML = `<option value="">Laster spillere…</option>`;

  try {
    const snap = await getDocs(collection(db, "spillere"));

    if (snap.empty) {
      playersSelect.innerHTML = `<option value="">Ingen spillere funnet</option>`;
      return;
    }

    const rows = [];
snap.forEach(d => {
  const data = d.data() || {};
  const navn = data.navn || data.name || d.id;

  // Bruk uid hvis det finnes, ellers fallback til docId
  const uid = data.uid;

  rows.push({ id: uid || d.id, navn });
});

    rows.sort((a, b) => a.navn.localeCompare(b.navn, "no"));

    playersSelect.innerHTML = `<option value="">Velg spiller…</option>`;

    rows.forEach(p => {
      const opt = document.createElement("option");
      opt.value = p.id;
      opt.textContent = p.navn;
      opt.dataset.name = p.navn;
      playersSelect.appendChild(opt);
    });

  } catch (e) {
    playersSelect.innerHTML = `<option value="">Feil ved lasting</option>`;
    setError(String(e?.message || e));
  }
}

playersSelect.addEventListener("change", (e) => {
  const playerId = e.target.value;
  const selectedOption = e.target.selectedOptions[0];
  const playerName = selectedOption?.dataset?.name;

  if (!playerId) {
    selectedPlayerEl.textContent = "Velg en spiller.";
    entriesEl.innerHTML = "";
    return;
  }
  showRightPanel("Refleksjoner", `Valgt: ${playerName || ""}`);
  initReflections(playerId, playerName);
});

async function initReflections(playerId, playerName) {
  setError("");
  selectedPlayerEl.textContent = `Valgt: ${playerName}`;
  entriesEl.innerHTML = `<div class="item">Laster uker…</div>`;

  try {
    const weeks = await loadAvailableWeeks(playerId);

    if (weeks.length === 0) {
      entriesEl.innerHTML = `<div class="item">Ingen refleksjoner funnet for denne spilleren.</div>`;
      return;
    }

    renderPlayerTabs(playerId, playerName, weeks);

  } catch (e) {
    entriesEl.innerHTML = `<div class="item">Kunne ikke hente refleksjoner.</div>`;
    setError(String(e?.message || e));
  }
}

function renderPlayerTabs(playerId, playerName, weeks) {

  entriesEl.innerHTML = `
<div class="tabRow">
  <button id="tabReflection" class="tabBtn tabBtnActive" type="button">
    Refleksjoner
  </button>
  <button id="tabPlan" class="tabBtn" type="button">
    Utviklingsplan
  </button>
</div>

    <div id="playerContent"></div>
  `;

  const reflectionBtn = document.getElementById("tabReflection");
  const planBtn = document.getElementById("tabPlan");

reflectionBtn.addEventListener("click", () => {
  reflectionBtn.classList.add("tabBtnActive");
  planBtn.classList.remove("tabBtnActive");

  document.getElementById("rightTitle").textContent = "Refleksjoner";

  renderReflectionView(playerId, weeks);
});

planBtn.addEventListener("click", () => {
  planBtn.classList.add("tabBtnActive");
  reflectionBtn.classList.remove("tabBtnActive");

  document.getElementById("rightTitle").textContent = "Utviklingsplan";

  renderDevelopmentPlan(playerId);
});

  // Default = refleksjon
  renderReflectionView(playerId, weeks);
}

function finnUtviklingsOmradeGlobal(omradeId) {
  for (const kategori in utviklingsbank) {
    const liste = utviklingsbank[kategori];
    const match = liste.find(item => item.id === omradeId);
    if (match) return match;
  }
  return null;
}

async function loadAvailableWeeks(playerId) {
  // Hent en bunt entries og bygg liste over unike (year, week)
  const entriesRef = collection(db, `refleksjoner/${playerId}/entries`);

  // Prøver createdAt-sorting hvis den finnes, men vi tåler også at den mangler.
  let snap;
  try {
    const q = query(entriesRef, orderBy("createdAt", "desc"), limit(50));
    snap = await getDocs(q);
  } catch (_) {
    // fallback hvis createdAt/orderBy gir index/field-feil
    const q = query(entriesRef, limit(50));
    snap = await getDocs(q);
  }

  const seen = new Set();
  const weeks = [];

  snap.forEach(d => {
    const data = d.data() || {};
    const week = Number(data.week);
    const year = Number(data.year);

    if (!Number.isFinite(week) || !Number.isFinite(year)) return;

    const key = `${year}-${week}`;
    if (seen.has(key)) return;

    seen.add(key);
    weeks.push({ year, week });
  });

  // Sorter: nyeste først
  weeks.sort((a, b) => (b.year - a.year) || (b.week - a.week));

  return weeks;
}

function renderReflectionView(playerId, weeks) {

  const content = document.getElementById("playerContent");

  const options = [
    `<option value="" selected disabled>Velg uke…</option>`,
    ...weeks.map(w => {
      const label = `Uke ${w.week} (${w.year})`;
      const value = `${w.year}|${w.week}`;
      return `<option value="${value}">${label}</option>`;
    })
  ].join("");

  content.innerHTML = `
    <div class="item">
      <div class="itemTitle">Velg uke</div>
      <select id="weekSelect" class="playerSelect statsSelect">
        ${options}
      </select>
    </div>

    <div id="reflectionView">
      <div class="item">Velg uke for å se refleksjonen.</div>
    </div>
  `;

  const weekSelect = document.getElementById("weekSelect");

  weekSelect.addEventListener("change", async () => {
    if (!weekSelect.value) return;

    const [yearStr, weekStr] = weekSelect.value.split("|");
    const year = Number(yearStr);
    const week = Number(weekStr);

    await loadAndRenderReflection(playerId, year, week);
  });
}

async function renderDevelopmentPlan(playerId) {

  const content = document.getElementById("playerContent");
  content.innerHTML = `<div class="item">Laster utviklingsplan…</div>`;

  try {
    const snap = await getDoc(doc(db, "utviklingsplan", playerId));

    if (!snap.exists()) {
      content.innerHTML = `<div class="item">Ingen utviklingsplan funnet.</div>`;
      return;
    }

    const data = snap.data();
	
	const omrade = finnUtviklingsOmradeGlobal(data.mainFocus);
    const focusTitle = omrade?.title || data.mainFocus || "";
	
	const treningHtml = omrade?.trening
  ? `<ul class="planList">${omrade.trening.map(t => `<li>${escapeHtml(t)}</li>`).join("")}</ul>`
  : escapeHtml(data.trainingGoal || "");

const kampHtml = omrade?.kamp
  ? `<ul class="planList">${omrade.kamp.map(k => `<li>${escapeHtml(k)}</li>`).join("")}</ul>`
  : escapeHtml(data.matchBehaviour || "");

    content.innerHTML = `
      <div class="item">
        <div class="itemTitle">Hovedfokus</div>
        <div class="itemSub">${escapeHtml(focusTitle)}</div>
      </div>

      <div class="item" style="margin-top:10px;">
        <div class="itemTitle">Utviklingsmål</div>
        <div class="itemSub">${escapeHtml(data.utviklingsmaal || "")}</div>
      </div>

      <div class="item" style="margin-top:10px;">
        <div class="itemTitle">Treningsmål</div>
        <div class="itemSub">${treningHtml}</div>
      </div>

      <div class="item" style="margin-top:10px;">
        <div class="itemTitle">Kampatferd</div>
        <div class="itemSub">${kampHtml}</div>
      </div>
    `;

  } catch (e) {
    content.innerHTML = `<div class="item">Kunne ikke hente utviklingsplan.</div>`;
    setError(String(e?.message || e));
  }
}

async function loadAndRenderReflection(playerId, year, week) {
  const view = document.getElementById("reflectionView");
  if (!view) return;

  view.innerHTML = `<div class="item">Laster refleksjon…</div>`;
  setError("");

  try {
    const entry = await getReflectionByWeek(playerId, year, week);

    if (!entry) {
      view.innerHTML = `<div class="item">Ingen refleksjon funnet for uke ${week} (${year}).</div>`;
      return;
    }

    view.innerHTML = renderReflection(entry, { playerId, year, week });
setupCoachFeedbackButton(entry);

  } catch (e) {
    view.innerHTML = `<div class="item">Kunne ikke hente refleksjon for valgt uke.</div>`;
    setError(String(e?.message || e));
  }
}

async function setupCoachFeedbackButton(entry) {
  const btn = document.getElementById("toggleCoachFbBtn");
  const box = document.getElementById("coachFeedbackBox");
  if (!btn || !box) return;

  btn.addEventListener("click", async () => {

    const isHidden = box.style.display === "none";
    box.style.display = isHidden ? "block" : "none";
    if (!isHidden) return;

    box.innerHTML = `<div class="itemSub">Laster tilbakemelding…</div>`;

    try {
      const fb = await loadCoachFeedback(entry.playerId || entry.uid || playersSelect.value);

      if (!fb) {
        box.innerHTML = `<div class="itemSub">Ingen tilbakemelding fra trener for denne uken.</div>`;
        return;
      }

      box.innerHTML = renderCoachFeedback(fb);

    } catch (e) {
      box.innerHTML = `<div class="itemSub">Kunne ikke hente tilbakemelding.</div>`;
      setError(String(e?.message || e));
    }
  });
}

async function loadCoachFeedback(playerId) {
  const fbRef = collection(db, "feedback");

  const q = query(
    fbRef,
    where("playerId", "==", playerId),
    where("type", "==", "weekly"),
    where("status", "==", "sent"),
    limit(20)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  // sorter på updatedAt (nyeste først)
  rows.sort((a, b) => {
    const aT = a.updatedAt?.toDate ? a.updatedAt.toDate().getTime() : 0;
    const bT = b.updatedAt?.toDate ? b.updatedAt.toDate().getTime() : 0;
    return bT - aT;
  });

  return rows[0];
}

function renderCoachFeedback(fb) {
  const text = fb?.editedText || "";

  if (!text) {
    return `<div class="itemSub">Ingen tilbakemelding fra trener for denne uken.</div>`;
  }

  return `
    <div class="itemSub" style="opacity:.95;">
      ${escapeHtml(text)}
    </div>
  `;
}

async function getReflectionByWeek(playerId, year, week) {
  const entriesRef = collection(db, `refleksjoner/${playerId}/entries`);

  // Vi bruker kun equality-filters + limit og velger “nyeste” i minnet
  // (unngår orderBy+where som ofte trigger composite index).
  const q = query(
    entriesRef,
    where("year", "==", year),
    where("week", "==", week),
    limit(10)
  );

  const snap = await getDocs(q);
  if (snap.empty) return null;

  // Hvis det finnes flere docs samme uke, velg den med høyest createdAt (om feltet finnes)
const rows = [];
snap.forEach(d => {
  const data = d.data() || {};
  rows.push({ id: d.id, ...data });
});

  rows.sort((a, b) => {
    const aT = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : 0;
    const bT = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : 0;
    return bT - aT;
  });

  return rows[0];
}

function renderReflection(data, ctx) {
  const createdAt =
    data.createdAt?.toDate ? data.createdAt.toDate().toLocaleString("no-NO") : "";

  const type = data.type || "";
  const effort = data.effort ?? "";
  const energy = data.energy ?? "";
  const goodThing = data.goodThing || "";
  const improveThing = data.improveThing || "";
  const workedOnSeasonGoal = data.workedOnSeasonGoal || "";

  const coachNote = data.coachNote || "";
  const coachEffort = data.coachEffort ?? "";
  const coachEnergy = data.coachEnergy ?? "";

  return `
    <div class="item">
      <div class="itemTitle">Refleksjon</div>
      <div class="itemSub">${createdAt}${type ? " · " + escapeHtml(type) : ""}</div>
    </div>

    <div class="item" style="margin-top:10px;">
      <div class="itemTitle">Oppsummering</div>
      <div class="itemSub" style="margin-top:6px;">
        Innsats: <b>${escapeHtml(String(effort))}</b> · Energi: <b>${escapeHtml(String(energy))}</b>
      </div>
      ${workedOnSeasonGoal ? `<div class="itemSub" style="margin-top:6px;">Jobbet med sesongmål: <b>${escapeHtml(workedOnSeasonGoal)}</b></div>` : ""}
    </div>

    ${goodThing ? `
      <div class="item" style="margin-top:10px;">
        <div class="itemTitle">Dette fungerte bra</div>
        <div class="itemSub" style="margin-top:6px; opacity:.9;">${escapeHtml(goodThing)}</div>
      </div>
    ` : ""}

    ${improveThing ? `
      <div class="item" style="margin-top:10px;">
        <div class="itemTitle">Dette kan forbedres</div>
        <div class="itemSub" style="margin-top:6px; opacity:.9;">${escapeHtml(improveThing)}</div>
      </div>
    ` : ""}
	
	  ${ctx ? `
    <div class="item" style="margin-top:10px;">
      <button id="toggleCoachFbBtn" class="statsSelect" style="width:100%;">
        Tilbakemelding fra trener
      </button>
      <div id="coachFeedbackBox" style="display:none; margin-top:10px;"></div>
    </div>
  ` : ""}

  `;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function placeLabelFromVenue(venue) {
  if (venue === "home") return "Hjemme";
  if (venue === "away") return "Borte";
  return "Ukjent sted";
}

function formatDateStringNo(isoDate) {
  // isoDate: "2026-01-31"
  if (!isoDate || typeof isoDate !== "string") return "(ukjent dato)";
  const [y, m, d] = isoDate.split("-");
  if (!y || !m || !d) return isoDate;
  return `${d}.${m}.${y}`;
}

async function loadPlayedMatches(coachUid) {
	
  setError("");
  selectedPlayerEl.textContent = "Spilte kamper";
entriesEl.innerHTML = `
  <div class="item">
    <div class="statsTypeRow">
      <button class="typeFilterBtn active" data-type="all">Alle</button>
      <button class="typeFilterBtn" data-type="league">Seriekamp</button>
      <button class="typeFilterBtn" data-type="cup">Cupkamp</button>
      <button class="typeFilterBtn" data-type="friendly">Treningskamp</button>
    </div>
  </div>
  <div id="playedMatchesContainer"></div>
`;

const container = document.getElementById("playedMatchesContainer");

  try {
    const matchesRef = collection(db, "matches");
    const q = query(matchesRef, limit(50));
    const snap = await getDocs(q);

    const rows = [];
    snap.forEach(d => {
      const m = d.data() || {};

      const opponent = m?.meta?.opponent || "(ukjent motstander)";
      const date = m?.meta?.date || null;
      const venue = m?.meta?.venue || null;

      const our = m?.score?.our;
      const their = m?.score?.their;

      const hasScore = Number.isFinite(our) && Number.isFinite(their);
      if (!hasScore) return; // bare ferdige kamper

rows.push({
  id: d.id,
  opponent,
  date,
  venue,
  our,
  their,
  result: m.result,
  type: m?.meta?.type || null
});
    });
	
 rows.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

let activeType = "all";

function renderFiltered() {
  container.innerHTML = "";

const filtered = rows.filter(m => {

  if (activeType === "all") return true;

  if (!m.type) return false;

  if (activeType === "league")
    return m.type === "league" || m.type === "Seriekamp";

  if (activeType === "cup")
    return m.type === "cup" || m.type === "Cupkamp";

  if (activeType === "friendly")
    return m.type === "friendly" || m.type === "Treningskamp";

  return false;
});

  if (!filtered.length) {
    container.innerHTML = `<div class="item">Ingen kamper av valgt type.</div>`;
    return;
  }

  filtered.forEach(m => {
    const div = document.createElement("div");
    div.className = "item";
	
div.style.cursor = "pointer";
div.addEventListener("click", () => {
  showPlayedMatchDetails(m.id, div);
});

const resultLabel =
  m.our > m.their ? "Seier" :
  m.our < m.their ? "Tap" :
  "Uavgjort";
  
  const resultClass =
  m.our > m.their ? "result-win" :
  m.our < m.their ? "result-loss" :
  "result-draw";
  
const venueText =
  m.venue === "home" ? "Hjemme" :
  m.venue === "away" ? "Borte" :
  "";

div.innerHTML = `
  <div class="itemTitle">${m.opponent}</div>
  <div class="itemSub">
    ${formatDateStringNo(m.date)} • 
    ${venueText} • 
    ${m.our}-${m.their} • 
    <span class="${resultClass}">${resultLabel}</span>
  </div>
`;
    container.appendChild(div);
  });
}

renderFiltered();

document.querySelectorAll(".typeFilterBtn").forEach(btn => {
  btn.addEventListener("click", () => {

    document.querySelectorAll(".typeFilterBtn")
      .forEach(b => b.classList.remove("active"));

    btn.classList.add("active");
    activeType = btn.dataset.type;

    renderFiltered();
  });
});

  } catch (e) {
    entriesEl.innerHTML = `<div class="item">Kunne ikke hente spilte kamper.</div>`;
    setError(String(e?.message || e));
  }
}

function showPlayersView() {
  tabPlayers.classList.add("isActive");
  tabMatch.classList.remove("isActive");
  tabPlayers.setAttribute("aria-selected", "true");
  tabMatch.setAttribute("aria-selected", "false");

  playersPanel.classList.remove("isHidden");
  matchPanel.classList.add("isHidden");
  
  playersSelect.value = "";
  hideRightPanel();
  document.getElementById("rightTitle").textContent = "Refleksjoner";
  selectedPlayerEl.textContent = "Velg en spiller.";
  entriesEl.innerHTML = "";
  setError("");
}

function showMatchView() {
  tabMatch.classList.add("isActive");
  tabPlayers.classList.remove("isActive");
  tabMatch.setAttribute("aria-selected", "true");
  tabPlayers.setAttribute("aria-selected", "false");

  matchPanel.classList.remove("isHidden");
  playersPanel.classList.add("isHidden");

  // ✅ Nullstill kampvalg og skjul høyre panel til noe velges
  matchSelect.value = "";
  hideRightPanel();
  document.getElementById("rightTitle").textContent = "Kamp";
  selectedPlayerEl.textContent = "Velg kamp.";
  entriesEl.innerHTML = "";
  setError("");
}

tabPlayers.addEventListener("click", showPlayersView);
tabMatch.addEventListener("click", showMatchView);

matchSelect.addEventListener("change", async () => {
  const v = matchSelect.value;

  if (!v) return;
  showRightPanel("Kamp");

  if (v === "played") {
    await loadPlayedMatches(currentUid);

  } else if (v === "upcoming") {
    await loadUpcomingMatches();

  } else if (v === "stats") {
    selectedPlayerEl.textContent = "Statistikk";
    const matches = await loadAllEndedMatches();
    renderStatsSelector(matches);
  }
});

async function loadUpcomingMatches() {
  setError("");
  selectedPlayerEl.textContent = "Kommende kamper";
  
  entriesEl.innerHTML = `
  <div class="item">
    <button id="addUpcomingMatchBtn" class="statsSelect addMatchBtn" style="width:100%;">
      Legg til kamp
    </button>
  </div>
  <div id="addMatchFormContainer"></div>
`;

const addBtn = document.getElementById("addUpcomingMatchBtn");
const formContainer = document.getElementById("addMatchFormContainer");

if (addBtn && formContainer) {
  addBtn.addEventListener("click", () => {
    const isOpen = formContainer.innerHTML.trim() !== "";

    if (isOpen) {
      formContainer.innerHTML = "";
      return;
    }

    formContainer.innerHTML = `
      <div class="item" style="margin-top:10px;">
        <div class="itemTitle">Ny kamp</div>

<div class="itemSub" style="margin-top:8px;">
  <input id="opponentInput" class="playerSelect" placeholder="Motstander" />
</div>

        <div class="itemSub" style="margin-top:8px;">
  <select id="venueTypeInput" class="playerSelect">
    <option value="">Hjemme eller borte?</option>
    <option value="home">Hjemme</option>
    <option value="away">Borte</option>
  </select>
</div>

<div class="itemSub" style="margin-top:8px;">
  <input id="venueNameInput" class="playerSelect" placeholder="Stedsnavn (valgfritt)" />
</div>
		
		<div class="itemSub" style="margin-top:8px;">
  <input id="dateInput" type="date" class="playerSelect" />
</div>

        <div class="itemSub" style="margin-top:8px;">
          <input id="timeInput" type="time" class="playerSelect" />
        </div>

        <div class="itemSub" style="margin-top:8px;">
          <select id="typeInput" class="playerSelect">
  <option value="">Type kamp</option>
  <option value="league">Seriekamp</option>
  <option value="cup">Cupkamp</option>
  <option value="friendly">Treningskamp</option>
</select>
        </div>

        <div style="display:flex; gap:8px; margin-top:10px;">
          <button id="saveMatchBtn" class="statsSelect" style="flex:1;">Lagre</button>
          <button id="cancelMatchBtn" class="statsSelect" style="flex:1;">Avbryt</button>
        </div>
      </div>
    `;

document.getElementById("cancelMatchBtn").onclick = () => {
  formContainer.innerHTML = "";
};

document.getElementById("saveMatchBtn").onclick = async () => {

  const opponent = document.getElementById("opponentInput").value.trim();
  const venueType = document.getElementById("venueTypeInput").value;
  const venueName = document.getElementById("venueNameInput").value.trim();
  const date = document.getElementById("dateInput").value;
  const time = document.getElementById("timeInput").value;
  const type = document.getElementById("typeInput").value;

  if (!opponent || !venueType || !date || !time || !type) {
    alert("Fyll ut alle feltene.");
    return;
  }

  try {
    await addDoc(collection(db, "matches"), {
meta: {
  opponent,
  venueType,
  venueName,
  date,
  time,
  type
},
      status: "UPCOMING",
      createdAt: serverTimestamp()
    });

    formContainer.innerHTML = "";
    await loadUpcomingMatches();

  } catch (e) {
    console.error(e);
    alert("Kunne ikke lagre kamp.");
  }
};
  });
}

  try {
    const matchesRef = collection(db, "matches");
    const snap = await getDocs(matchesRef);

    const rows = [];
    snap.forEach(d => {
      const m = d.data() || {};
      if (m.status === "UPCOMING") {
rows.push({
  id: d.id,   // ← VIKTIG
  opponent: m?.meta?.opponent || "(ukjent)",
  date: m?.meta?.date || null,
  time: m?.meta?.time || "",
  venueType: m?.meta?.venueType || null,
  venueName: m?.meta?.venueName || ""
});
      }
    });

    rows.sort((a, b) => 
  (a.date || "").localeCompare(b.date || "")
);

if (rows.length === 0) {
  const emptyDiv = document.createElement("div");
  emptyDiv.className = "item";
  emptyDiv.textContent = "Ingen kommende kamper funnet.";
  entriesEl.appendChild(emptyDiv);
  return;
}

rows.forEach(m => {
	
      const div = document.createElement("div");
      div.className = "item";
	  div.style.cursor = "pointer";
div.addEventListener("click", () => openEditUpcomingMatch(m));
      div.innerHTML = `
        <div class="itemTitle">${m.opponent}</div>
<div class="itemSub">
  ${m.date ? formatDateStringNo(m.date) : "Dato ikke satt"}
  ${m.time ? " kl. " + m.time : ""}
  ·
  ${
    m.venueType === "home"
      ? "Hjemme"
      : m.venueType === "away"
      ? "Borte"
      : "Ukjent"
  }
  ${m.venueName ? " – " + m.venueName : ""}
</div>
      `;
      entriesEl.appendChild(div);
    });

  } catch (e) {
    entriesEl.innerHTML = `<div class="item">Kunne ikke hente kommende kamper.</div>`;
    setError(String(e?.message || e));
  }
}

function renderStatsSelector(matches) {

  if (!matches.length) {
    entriesEl.innerHTML = `<div class="item">Ingen kamper funnet.</div>`;
    return;
  }

  let activeType = "all";

  function filterMatchesByType(list) {

    if (activeType === "all") return list;

    return list.filter(m => {
      const type = m.meta?.type;

      if (!type) return false;

      if (activeType === "league")
        return type === "league" || type === "Seriekamp";

      if (activeType === "cup")
        return type === "cup" || type === "Cupkamp";

      if (activeType === "friendly")
        return type === "friendly" || type === "Treningskamp";

      return false;
    });
  }

  function buildDropdown(filteredMatches) {

    let options = `<option value="total">Total</option>`;

filteredMatches.forEach(m => {

  const date = m.meta?.date ? formatDateStringNo(m.meta.date) : "";
  const opponent = m.meta?.opponent || "";

  const our = m.score?.our;
  const their = m.score?.their;

  let resultLabel = "";

  if (Number.isFinite(our) && Number.isFinite(their)) {
    if (our > their) resultLabel = "Seier";
    else if (our < their) resultLabel = "Tap";
    else resultLabel = "Uavgjort";
  }

const venueText =
  m.meta?.venue === "home" ? "Hjemme" :
  m.meta?.venue === "away" ? "Borte" :
  "";

options += `
  <option value="${m.id}">
    ${opponent} — ${date} • ${venueText} • ${our}-${their} • ${resultLabel}
  </option>
`;
});

    document.getElementById("statsMatchSelect").innerHTML = options;
  }

  // 🔹 Bygg UI én gang
  entriesEl.innerHTML = `
    <div class="item">
      <div class="statsTypeRow">
        <button class="statsTypeBtn active" data-type="all">Alle</button>
        <button class="statsTypeBtn" data-type="league">Seriekamp</button>
        <button class="statsTypeBtn" data-type="cup">Cupkamp</button>
        <button class="statsTypeBtn" data-type="friendly">Treningskamp</button>
      </div>

      <select id="statsMatchSelect" class="playerSelect statsSelect"></select>
    </div>

    <div id="statsContent"></div>
    <div id="matchDetailsArea"></div>
  `;

  const select = document.getElementById("statsMatchSelect");

  function renderAll() {

    const filteredMatches = filterMatchesByType(matches);

    buildDropdown(filteredMatches);

    renderStatsContent(filteredMatches);

    const detailsArea = document.getElementById("matchDetailsArea");
    if (detailsArea) detailsArea.innerHTML = "";

    select.value = "total";
  }

  // 🔹 Type-knapper
  document.querySelectorAll(".statsTypeBtn").forEach(btn => {
    btn.addEventListener("click", () => {

      document.querySelectorAll(".statsTypeBtn")
        .forEach(b => b.classList.remove("active"));

      btn.classList.add("active");
      activeType = btn.dataset.type;

      renderAll();
    });
  });

  // 🔹 Dropdown
  select.addEventListener("change", () => {

    const filteredMatches = filterMatchesByType(matches);
    const detailsArea = document.getElementById("matchDetailsArea");
    if (detailsArea) detailsArea.innerHTML = "";

    if (select.value === "total") {
      renderStatsContent(filteredMatches);
    } else {
      const singleMatch = filteredMatches.find(m => m.id === select.value);

      if (singleMatch) {
        renderStatsContent([singleMatch]);
        renderDetailsButton(singleMatch);
      }
    }

  });

  // 🔹 Default render
  renderAll();
}

function renderStatsContent(matches) {
  const stats = calculateStats(matches);
  renderStatsTable(stats, "statsContent");
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  userLine.textContent = `Innlogget: ${user.email || user.uid}`;
  currentUid = user.uid;

  // Les rolle fra users/{uid}
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) {
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

  const role = snap.data()?.role;
  
const coachOnlyBtn = document.getElementById("coachOnlyBtn");

if (coachOnlyBtn) {
  // Skjul alltid først
  coachOnlyBtn.style.display = "none";

  if (role === "coach") {
    coachOnlyBtn.style.display = "inline-block";

    coachOnlyBtn.onclick = () => {
      window.location.href = "fremside.html";
    };
  }
}
  
if (roleLine) {
  roleLine.textContent = `Rolle: ${role || "ukjent"}`;
}

  // Tillat assistantCoach og coach (praktisk for deg å teste)
  if (role !== "assistantCoach" && role !== "coach") {
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

 await loadUtviklingsbank();
await loadPlayers();
showPlayersView();
});

async function loadAllEndedMatches() {
  const matchesRef = collection(db, "matches");
  const snap = await getDocs(matchesRef);

  const matches = [];

  snap.forEach(d => {
    const data = d.data();
    if (data.status === "ENDED") {
      matches.push({
        id: d.id,
        ...data
      });
    }
  });

  return matches;
}

function calculateStats(matches) {
  const stats = {};

  matches.forEach(match => {

    // 🔹 Spillertid + kort
    (match.playingTime || []).forEach(p => {

      if (!stats[p.id]) {
        stats[p.id] = {
          name: p.name,
          matches: 0,
          minutes: 0,
          goals: 0,
          yellow: 0,
          red: 0
        };
      }

      stats[p.id].matches += 1;
      stats[p.id].minutes += p.minutes || 0;

      (p.cards || []).forEach(c => {
        if (c.type === "yellow") stats[p.id].yellow += 1;
        if (c.type === "red") stats[p.id].red += 1;
      });
    });

    // 🔹 Mål
    (match.events || []).forEach(e => {
      if (e.type === "goal" && e.team === "home" && e.playerId) {
        if (stats[e.playerId]) {
          stats[e.playerId].goals += 1;
        }
      }
    });

  });

  return stats;
}

function renderStatsTable(stats, targetId = null) {

  const container = targetId
    ? document.getElementById(targetId)
    : entriesEl;

  const players = Object.values(stats);

  if (players.length === 0) {
    container.innerHTML = `<div class="item">Ingen statistikk funnet.</div>`;
    return;
  }

  players.sort((a, b) => b.minutes - a.minutes);

  let html = `
    <table class="statsTable">
      <thead>
        <tr>
          <th>Spiller</th>
          <th title="Kamper spilt">👟</th>
          <th title="Mål">⚽</th>
          <th title="Gule kort">🟨</th>
          <th title="Røde kort">🟥</th>
          <th title="Totale minutter">⏱</th>

        </tr>
      </thead>
      <tbody>
  `;

  players.forEach(p => {
    html += `
      <tr>
  <td>${p.name}</td>
  <td>${p.matches}</td>
  <td>${p.goals}</td>
  <td>${p.yellow}</td>
  <td>${p.red}</td>
  <td>${p.minutes}</td>
</tr>
    `;
  });

  html += `
      </tbody>
    </table>
  `;

  container.innerHTML = html;
}

function renderDetailsButton(match) {
  const area = document.getElementById("matchDetailsArea");
  if (!match || !area) return;

  area.innerHTML = `
    <div class="item" style="margin-top:10px;">
      <button id="showMatchDetailsBtn" class="btn" style="width:100%;">
        Detaljer
      </button>
      <div id="matchDetailsBox" style="display:none; margin-top:10px;"></div>
    </div>
  `;

  const btn = document.getElementById("showMatchDetailsBtn");
  const box = document.getElementById("matchDetailsBox");

  btn.addEventListener("click", () => {
    const isHidden = box.style.display === "none";
    box.style.display = isHidden ? "block" : "none";

    if (!isHidden) return;

    box.innerHTML = renderMatchDetails(match);
  });
}

function renderMatchDetails(match) {

  const events = match.events || [];

  if (!events.length) {
    return `<div class="itemSub">Ingen hendelser registrert.</div>`;
  }

  let html = `<div class="itemSub" style="opacity:.95;">`;

  // Vi viser hendelsene i kronologisk rekkefølge (eldst først)
  const sorted = [...events].reverse();

  sorted.forEach(e => {
    html += `
      <div style="margin-bottom:6px;">
        ${escapeHtml(e.text || "")}
      </div>
    `;
  });

  html += `</div>`;

  return html;
}

async function showPlayedMatchDetails(matchId, clickedDiv) {

  // Hvis samme kamp klikkes igjen → lukk
  if (openPlayedMatchId === matchId) {
    const existingDetails = clickedDiv.nextElementSibling;
    if (existingDetails && existingDetails.classList.contains("matchDetailsBlock")) {
      existingDetails.remove();
    }
    openPlayedMatchId = null;
    return;
  }

  // Hvis en annen kamp er åpen → lukk den først
  const oldDetails = document.querySelector(".matchDetailsBlock");
  if (oldDetails) oldDetails.remove();

  openPlayedMatchId = matchId;

  try {
    const snap = await getDoc(doc(db, "matches", matchId));
    if (!snap.exists()) return;

    const match = snap.data();

    const detailsDiv = document.createElement("div");
    detailsDiv.className = "item matchDetailsBlock";
    detailsDiv.style.marginTop = "6px";

    detailsDiv.innerHTML = `
      <div class="itemSub" style="margin-bottom:6px;">
        ${formatDateStringNo(match.meta?.date)} ·
        ${placeLabelFromVenue(match.meta?.venue)} ·
        ${match.score?.our ?? 0}–${match.score?.their ?? 0}
      </div>
      ${renderMatchDetails(match)}
    `;

    clickedDiv.after(detailsDiv);

  } catch (e) {
    console.error(e);
  }
}

function openEditUpcomingMatch(match) {

  const formContainer = document.getElementById("addMatchFormContainer");
  if (!formContainer) return;

  formContainer.innerHTML = `
    <div class="item" style="margin-top:10px;">
      <div class="itemTitle">Rediger kamp</div>

      <div class="itemSub" style="margin-top:8px;">
        <input id="opponentInput" class="playerSelect" placeholder="Motstander"
          value="${escapeHtml(match.opponent || "")}" />
      </div>

      <div class="itemSub" style="margin-top:8px;">
        <select id="venueTypeInput" class="playerSelect">
          <option value="">Hjemme eller borte?</option>
          <option value="home" ${match.venueType === "home" ? "selected" : ""}>Hjemme</option>
          <option value="away" ${match.venueType === "away" ? "selected" : ""}>Borte</option>
        </select>
      </div>

      <div class="itemSub" style="margin-top:8px;">
        <input id="venueNameInput" class="playerSelect"
          placeholder="Stedsnavn (valgfritt)"
          value="${escapeHtml(match.venueName || "")}" />
      </div>

      <div class="itemSub" style="margin-top:8px;">
        <input id="dateInput" type="date" class="playerSelect"
          value="${match.date || ""}" />
      </div>

      <div class="itemSub" style="margin-top:8px;">
        <input id="timeInput" type="time" class="playerSelect"
          value="${match.time || ""}" />
      </div>

<div class="actionRow">
  <button id="updateMatchBtn" class="updateBtn">Oppdater</button>
  <button id="deleteMatchBtn" class="deleteBtn">Slett</button>
  <button id="cancelMatchBtn" class="cancelBtn">Avbryt</button>
</div>
    </div>
  `;

  document.getElementById("cancelMatchBtn").onclick = () => {
    formContainer.innerHTML = "";
  };

  document.getElementById("updateMatchBtn").onclick = async () => {
    await updateUpcomingMatch(match.id);
  };
  
  document.getElementById("deleteMatchBtn").onclick = async () => {

  const confirmDelete = confirm("Er du sikker på at du vil slette denne kampen?");
  if (!confirmDelete) return;

  try {
    await deleteDoc(doc(db, "matches", match.id));

    const formContainer = document.getElementById("addMatchFormContainer");
    if (formContainer) formContainer.innerHTML = "";

    await loadUpcomingMatches();

  } catch (e) {
    console.error(e);
    alert("Kunne ikke slette kamp.");
  }
};
}

async function updateUpcomingMatch(matchId) {

  const opponent = document.getElementById("opponentInput").value.trim();
  const venueType = document.getElementById("venueTypeInput").value;
  const venueName = document.getElementById("venueNameInput").value.trim();
  const date = document.getElementById("dateInput").value;
  const time = document.getElementById("timeInput").value;

  if (!opponent || !venueType || !date || !time) {
    alert("Fyll ut alle obligatoriske feltene.");
    return;
  }

  try {
    await updateDoc(doc(db, "matches", matchId), {
      "meta.opponent": opponent,
      "meta.venueType": venueType,
      "meta.venueName": venueName,
      "meta.date": date,
      "meta.time": time
    });

    // Lukk skjema
    const formContainer = document.getElementById("addMatchFormContainer");
    if (formContainer) formContainer.innerHTML = "";

    // Reload liste
    await loadUpcomingMatches();

  } catch (e) {
    console.error(e);
    alert("Kunne ikke oppdatere kamp.");
  }
}

document.addEventListener("click", (e) => {
  const rightPanel = document.getElementById("rightPanel");
  const weekSelect = document.getElementById("weekSelect");
  const reflectionView = document.getElementById("reflectionView");

  if (!rightPanel || rightPanel.classList.contains("isHidden")) return;

  // Hvis vi klikker utenfor høyre panel
  if (!rightPanel.contains(e.target)) {

    // Nullstill uke
    if (weekSelect) {
      weekSelect.selectedIndex = 0;
    }

    // Lukk refleksjon
    if (reflectionView) {
      reflectionView.innerHTML =
        `<div class="item">Velg uke for å se refleksjonen.</div>`;
    }
  }
});

document.getElementById("openMatchAppBtn")
  ?.addEventListener("click", () => {
    window.location.href = "kamp.html";
  });