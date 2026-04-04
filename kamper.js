import { db, auth } from "./firebase-refleksjon.js";
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  query,
  where,
  orderBy,
  deleteField 
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

/* =========================
   STATE
========================= */
let squad = [];
let currentLineup = [];
let selectedPlayerName = null;
let selectedLineupPlayer = null;
let activeMatchId = null;
let userRole = null;

let activePlayer = null;
let activeElement = null;
let isDragging = false;

const FORMATIONS = {
"4-3-3": [
  { x: 50, y: 93 },

  { x: 15, y: 75 },
  { x: 38, y: 80 },
  { x: 62, y: 80 },
  { x: 85, y: 75 },

  // 🔥 MIDTBANE MED VALG
  {
    options: [
      { x: 23, y: 52 },
      { x: 23, y: 62 } // defensiv
    ]
  },
  {
    options: [
      { x: 50, y: 45 },
      { x: 50, y: 60 } // defensiv
    ]
  },
  {
    options: [
      { x: 77, y: 52 },
      { x: 77, y: 62 }
    ]
  },

  { x: 15, y: 28 },
  { x: 50, y: 22 },
  { x: 85, y: 28 }
],

  "4-4-2": [
    { x: 50, y: 93 },

    { x: 15, y: 75 },
    { x: 38, y: 80 },
    { x: 62, y: 80 },
    { x: 85, y: 75 },

    { x: 15, y: 50 },
    { x: 37, y: 52 },
    { x: 63, y: 52 },
    { x: 85, y: 50 },

    { x: 35, y: 25 },
    { x: 65, y: 25 }
  ]
};

/* =========================
   DOM
========================= */
const nextDiv = document.getElementById("nextMatch");
const gridDiv = document.getElementById("matchGrid");

const pitchModalOverlay = document.getElementById("pitchModalOverlay");
const pitchModalTitle = document.getElementById("pitchModalTitle");
const pitchModalDate = document.getElementById("pitchModalDate");
const pitchModalVenue = document.getElementById("pitchModalVenue");
const pitchModalType = document.getElementById("pitchModalType");
const closePitchModal = document.getElementById("closePitchModal");

const infoModalOverlay = document.getElementById("infoModalOverlay");
const infoModalTitle = document.getElementById("infoModalTitle");
const infoModalDate = document.getElementById("infoModalDate");
const infoModalVenue = document.getElementById("infoModalVenue");
const infoModalType = document.getElementById("infoModalType");
const closeInfoModal = document.getElementById("closeInfoModal");

const pitch = document.getElementById("pitch");
const playerListDiv = document.getElementById("playerList");
const removePlayerBtn = document.getElementById("removePlayerBtn");

/* =========================
   HELPERS
========================= */
function canEditLineup() {
  return userRole === "coach" || userRole === "assistantcoach";
}

function isPlayerReadOnly() {
  return userRole === "player";
}

function formatDateNorwegian(dateStr, timeStr) {
  const date = new Date(dateStr);

  const options = {
    weekday: "long",
    day: "numeric",
    month: "long"
  };

  let formatted = date.toLocaleDateString("no-NO", options);
  formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1);

  return `${formatted} kl ${timeStr}`;
}

function clearSelections() {
  selectedPlayerName = null;
  selectedLineupPlayer = null;
}

function clearDragState() {
  activePlayer = null;
  activeElement = null;
  isDragging = false;
}

function isPlayerOnPitch(player) {
  return currentLineup.some(p => p.name === player.name);
}

function updateReadOnlyUI() {
  if (!isPlayerReadOnly()) return;

  pitch.style.pointerEvents = "none";
  playerListDiv.style.pointerEvents = "none";
  pitch.style.opacity = "0.9";
  removePlayerBtn.style.display = "none";
  playerListDiv.style.display = "none";

  clearSelections();
  clearDragState();
}

