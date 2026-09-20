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
  deleteField,
  addDoc,
  serverTimestamp
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
  ],

  "4-5-1": [
    { x: 50, y: 93 },

    { x: 15, y: 75 },
    { x: 38, y: 80 },
    { x: 62, y: 80 },
    { x: 85, y: 75 },

    { x: 12, y: 48 },
    { x: 31, y: 54 },
    { x: 50, y: 58 },
    { x: 69, y: 54 },
    { x: 88, y: 48 },

    { x: 50, y: 22 }
  ]
};

const DEFAULT_451_PLAYER_NAMES = [
  "Thage",
  "Gabriel", "Ask", "Martin", "Brage",
  "Liam", "Lars", "Nicolai", "Snorre", "Lukas",
  "Noah"
];

function buildDefault451Lineup() {
  const positions = FORMATIONS["4-5-1"];

  return DEFAULT_451_PLAYER_NAMES.map((firstName, index) => {
    const player = squad.find(candidate =>
      String(candidate?.name || "")
        .trim()
        .split(/\s+/)[0]
        .toLocaleLowerCase("no") === firstName.toLocaleLowerCase("no")
    );

    if (!player) return null;

    return {
      id: player.id,
      name: player.name,
      x: positions[index].x,
      y: positions[index].y
    };
  }).filter(Boolean);
}

/* =========================
   DOM
========================= */
const nextDiv = document.getElementById("nextMatch");
const gridDiv = document.getElementById("matchGrid");
const matchCount = document.getElementById("matchCount");

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
const newMatchBtn = document.getElementById("newMatchBtn");
const newMatchOverlay = document.getElementById("newMatchOverlay");
const newMatchForm = document.getElementById("newMatchForm");
const closeNewMatch = document.getElementById("closeNewMatch");
const cancelNewMatch = document.getElementById("cancelNewMatch");

/* =========================
   HELPERS
========================= */
function canEditLineup() {
  return userRole === "coach" || userRole === "assistantcoach";
}

function isPlayerReadOnly() {
  return userRole === "player";
}

function getMatchTime(match) {
  return String(match?.time || match?.startTime || "").trim();
}