function applyFormation() {
  const positions = FORMATIONS[currentFormation];
  if (!positions) return;

  const used = new Set();

  currentLineup.forEach(player => {

    let closestIndex = -1;
    let closestDist = Infinity;
	
	let bestTarget = null;

    positions.forEach((pos, index) => {
      if (used.has(index)) return;

let targets = pos.options || [pos];

// 🔥 hvis midtbane (4-3-3: index 5,6,7)
if (currentFormation === "4-3-3" && index >= 5 && index <= 7) {
  targets.push({
    x: pos.x,
    y: pos.y + 10 // defensiv versjon
  });
}

targets.forEach(t => {
  const dx = player.x - t.x;
  const dy = player.y - t.y;
  const dist = dx * dx + dy * dy;

  if (dist < closestDist) {
    closestDist = dist;
    closestIndex = index;
    bestTarget = t;
  }
});
    });

    if (closestIndex !== -1) {
      const pos = positions[closestIndex];

      player.x = bestTarget.x;
      player.y = bestTarget.y;

      used.add(closestIndex);
    }
  });

  renderLineup();
  saveLineup();
}

function getPitchPercentPosition(clientX, clientY) {
  const rect = pitch.getBoundingClientRect();

  let x = ((clientX - rect.left) / rect.width) * 100;
  let y = ((clientY - rect.top) / rect.height) * 100;

  x = Math.max(0, Math.min(100, x));
  y = Math.max(0, Math.min(100, y));

  return { x, y };
}

function highlightSelectedPlayerOnPitch() {
  pitch.querySelectorAll(".player-circle").forEach((circle) => {
    circle.style.boxShadow = "none";
  });

  if (!selectedLineupPlayer) return;

  const playerEls = pitch.querySelectorAll(".player");
  playerEls.forEach((el) => {
    if (el.dataset.playerName === selectedLineupPlayer.name) {
      const circle = el.querySelector(".player-circle");
      if (circle) {
        circle.style.boxShadow = "0 0 0 2px #facc15";
      }
    }
  });
}

function setupLoanPlayerUI() {
  const input = document.getElementById("loanPlayerInput");
  const btn = document.getElementById("addLoanPlayerBtn");

  if (!btn) {
    console.error("Fant ikke knapp");
    return;
  }

  btn.addEventListener("click", async () => {
    const name = input.value.trim();
    if (!name) return;

    await addLoanPlayerToMatch(activeMatchId, name);

    input.value = "";
  });
}

/* =========================
   FIRESTORE
========================= */
async function loadUserRole() {
  const user = auth.currentUser;
  if (!user) return;

  const snap = await getDoc(doc(db, "users", user.uid));
  userRole = (snap.data()?.role || "").toLowerCase().trim();

  console.log("Role:", userRole);
}

async function loadPlayers(matchId) {
  squad = [];

  // faste spillere
  const playersSnap = await getDocs(collection(db, "spillere"));
playersSnap.forEach((docSnap) => {
  const data = docSnap.data();
  if (data.navn) {
    squad.push({
      name: data.navn,
      isLoan: false
    });
  }
});

  // 🔥 lån
  if (matchId) {
    const loanPlayers = await loadLoanPlayers(matchId);

loanPlayers.forEach(player => {
  if (!squad.find(p => p.name === player.name)) {
    squad.push(player);
  }
});
  }

  console.log("SPILLERE:", squad);
}

async function saveLineup() {
  if (!activeMatchId) return;
  if (!canEditLineup()) return;

  try {
    await updateDoc(doc(db, "matches", activeMatchId), {
      lineup: currentLineup
    });
    console.log("Lineup lagret");
  } catch (err) {
    console.error("Feil ved lagring:", err);
  }
}

async function loadLoanPlayers(matchId) {
  if (!matchId) return [];

  const snap = await getDoc(doc(db, "matches", matchId));
  if (!snap.exists()) return [];

  const players = snap.data().players || {};

  return Object.entries(players).map(([id, p]) => ({
  name: p.name,
  isLoan: true
}));
}

async function removeLoanPlayer(matchId, playerName) {
  const snap = await getDoc(doc(db, "matches", matchId));
  if (!snap.exists()) return;

  const players = snap.data().players || {};

  let keyToDelete = null;

  Object.entries(players).forEach(([key, value]) => {
    if (value.name === playerName) {
      keyToDelete = key;
    }
  });

  if (!keyToDelete) return;

  // 🔥 1. Fjern fra Firestore
  await updateDoc(doc(db, "matches", matchId), {
    [`players.${keyToDelete}`]: deleteField()
  });

  // 🔥 2. Fjern fra banen (VIKTIG)
  currentLineup = currentLineup.filter(p => p.name !== playerName);

  // 🔥 3. Fjern selection hvis den var valgt
  if (selectedLineupPlayer?.name === playerName) {
    selectedLineupPlayer = null;
  }

  if (selectedPlayerName === playerName) {
    selectedPlayerName = null;
  }

  // 🔥 4. Oppdater UI
  await loadPlayers(matchId);
  renderLineup();
  renderPlayerList();

  // 🔥 5. Lagre lineup uten spilleren
  await saveLineup();
}

async function addLoanPlayerToMatch(matchId, name) {
  if (!matchId) {
    console.error("Ingen matchId");
    return;
  }

  const id = "loan_" + Date.now();

  await updateDoc(doc(db, "matches", matchId), {
    [`players.${id}`]: {
      name: name
    }
  });

  await loadPlayers(matchId);
  renderPlayerList();
}

/* =========================
   MODALS
========================= */
function setupModalHandlers() {
  closePitchModal.onclick = () => {
    pitchModalOverlay.classList.remove("show");
    clearSelections();
    clearDragState();
  };

  pitchModalOverlay.onclick = (e) => {
    if (e.target === pitchModalOverlay) {
      pitchModalOverlay.classList.remove("show");
      clearSelections();
      clearDragState();
    }
  };

  closeInfoModal.onclick = () => {
    infoModalOverlay.classList.remove("show");
  };

  infoModalOverlay.onclick = (e) => {
    if (e.target === infoModalOverlay) {
      infoModalOverlay.classList.remove("show");
    }
  };
}

async function openPitchModal(match) {
  activeMatchId = match.id;

  // 🔥 LAST SPILLERE FØRST
  await loadPlayers(match.id);

  pitchModalTitle.innerText = match.opponent || "";
  pitchModalDate.innerText = formatDateNorwegian(match.date, match.time);
  pitchModalVenue.innerText = match.venueName || "";
  pitchModalType.innerText =
    match.venueType === "away" ? "Borte" : "Hjemme";

  try {
    const snap = await getDoc(doc(db, "matches", match.id));
    const data = snap.data();

    currentLineup = data?.lineup || [];
    currentFormation = data?.formation || "4-3-3";

  } catch (err) {
    console.error("Feil ved henting:", err);
    currentLineup = [];
    currentFormation = "4-3-3";
  }

  updateFormationUI();

  // 🔥 RENDER ETTER ALT ER LASTET
  renderLineup();
  renderPlayerList();

  pitchModalOverlay.classList.add("show");
}

function openInfoModal(match) {
  infoModalTitle.innerText = match.opponent || "";
  infoModalDate.innerText = formatDateNorwegian(match.date, match.time);
  infoModalVenue.innerText = match.venueName || "";
  infoModalType.innerText = match.venueType === "away" ? "Borte" : "Hjemme";

  infoModalOverlay.classList.add("show");
}

/* =========================
   RENDER PLAYER LIST
========================= */
function createPlayerListItem(player) {
  const el = document.createElement("div");
  el.className = "player-item";

el.innerHTML = `
  <span class="player-name">${player.name}</span>
  ${player.isLoan ? '<button class="remove-loan">✕</button>' : ''}
`;

  if (player.isLoan) {
    el.querySelector(".remove-loan").onclick = (e) => {
      e.stopPropagation();
      removeLoanPlayer(activeMatchId, player.name);
    };
  }

  const onPitch = isPlayerOnPitch(player);
  el.style.background = onPitch ? "#16a34a" : "#7f1d1d";

  const isSelected =
    (selectedLineupPlayer && selectedLineupPlayer.name === player.name) ||
    selectedPlayerName === player.name;

  if (isSelected) {
    el.style.outline = "3px solid #facc15";
    el.style.boxShadow = "0 0 10px rgba(250,204,21,0.7)";
  }

  el.onclick = () => {
    if (isPlayerReadOnly()) return;

    const existing = currentLineup.find(p => p.name === player.name);

    if (existing) {
      selectedLineupPlayer = existing;
      selectedPlayerName = null;
    } else {
      selectedPlayerName = player.name;
      selectedLineupPlayer = null;
    }

    renderPlayerList();
    renderLineup();
  };

  return el;
}

function appendSection(titleText, names) {
  if (names.length === 0) return;

  const title = document.createElement("div");
  title.innerText = titleText;
  title.style.margin = titleText === "På banen" ? "8px 0 4px" : "12px 0 4px";
  title.style.fontWeight = "bold";

  playerListDiv.appendChild(title);

  names.forEach((name) => {
    playerListDiv.appendChild(createPlayerListItem(name));
  });
}