function safeDate(dateStr) {
  if (!dateStr) return null;
  const date = new Date(`${dateStr}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDateNorwegian(dateStr, timeStr) {
  const date = safeDate(dateStr);
  if (!date) return "Dato ikke satt";

  const formatted = date.toLocaleDateString("no-NO", {
    weekday: "long",
    day: "numeric",
    month: "long"
  });

  const label = formatted.charAt(0).toUpperCase() + formatted.slice(1);
  return timeStr ? `${label} kl ${timeStr}` : label;
}

function formatCardDate(dateStr) {
  const date = safeDate(dateStr);
  if (!date) return { day: "–", month: "DATO" };

  return {
    day: date.toLocaleDateString("no-NO", { day: "numeric" }),
    month: date.toLocaleDateString("no-NO", { month: "short" })
      .replace(".", "")
      .toLocaleUpperCase("no-NO")
  };
}

function formatNextDate(dateStr) {
  const date = safeDate(dateStr);
  if (!date) return "Ikke satt";

  return date.toLocaleDateString("no-NO", {
    weekday: "short",
    day: "numeric",
    month: "short"
  }).replace(".", "");
}

function fixtureTeams(match) {
  const ourTeam = match.ourTeam || "Samnanger";
  const opponent = match.opponent || "Motstander";
  const away = match.venueType === "away";

  return away
    ? { home: opponent, away: ourTeam }
    : { home: ourTeam, away: opponent };
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = String(value ?? "");
  return element.innerHTML;
}

function localDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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


function openNewMatchModal(){
  if(userRole && !canEditLineup()) return;
  newMatchForm.reset();
  document.getElementById("newMatchDate").value=localDateString();
  document.getElementById("newMatchType").value="Seriekamp";
  document.getElementById("newMatchVenueType").value="home";
  newMatchOverlay.classList.add("open");
  document.body.classList.add("modalOpen");
  setTimeout(()=>document.getElementById("newMatchOpponent").focus(),50);
}
function closeNewMatchModal(){
  newMatchOverlay.classList.remove("open");
  document.body.classList.remove("modalOpen");
}
async function createMatch(e){
  e.preventDefault();
  const opponent=document.getElementById("newMatchOpponent").value.trim();
  const date=document.getElementById("newMatchDate").value;
  const time=document.getElementById("newMatchTime").value;
  const venueType=document.getElementById("newMatchVenueType").value;
  const venueName=document.getElementById("newMatchVenue").value.trim();
  const type=document.getElementById("newMatchType").value.trim()||"Seriekamp";
  if(!opponent||!date||!time) return;
  const btn=document.getElementById("saveNewMatch");btn.disabled=true;btn.textContent="Lagrer…";
  try{
    await addDoc(collection(db,"matches"),{meta:{ourTeam:"Samnanger",opponent,date,time,startTime:time,venueType,venueName,type},lineup:[],players:{},createdAt:serverTimestamp(),createdBy:auth.currentUser?.uid||null});
    closeNewMatchModal();
    await loadMatches();
  }catch(err){console.error("createMatch:",err);alert("Kunne ikke opprette kampen: "+(err.message||"ukjent feil"))}
  finally{btn.disabled=false;btn.textContent="Opprett kamp"}
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
		  id: docSnap.id,
      name: data.navn,
      isLoan: false,
      present: true // 🔥 default
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
    const squadByName = new Map(
      squad.map(player => [
        String(player.name || "").trim().split(/\s+/)[0].toLocaleLowerCase("no"),
        player
      ])
    );

    // En spiller som ikke er i kamptroppen kan aldri bli liggende på banen.
    currentLineup = currentLineup.filter(lineupPlayer => {
      const squadPlayer = squadByName.get(
        String(lineupPlayer.name || "").trim().split(/\s+/)[0].toLocaleLowerCase("no")
      );
      return squadPlayer && squadPlayer.present !== false;
    });

    // 🔥 bygg players-objekt
    const playersData = {};

    squad.forEach(player => {
      const id = player.id;  // evt bruk ekte id hvis du har
      playersData[id] = {
        name: player.name,
        present: player.present !== false,
        starter: isPlayerOnPitch(player),
        isLoan: player.isLoan === true
      };
    });

    await updateDoc(doc(db, "matches", activeMatchId), {
      lineup: currentLineup,
      players: playersData, // 🔥 NY
      formation: currentFormation,
      onField: deleteField(),
      lineupConfirmed: currentLineup.length === 11
    });

    console.log("Lineup + players lagret");
  } catch (err) {
    console.error("Feil ved lagring:", err);
  }
}

async function loadLoanPlayers(matchId) {
  if (!matchId) return [];

  const snap = await getDoc(doc(db, "matches", matchId));
  if (!snap.exists()) return [];

  const players = snap.data().players || {};

  return Object.entries(players)
    .filter(([id, p]) => id.startsWith("loan_") || p.isLoan === true)
    .map(([id, p]) => ({
      id,
      name: p.name,
      isLoan: true,
      present: p.present !== false
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
      name: name,
      isLoan: true,
      present: true
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
  let initializedDefaultLineup = false;

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

  const hasSavedLineup = Array.isArray(data?.lineup);

  if (hasSavedLineup) {
    currentLineup = data.lineup;
    currentFormation = data?.formation || "4-3-3";
  } else {
    currentFormation = "4-5-1";
    currentLineup = buildDefault451Lineup();
    initializedDefaultLineup =
      currentLineup.length === DEFAULT_451_PLAYER_NAMES.length;

    if (!initializedDefaultLineup) {
      console.warn("Standardoppstillingen mangler én eller flere spillere.");
    }
  }

  // 🔥 HER ↓↓↓
  if (data?.players) {
    const savedPlayers = Object.values(data.players);
    squad.forEach(player => {
      const playerKey = String(player.name || "")
        .trim()
        .split(/\s+/)[0]
        .toLocaleLowerCase("no");
      const saved = data.players?.[player.id] || savedPlayers.find(candidate =>
        String(candidate?.name || "")
          .trim()
          .split(/\s+/)[0]
          .toLocaleLowerCase("no") === playerKey
      );

      if (saved) {
        player.present = saved.present !== false;
      }
    });
  }

} catch (err) {
	
    console.error("Feil ved henting:", err);
    currentLineup = [];
    currentFormation = "4-3-3";
  }

  updateFormationUI();

  if (initializedDefaultLineup && canEditLineup()) {
    await saveLineup();
  }

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

  const isAlreadySelected =
    selectedPlayerName === player.name ||
    selectedLineupPlayer?.name === player.name;

  // 🔥 Hvis trykker på samme spiller igjen → toggle present
  if (isAlreadySelected && !player.isLoan) {

    player.present = !player.present;

    if (!player.present) {
      currentLineup = currentLineup.filter(p => p.name !== player.name);
    }

    selectedPlayerName = null;
    selectedLineupPlayer = null;

    renderPlayerList();
    renderLineup();
	
	  saveLineup();
	  
    return;
  }

  // 🔥 Vanlig select
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

if (player.present === false) {
  el.style.opacity = "0.4";
  el.style.textDecoration = "line-through";
}
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

const bench = squad
  .filter(player => !isPlayerOnPitch(player))
  .sort((a, b) => {
    // 🔥 ikke tilstede nederst
    if (a.present === false && b.present !== false) return 1;
    if (a.present !== false && b.present === false) return -1;
    return 0;
  });

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

  const playerObj = squad.find(p => p.name === selectedPlayerName);

  if (!playerObj?.present) {
    alert("Spilleren er ikke tilstede");
    return;
  }
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
  const today = localDateString();

  nextDiv.onclick = null;
  gridDiv.innerHTML = "";

  try {
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
        ...meta,
        time: getMatchTime(meta)
      });
    });

    matches.sort((a, b) => {
      const first = `${a.date || ""}T${getMatchTime(a) || "00:00"}`;
      const second = `${b.date || ""}T${getMatchTime(b) || "00:00"}`;
      return first.localeCompare(second);
    });

    if (matches.length === 0) {
      nextDiv.innerHTML = `
        <div class="emptyState">
          <strong>Ingen kommende kamper</strong>
          <span>Når en ny kamp registreres, vises den her.</span>
        </div>
      `;
      if (matchCount) matchCount.textContent = "0 kamper";
      gridDiv.innerHTML = `
        <div class="emptyState">
          <span>Kampplanen er tom.</span>
        </div>
      `;
      return;
    }

    const next = matches[0];
    const nextTeams = fixtureTeams(next);
    const nextTime = getMatchTime(next) || "Ikke satt";
    const nextVenue = next.venueName || "Sted ikke satt";
    const nextIsAway = next.venueType === "away";

    nextDiv.innerHTML = `
      <button class="next-card" type="button" aria-label="Åpne lagoppstillingen mot ${escapeHtml(next.opponent || "motstander")}">
        <div class="nextCardTop">
          <span class="nextLabel">NESTE KAMP</span>
          <span class="venueBadge ${nextIsAway ? "away" : ""}">
            ${nextIsAway ? "Bortekamp" : "Hjemmekamp"}
          </span>
        </div>

        <div class="fixture">
          <div class="team">
            <span class="teamCrest" aria-hidden="true">⚽</span>
            <strong>${escapeHtml(nextTeams.home)}</strong>
          </div>
          <span class="versus">MOT</span>
          <div class="team awayTeam">
            <span class="teamCrest" aria-hidden="true">🛡️</span>
            <strong>${escapeHtml(nextTeams.away)}</strong>
          </div>
        </div>

        <div class="matchMetaGrid">
          <div class="matchMeta">
            <small>Dato</small>
            <strong>${escapeHtml(formatNextDate(next.date))}</strong>
          </div>
          <div class="matchMeta">
            <small>Tid</small>
            <strong>${escapeHtml(nextTime)}</strong>
          </div>
          <div class="matchMeta">
            <small>Sted</small>
            <strong>${escapeHtml(nextVenue)}</strong>
          </div>
        </div>

        <div class="nextAction">
          <span>Åpne lagoppstilling</span>
          <span aria-hidden="true">→</span>
        </div>
      </button>
    `;

    nextDiv.querySelector(".next-card").onclick = () => openPitchModal(next);

    const laterMatches = matches.slice(1);
    if (matchCount) {
      matchCount.textContent = `${laterMatches.length} ${laterMatches.length === 1 ? "kamp" : "kamper"}`;
    }

    if (laterMatches.length === 0) {
      gridDiv.innerHTML = `
        <div class="emptyState">
          <span>Ingen flere kamper er registrert.</span>
        </div>
      `;
      return;
    }

    laterMatches.forEach((match) => {
      const date = formatCardDate(match.date);
      const teams = fixtureTeams(match);
      const time = getMatchTime(match) || "–";
      const location = match.venueName || "Sted ikke satt";
      const type = match.venueType === "away" ? "Bortekamp" : "Hjemmekamp";

      const button = document.createElement("button");
      button.type = "button";
      button.className = "match-card";
      button.innerHTML = `
        <span class="dateBadge">
          <strong>${escapeHtml(date.day)}</strong>
          <small>${escapeHtml(date.month)}</small>
        </span>
        <span class="matchCardMain">
          <small>${type}</small>
          <strong>${escapeHtml(teams.home)} – ${escapeHtml(teams.away)}</strong>
          <span>${escapeHtml(location)}</span>
        </span>
        <span class="matchCardRight">
          <span class="matchTime">${escapeHtml(time)}</span>
          <span class="matchChevron" aria-hidden="true">›</span>
        </span>
      `;

      button.onclick = () => openInfoModal(match);
      gridDiv.appendChild(button);
    });
  } catch (error) {
    console.error("Kunne ikke laste kamper:", error);
    nextDiv.innerHTML = `
      <div class="errorState">
        <strong>Kunne ikke laste kampene</strong>
        <span>Prøv å åpne siden på nytt.</span>
      </div>
    `;
    if (matchCount) matchCount.textContent = "Feil";
    gridDiv.innerHTML = "";
  }
}

if(newMatchBtn)newMatchBtn.addEventListener("click",openNewMatchModal);
if(closeNewMatch)closeNewMatch.addEventListener("click",closeNewMatchModal);
if(cancelNewMatch)cancelNewMatch.addEventListener("click",closeNewMatchModal);
if(newMatchForm)newMatchForm.addEventListener("submit",createMatch);
if(newMatchOverlay)newMatchOverlay.addEventListener("click",e=>{if(e.target===newMatchOverlay)closeNewMatchModal()});
document.addEventListener("keydown",e=>{if(e.key==="Escape"&&newMatchOverlay?.classList.contains("open"))closeNewMatchModal()});

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
    "Velg formasjon (4-3-3 / 4-4-2 / 4-5-1):",
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

const params = new URLSearchParams(window.location.search);
const matchId = params.get("matchId");
const openLineup = params.get("openLineup");

if (matchId && openLineup) {
  const snap = await getDoc(doc(db, "matches", matchId));
  if (snap.exists()) {
    const data = snap.data();

    openPitchModal({
      id: matchId,
      opponent: data.meta?.opponent,
      date: data.meta?.date,
      time: data.meta?.time,
      venueName: data.meta?.venueName,
      venueType: data.meta?.venueType
    });
  }
}

window.goBack = function () {
  if (window.history.length > 1) {
    window.history.back();
  } else {
    window.location.href = "fremside.html";
  }
};