function renderPlayerList() {
  playerListDiv.innerHTML = "";

const onPitch = squad.filter(player => isPlayerOnPitch(player));
const bench = squad.filter(player => !isPlayerOnPitch(player));

  appendSection("På banen", onPitch);
  appendSection("Benk", bench);
}

/* =========================
   RENDER LINEUP
========================= */
function createPlayerElement(player) {
  const el = document.createElement("div");
  el.classList.add("player");
  el.dataset.playerName = player.name;

  el.style.position = "absolute";
  el.style.left = `${player.x}%`;
  el.style.top = `${player.y}%`;
  el.style.transform = "translate(-50%, -50%)";
  el.style.textAlign = "center";

  const firstName = player.name ? player.name.split(" ")[0] : "";
  const firstLetter = firstName[0] || "";

  el.innerHTML = `
    <div class="player-circle" style="
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #1e293b;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
    ">
      ${firstLetter}
    </div>
    <div style="font-size: 10px; margin-top: 2px;">
      ${firstName}
    </div>
  `;

  if (canEditLineup()) {
    el.addEventListener("mousedown", (e) => startDrag(e, player, el));
    el.addEventListener("touchstart", (e) => startDrag(e, player, el), {
      passive: false
    });
  }

  if (isPlayerReadOnly()) {
    el.style.pointerEvents = "none";
  }

  return el;
}

function renderLineup() {
  pitch.querySelectorAll(".player").forEach((el) => el.remove());

  if (!Array.isArray(currentLineup)) return;

  currentLineup.forEach((player) => {
    const el = createPlayerElement(player);
    pitch.appendChild(el);
  });

  highlightSelectedPlayerOnPitch();
}

/* =========================
   DRAG
========================= */
function startDrag(e, player, element) {
  if (!canEditLineup()) {
    clearDragState();
    return;
  }

  e.stopPropagation();
  e.preventDefault();

  // Swap hvis en benkspiller er valgt og du trykker på en spiller på banen
  if (selectedPlayerName) {
    const index = currentLineup.indexOf(player);

    if (index !== -1) {
      currentLineup[index] = {
        name: selectedPlayerName,
        x: player.x,
        y: player.y
      };

      clearSelections();
      renderLineup();
      renderPlayerList();
      saveLineup();
    }

    return;
  }

  activePlayer = player;
  activeElement = element;
  isDragging = true;

  selectedLineupPlayer = player;
  selectedPlayerName = null;

  renderPlayerList();
  highlightSelectedPlayerOnPitch();
}

function handleMove(clientX, clientY) {
  if (!canEditLineup()) return;
  if (!activePlayer || !activeElement) return;

  const { x, y } = getPitchPercentPosition(clientX, clientY);

  activeElement.style.left = `${x}%`;
  activeElement.style.top = `${y}%`;

  activePlayer.x = x;
  activePlayer.y = y;
  
  const SNAP_DISTANCE = 5; // prosent

const positions = FORMATIONS[currentFormation];

positions.forEach(pos => {
  const targets = pos.options || [pos];

  targets.forEach(t => {
    const dx = x - t.x;
    const dy = y - t.y;

    if (Math.sqrt(dx*dx + dy*dy) < SNAP_DISTANCE) {
      activePlayer.x = t.x;
      activePlayer.y = t.y;

      activeElement.style.left = t.x + "%";
      activeElement.style.top = t.y + "%";
    }
  });
});
}

function endDrag() {
  if (!canEditLineup()) {
    clearDragState();
    return;
  }

  if (activePlayer) {
    saveLineup();
  }

  clearDragState();
}

/* =========================
   PITCH INTERACTION
========================= */
function handlePitchMouseDown(e) {
  if (!canEditLineup()) {
    clearSelections();
    return;
  }

  if (!pitchModalOverlay.classList.contains("show")) return;

  const clickedPlayerEl = e.target.closest(".player");
  if (clickedPlayerEl) return;

  const { x, y } = getPitchPercentPosition(e.clientX, e.clientY);

  // 1) Flytt valgt spiller fra banen
  if (selectedLineupPlayer) {
    selectedLineupPlayer.x = x;
    selectedLineupPlayer.y = y;

    selectedLineupPlayer = null;

    renderLineup();
    renderPlayerList();
    saveLineup();
    return;
  }

  // 2) Legg til eller flytt valgt spiller fra lista
  if (selectedPlayerName) {
    const existingPlayer = currentLineup.find(
      (player) => player.name === selectedPlayerName
    );

    if (existingPlayer) {
      existingPlayer.x = x;
      existingPlayer.y = y;
    } else {
      if (currentLineup.length >= 11) {
        alert("Du kan kun ha 11 spillere på banen");
        return;
      }

      currentLineup.push({
        name: selectedPlayerName,
        x,
        y
      });
    }

    selectedPlayerName = null;

    renderLineup();
    renderPlayerList();
    saveLineup();
    return;
  }

  // 3) Ellers bare fjern markering
  clearSelections();
  renderLineup();
  renderPlayerList();
}

function setupPitchInteractions() {
  pitch.addEventListener("mousedown", handlePitchMouseDown);

  document.addEventListener("mousemove", (e) => {
    if (!activePlayer) return;
    handleMove(e.clientX, e.clientY);
  });

  document.addEventListener(
    "touchmove",
    (e) => {
      if (!activePlayer) return;
      e.preventDefault();

      const touch = e.touches[0];
      handleMove(touch.clientX, touch.clientY);
    },
    { passive: false }
  );

  document.addEventListener("mouseup", endDrag);
  document.addEventListener("touchend", endDrag);
}

/* =========================
   REMOVE PLAYER
========================= */
function setupRemovePlayerButton() {
  removePlayerBtn.addEventListener("click", () => {
    if (!canEditLineup()) return;

    if (!selectedLineupPlayer) {
      alert("Velg en spiller på banen først");
      return;
    }

    currentLineup = currentLineup.filter(
      (player) => player !== selectedLineupPlayer
    );

    selectedLineupPlayer = null;

    renderLineup();
    renderPlayerList();
    saveLineup();
  });
}

/* =========================
   MATCHES
========================= */
async function loadMatches() {
  const today = new Date().toISOString().split("T")[0];

  const q = query(
    collection(db, "matches"),
    where("meta.date", ">=", today),
    orderBy("meta.date")
  );

  const snap = await getDocs(q);
  const matches = [];

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const meta = data.meta || {};

    matches.push({
      id: docSnap.id,
      ...meta
    });
  });

  if (matches.length === 0) {
    nextDiv.innerHTML = `
      <div class="next-card">
        <h2>Ingen kommende kamper</h2>
      </div>
    `;
    return;
  }

  const next = matches[0];

  nextDiv.innerHTML = `
    <div class="next-card">
      <h2>${next.opponent || ""}</h2>
      <p>${next.date || ""} kl ${next.time || ""}</p>
      <p>${next.venueName || ""}</p>
      <p>${next.venueType === "away" ? "Borte" : "Hjemme"}</p>
    </div>
  `;

  nextDiv.onclick = () => openPitchModal(next);

  matches.forEach((match, index) => {
    if (index === 0) return;

    const div = document.createElement("div");
    div.className = "match-card";

    div.innerHTML = `
      <strong>${match.opponent || ""}</strong>
      <span>${formatDateNorwegian(match.date, match.time)}</span>
    `;

    div.onclick = () => openInfoModal(match);
    gridDiv.appendChild(div);
  });
}

/* =========================
   INIT
========================= */
async function init() {
  setupModalHandlers();
  setupPitchInteractions();
  setupRemovePlayerButton();
  setupLoanPlayerUI();
  await loadPlayers();
  await loadUserRole();

  updateReadOnlyUI();
  renderPlayerList();

  await loadMatches();
}

await init();

const formationEl = document.getElementById("formationDisplay");

let currentFormation = "4-3-3";

function updateFormationUI() {
  formationEl.innerText = currentFormation;

  if (!canEditLineup()) {
    formationEl.classList.add("locked");
  } else {
    formationEl.classList.remove("locked");
  }
}

formationEl.onclick = () => {
  if (!canEditLineup()) return;

  const newFormation = prompt(
    "Velg formasjon (4-3-3 / 4-4-2):",
    currentFormation
  );

  if (!newFormation || !FORMATIONS[newFormation]) return;

  currentFormation = newFormation;

  updateFormationUI();
  applyFormation(); // 🔥 DETTE ER NØKKELEN

  if (activeMatchId) {
    updateDoc(doc(db, "matches", activeMatchId), {
      formation: currentFormation
    });
  }
};

window.goBack = function () {
  window.location.href = "fremside.html";
};