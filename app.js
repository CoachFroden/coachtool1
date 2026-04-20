import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
  query,
  where,
  onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";


import {
  getAuth,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAKZMu2HZPmmoZ1fFT7DNA9Q6ystbKEPgE",
  authDomain: "samnanger-g14-f10a1.firebaseapp.com",
  projectId: "samnanger-g14-f10a1",
  storageBucket: "samnanger-g14-f10a1.firebasestorage.app",
  messagingSenderId: "926427862844",
  appId: "1:926427862844:web:eeb814a349e9bfd701b039"
};

initializeApp(firebaseConfig);
const auth = getAuth();

const db = getFirestore();

async function safeSetDoc(ref, data, options = {}) {
  try {
    if (!ref) {
      console.warn("❌ Mangler docRef – lagring hoppet over");
      return false;
    }

    await setDoc(ref, data, options);
    return true;

  } catch (error) {
    console.error("🔥 Firestore setDoc feil:", error);
    alert("Noe gikk galt ved lagring. Prøv igjen.");
    return false;
  }
}

let matchStarted = false;
let isSquadModalOpen = false;

function getMatchIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("matchId");
}

function getMatchRef() {
  const user = auth.currentUser;

  if (!user) {
    throw new Error("❌ getMatchRef: user mangler");
  }

  if (!matchState.userRole) {
    throw new Error("❌ getMatchRef: userRole mangler");
  }

  if (!matchState.matchId) {
    throw new Error("❌ getMatchRef: matchId mangler");
  }

  if (matchState.userRole === "coach") {
    return doc(db, "matches", matchState.matchId);
  }

  return doc(
    db,
    "assistantMatches",
    user.uid,
    "matches",
    matchState.matchId
  );
}

function setLoginLoading(isLoading) {
  const loginBtn = document.getElementById("loginBtn");
  const registerBtn = document.getElementById("registerBtn");

  if (loginBtn) loginBtn.disabled = isLoading;
  if (registerBtn) registerBtn.disabled = isLoading;

  if (isLoading) {
    setLoginMessage("Jobber…");
  }
}


/* ======================================================
   GLOBAL MATCH STATE
   ====================================================== */

const matchState = {
  meta: {
    ourTeam: "",
    opponent: "",
    date: "",
    startTime: "",
    halfLengthMin: 35,
    venue: "home",	// ✅ riktig
	type: "league"
  },

  status: "NOT_STARTED",
  period: 1,
  lineupConfirmed: false,

 timer: {
  elapsedMs: 0,
  startTimestamp: null
},

  score: {
    our: 0,
    their: 0
  },

  squad: {
    onField: {
      home: [],
      away: []
    }
  },

  players: {
    home: {}
  },

  events: []
};

function isReadyForFirestore() {
  return auth.currentUser && matchState.userRole && matchState.matchId;
}

function createPlayer({ id, name }) {
  return {
    id,
    name,
    present: true,
    starter: false,
    intervals: [],
    cards: []
  };
}

/* ======================================================
   ELEMENT REFERENCES
   ====================================================== */
   
const HOME_SQUAD = [
  { id: "h1", name: "Ask" },
  { id: "h2", name: "Brage" },
  { id: "h3", name: "Gabriel" },
  { id: "h4", name: "Lars" },
  { id: "h5", name: "Liam" },
  { id: "h6", name: "Lukas" },
  { id: "h7", name: "Martin" },
  { id: "h8", name: "Nicolai" },
  { id: "h9", name: "Nytveit" },
  { id: "h10", name: "Noah" },
  { id: "h11", name: "Oliver" },
  { id: "h12", name: "Snorre" },
  { id: "h13", name: "Sondre" },
  { id: "h14", name: "Sverre" },
  { id: "h15", name: "Thage" },
  { id: "h16", name: "Theodor" },
  { id: "h17", name: "Torvald" },
 // { id: "h18", name: "William" },
 //{ id: "h19", name: "Lån 1" },
 // { id: "h20", name: "Lånespiller 2" },
 // { id: "h21", name: "Lånespiller 3" },
 // { id: "h22", name: "Lånespiller 4" },
 // { id: "h23", name: "Lånespiller 5" },
 // { id: "h24", name: "Lånespiller 6" },
 // { id: "h25", name: "Lånespiller 7" }
];

  const MAX_STARTERS = 11;
  
  function requireLineupConfirmed() {
  if (!matchState.lineupConfirmed) {
    alert("Du må lagre startellever/spillertropp før du kan registrere hendelser.");
    return false;
  }
  return true;
}

const homeTeamInput = document.getElementById("homeTeam");
const awayTeamInput = document.getElementById("awayTeam");
const dateInput = document.getElementById("matchDate");
const timeInput = document.getElementById("matchTime");
const halfLengthInput = document.getElementById("halfLength");
const matchTypeInput = document.getElementById("matchType");


const startBtn = document.getElementById("startBtn");
const pauseBtn = document.getElementById("pauseBtn");
const resumeBtn = document.getElementById("resumeBtn");
const endBtn = document.getElementById("endBtn");

const eventList = document.getElementById("eventList");
const periodIndicator = document.getElementById("period-indicator");

const ourGoalBtn = document.getElementById("ourGoalBtn");
const theirGoalBtn = document.getElementById("theirGoalBtn");

const goalModal = document.getElementById("goalModal");
const confirmGoalBtn = document.getElementById("confirmGoalBtn");
const cancelGoalBtn = document.getElementById("cancelGoalBtn");
const manualGoalTimeInput = document.getElementById("manualGoalTime");

const homeScorerWrapper = document.getElementById("homeScorerWrapper");

const opponentScorerWrapper = document.getElementById("opponentScorerWrapper");

const opponentScorerInput = document.getElementById("opponentScorerInput");

const goalScorerSelect = document.getElementById("goalScorer");
const matchControls = document.getElementById("matchControls");
const newMatchBtn = document.getElementById("newMatchBtn");

const preMatch = document.getElementById("preMatchMeta");
const startScreen = document.getElementById("startScreen");
const matchUI = document.getElementById("matchUI");
const eventLog = document.getElementById("event-log");
const teams = document.querySelector(".teams");
  const clockSection = document.getElementById("clock-section");
const actionCard = document.getElementById("action-card"); 
  
  const loanBtn = document.getElementById("loanPlayersBtn");
const loanModal = document.getElementById("loanModal");
const loanCountInput = document.getElementById("loanCountInput");
const loanNamesContainer = document.getElementById("loanNamesContainer");

const cancelLoanBtn = document.getElementById("cancelLoanBtn");
const confirmLoanBtn = document.getElementById("confirmLoanBtn");

loanBtn.addEventListener("click", () => {
  loanModal.classList.remove("hidden");
});

cancelLoanBtn.addEventListener("click", () => {
  loanModal.classList.add("hidden");
});

loanCountInput.addEventListener("change", () => {
  const count = Number(loanCountInput.value) || 0;

  loanNamesContainer.innerHTML = "";

  for (let i = 0; i < count; i++) {
    const input = document.createElement("input"); // 🔥 DENNE MANGLER
    input.type = "text";
    input.placeholder = `Navn lånespiller ${i + 1}`;
    input.className = "loanNameInput input-modern";

    loanNamesContainer.appendChild(input);
  }
});

confirmLoanBtn.addEventListener("click", () => {
  const inputs = document.querySelectorAll(".loanNameInput");

  inputs.forEach((input, index) => {
    const name = input.value.trim();
    if (!name) return;

    const id = "loan_" + Date.now() + "_" + index;

matchState.players.home[id] = createPlayer({ id, name });

    // legg til i squad (ikke automatisk på banen)
  });
  sanitizePlayers();

  openSquadModal(); // 🔥 viktig – oppdater UI

  loanModal.classList.add("hidden");
});

function populateGoalScorers(team) {
  goalScorerSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Velg spiller";
  goalScorerSelect.appendChild(placeholder);

  if (team !== "home") return;

  const onField = matchState.squad.onField.home;

  Object.values(matchState.players.home)
    .filter(p => p && p.id && isOnField(p.id))
    .forEach(player => {
      const opt = document.createElement("option");
      opt.value = player.id;
      opt.textContent = player.name;
      goalScorerSelect.appendChild(opt);
    });
}

let pendingGoalTeam = null;

/* ======================================================
   STATE HELPERS
   ====================================================== */
function startClock() {
  if (clockInterval) return;

  clockInterval = setInterval(() => {
    if (matchState.status !== "LIVE") return;

    const now = Date.now();
    const currentElapsed =
      matchState.timer.elapsedMs +
      (now - matchState.timer.startTimestamp);
	  matchState.currentElapsed = currentElapsed;

    const baseMs =
      matchState.period === 1
        ? getHalfLengthMs()
        : getHalfLengthMs() * 2;

    const overtimeMs = Math.max(0, currentElapsed - baseMs);

    // ✅ DENNE LINJEN VAR DET SOM MANGLER
    const clockEl = document.getElementById("game-clock");

    if (overtimeMs > 0) {
      clockEl.innerHTML =
        formatTime(baseMs) +
        ` <span class="overtime">(+${formatTime(overtimeMs)})</span>`;
    } else {
      clockEl.textContent = formatTime(currentElapsed);
    }

  }, 1000);
}

async function findLiveMatch() {
  const user = auth.currentUser;
  if (!user) return null;

  // 🔍 Coach-kamper (men kun dine)
  const coachSnap = await getDocs(
    query(
      collection(db, "matches"),
      where("ownerUid", "==", user.uid),
      where("status", "in", ["LIVE", "PAUSED"])
    )
  );

  if (!coachSnap.empty) {
    return coachSnap.docs[0];
  }

  // 🔍 Assistant-kamper (kun dine)
  const assistantSnap = await getDocs(
    query(
      collection(db, "assistantMatches", user.uid, "matches"),
      where("status", "in", ["LIVE", "PAUSED"])
    )
  );

  if (!assistantSnap.empty) {
    return assistantSnap.docs[0];
  }

  return null;
}
   
 function getCurrentMatchTimeMs() {
  if (matchState.status !== "LIVE") {
    return matchState.timer.elapsedMs;
  }

  return (
    matchState.timer.elapsedMs +
    (Date.now() - matchState.timer.startTimestamp)
  );
}

function updateScoreboard() {
  document.getElementById("ourScore").textContent =
    matchState.score.our;

  document.getElementById("theirScore").textContent =
    matchState.score.their;
}

function registerGoal(team, timeMs, scorerData) {
  if (matchState.status !== "LIVE") return;

  const minuteText = formatMatchMinute(timeMs);

if (team === "home") {
  addOurGoal();

  const player = matchState.players.home[scorerData.id];
  if (!player) return;

addEvent({
  type: "goal",
  team: "home",
  playerId: player.id,
  playerName: player.name,
  minute: minuteText,
  text: `⚽ ${minuteText} – ${player.name} (${matchState.meta.ourTeam})`
});

}

  if (team === "away") {
    addTheirGoal();

    const label = scorerData.text
      ? scorerData.text
      : "Ukjent spiller";

addEvent({
  type: "goal",
  team: "away",
  playerId: scorerData.id ?? null,
  playerName: label,
  minute: minuteText,
  text: `⚽ ${minuteText} – ${label} (${matchState.meta.opponent})`
});

  }

  updateScoreboard();
}
   
 function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

let clockInterval = null;
let playingTimeInterval = null;

function stopClock() {
  clearInterval(clockInterval);
  clockInterval = null;
}

function readMatchMetaFromUI() {
  matchState.meta.ourTeam =
    homeTeamInput.value.trim() || "Samnanger";

  matchState.meta.opponent =
    awayTeamInput.value.trim();

  matchState.meta.date = dateInput.value;
  matchState.meta.startTime = timeInput.value;

  const half = Number(halfLengthInput.value);
  matchState.meta.halfLengthMin =
    Number.isFinite(half) && half > 0 ? half : 35;

  const typeSelect = document.getElementById("matchType");
  matchState.meta.type = typeSelect ? typeSelect.value : "league";
}

const cardHomeWrapper =
  document.getElementById("cardHomeWrapper");
const cardAwayWrapper =
  document.getElementById("cardAwayWrapper");
const cardOpponentInput =
  document.getElementById("cardOpponentInput");


function lockMatchMetaInputs() {
  homeTeamInput.disabled = true;
  awayTeamInput.disabled = true;
  dateInput.disabled = true;
  timeInput.disabled = true;
  halfLengthInput.disabled = true;
}

function updateControls() {
  // Skjul hovedknapper
  startBtn.style.display = "none";
  pauseBtn.style.display = "none";
  resumeBtn.style.display = "none";
  endBtn.style.display = "none";

if (
  ["NOT_STARTED", "UPCOMING"].includes(matchState.status) &&
  matchState.lineupConfirmed
) {
  startBtn.style.display = "block";
}

  if (matchState.status === "LIVE" && matchState.period === 1) {
    pauseBtn.style.display = "block";
  }

  if (matchState.status === "PAUSED") {
    resumeBtn.style.display = "block";
  }

  if (matchState.status === "LIVE" && matchState.period === 2) {
    endBtn.style.display = "block";
  }

  // ✅ RIKTIG: aktiver/deaktiver ALLE målknapper via class
  document.querySelectorAll(".goalBtn").forEach(btn => {
    btn.disabled = matchState.status !== "LIVE";
  });
  

// 👇 LEGG DETTE HER
if (matchState.status === "ENDED") {
  matchControls.style.display = "none";
  newMatchBtn.classList.remove("hidden");
} else {
  matchControls.style.display = "block";
  newMatchBtn.classList.add("hidden");
}
}

function updateUIByStatus() {

  startScreen.style.display = "none";

  if (matchState.status === "NOT_STARTED") {
    preMatch.classList.remove("hidden");
    matchUI.classList.add("hidden");
  }

  if (matchState.status === "UPCOMING") {
    preMatch.classList.remove("hidden");
    matchUI.classList.remove("hidden");
	teams.style.display = "flex";
    actionCard.style.display = "none";
    clockSection.style.display = "none";
    matchControls.style.display = "block";
   // events.style.display = "none";
   // extraEvents.style.display = "none";
    eventLog.style.display = "none";
  }

  if (matchState.status === "LIVE" || matchState.status === "PAUSED") {
    preMatch.classList.add("hidden");
    matchUI.classList.remove("hidden");
	teams.style.display = "flex";

    clockSection.style.display = "block";
    matchControls.style.display = "block";
    actionCard.style.display = "block";
    eventLog.style.display = "block";
  }
}

function startPlayingTime() {
  const startMs = 0;

  matchState.squad.onField.home.forEach(playerId => {
    const player = matchState.players.home[playerId];

    // nullstill intervaller eksplisitt
    player.intervals = [];

    player.intervals.push({
      in: startMs,
      out: null
    });
  });
}

function isOnField(playerId) {
  return matchState.squad.onField.home.includes(playerId);
}

function addToField(playerId) {
  if (
    !isOnField(playerId) &&
    matchState.squad.onField.home.length < MAX_STARTERS
  ) {
    matchState.squad.onField.home.push(playerId);
  }
}

function removeFromField(playerId) {
  matchState.squad.onField.home =
    matchState.squad.onField.home.filter(id => id !== playerId);
}

function getHalfLengthMs() {
  const min = matchState.meta.halfLengthMin ?? 35;
  return min * 60 * 1000;
}

function getOvertimeMs(elapsedMs) {
  const halfMs = getHalfLengthMs();
  return Math.max(0, elapsedMs - halfMs);
}

function resumePlayingTime(timeMs) {
  matchState.squad.onField.home.forEach(playerId => {
    const player = matchState.players.home[playerId];

    player.intervals.push({
      in: timeMs,
      out: null
    });
  });
}

function formatMatchMinute(timeMs) {
  const baseMs =
    matchState.period === 1
      ? getHalfLengthMs()
      : getHalfLengthMs() * 2;

  // Ordinær tid: vanlig minutt
  if (timeMs <= baseMs) {
    return Math.ceil(timeMs / 60000).toString();
  }

  // Overtid: +1 fra første sekund etter base
  const overtimeMs = timeMs - baseMs;
  const overtimeMin = Math.ceil(overtimeMs / 60000);

  const baseMin = Math.floor(baseMs / 60000);
  return `${baseMin} + ${overtimeMin}`;
}

function sanitizePlayers() {
  if (!matchState.players?.home) return;

  Object.keys(matchState.players.home).forEach(id => {
    const p = matchState.players.home[id];

    if (!p || !p.id) {
      delete matchState.players.home[id];
      return;
    }

    if (!Array.isArray(p.intervals)) p.intervals = [];
    if (!Array.isArray(p.cards)) p.cards = [];

    if (typeof p.present !== "boolean") p.present = false;
    if (typeof p.starter !== "boolean") p.starter = false;

    // 🔥 NY: sikre navn
    if (!p.name) p.name = "Ukjent";
  });
}

function syncUI() {
  updateScoreboard();
  renderEvents();
  updateControls();
  updateUIByStatus();
  updatePlayingTimeUI();
}

/* ======================================================
   EVENT LOGGING (DISKRET)
   ====================================================== */

function addEvent(event) {
  const user = auth.currentUser;

  const timestamp = new Date().toLocaleTimeString("no-NO", {
    hour: "2-digit",
    minute: "2-digit"
  });

  const baseEvent =
    typeof event === "string"
      ? { type: "text", rawText: event }
      : event;

  const eventId =
    crypto.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const rawText = baseEvent.rawText ?? baseEvent.text ?? "";

  const fullEvent = {
    ...baseEvent,
    id: baseEvent.id || eventId,
    rawText,
    text: `${timestamp} – ${rawText}`,
    createdClock: timestamp,
    reportedAt: new Date().toISOString(),
    edited: false,
    ...(user ? { reportedBy: user.uid } : {})
  };

  matchState.events.unshift(fullEvent);

  renderEvents();
  saveLiveUpdate();

  eventLog.classList.remove("hidden");
  toggleEventsBtn.textContent = "Skjul hendelser";
}

function rebuildEventText(event) {
  const prefix = event.createdClock ? `${event.createdClock} – ` : "";
  return prefix + (event.rawText || "");
}

function editEvent(eventId) {
  const event = matchState.events.find(e => e.id === eventId);
  if (!event) return;

  const updatedText = prompt("Rediger hendelse:", event.rawText || "");
  if (updatedText === null) return;

  const trimmed = updatedText.trim();
  if (!trimmed) {
    alert("Hendelsen kan ikke være tom");
    return;
  }

  event.rawText = trimmed;
  event.text = rebuildEventText(event);
  event.edited = true;
  event.editedAt = new Date().toISOString();

  renderEvents();
  saveLiveUpdate();
}

function deleteEvent(eventId) {
  if (!eventId) {
    alert("Kunne ikke slette: hendelsen mangler id");
    return;
  }

  const ok = confirm("Vil du slette denne hendelsen?");
  if (!ok) return;

  matchState.events = matchState.events.filter(e => e.id !== eventId);

  renderEvents();
  saveLiveUpdate();
}



function renderEvents() {
  const list = document.getElementById("eventList");
  list.innerHTML = "";

  matchState.events.forEach(event => {
    const li = document.createElement("li");
    li.className = "event-row";

    const textSpan = document.createElement("span");
    textSpan.className = "event-text";
    textSpan.textContent = event.text + (event.edited ? " (redigert)" : "");

    const actions = document.createElement("div");
    actions.className = "event-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "event-edit-btn";
    editBtn.textContent = "Rediger";
    editBtn.addEventListener("click", () => editEvent(event.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "event-delete-btn";
    deleteBtn.textContent = "Slett";
    deleteBtn.addEventListener("click", () => deleteEvent(event.id));

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(textSpan);
    li.appendChild(actions);

    list.appendChild(li);
  });
}

function makeSubstitution(outId, inId, timeMs) {
  const outPlayer = matchState.players.home[outId];
  const inPlayer = matchState.players.home[inId];

  if (!outPlayer || !inPlayer) return;

  const lastInterval = outPlayer.intervals.at(-1);
  if (lastInterval && lastInterval.out === null) {
    lastInterval.out = timeMs;
  }

  // 🔥 KUN start nytt interval hvis kampen er LIVE
  if (matchState.status === "LIVE") {
    inPlayer.intervals.push({
      in: timeMs,
      out: null
    });
  }

  removeFromField(outId);
  addToField(inId);

  const minuteText = formatMatchMinute(timeMs);
  addEvent(`🔁 ${minuteText} – ${outPlayer.name} ut, ${inPlayer.name} inn`);

  saveLiveUpdate();
}

function handleRedCard(playerId, timeMs) {
  if (!isOnField(playerId)) return;

  const player = matchState.players.home[playerId];

  const lastInterval = player.intervals.at(-1);
  if (lastInterval && lastInterval.out === null) {
    lastInterval.out = timeMs;
  }

  removeFromField(playerId);
}

/* ======================================================
   STATE ACTIONS (kontrollerte endringer)
   ====================================================== */
let saveTimeout = null;

function commitState() {
  if (!isReadyForFirestore()) return;

  // avbryt tidligere planlagt save
  if (saveTimeout) {
    clearTimeout(saveTimeout);
  }

  // lagre etter 1 sekund
  saveTimeout = setTimeout(() => {
    saveLiveUpdate();
    saveTimeout = null;
  }, 1000);
}

function startTimerNow() {
  matchState.timer.startTimestamp = Date.now();
  commitState();
}

function pauseTimerNow() {
  if (!matchState.timer.startTimestamp) return;

  const now = Date.now();
  matchState.timer.elapsedMs += now - matchState.timer.startTimestamp;
  matchState.timer.startTimestamp = null;

  commitState();
}

function getLiveElapsedMs() {
  if (matchState.status !== "LIVE") {
    return matchState.timer.elapsedMs;
  }

  return (
    matchState.timer.elapsedMs +
    (Date.now() - matchState.timer.startTimestamp)
  );
}

function setMatchStatus(status) {
  matchState.status = status;
  commitState();
}

function setPeriod(period) {
  matchState.period = period;
  commitState();
}

function addOurGoal() {
  matchState.score.our += 1;
  commitState();
}

function addTheirGoal() {
  matchState.score.their += 1;
  commitState();
}

function setTimerStart(timestamp) {
  matchState.timer.startTimestamp = timestamp;
  commitState();
}

function addElapsedTime(ms) {
  matchState.timer.elapsedMs += ms;
  commitState();
}

/* ======================================================
   BUTTON HANDLERS
   ====================================================== */
   
startBtn.addEventListener("click", async () => {

  const liveMatch = await findLiveMatch();
  if (liveMatch) {
    alert("Det pågår allerede en kamp.");
    return;
  }

  if (!auth.currentUser) {
    alert("Du må være logget inn");
    return;
  }

  const urlMatchId = getMatchIdFromUrl();

  if (!urlMatchId) {
    alert("Feil: mangler matchId");
    return;
  }

  matchState.matchId = urlMatchId;

  readMatchMetaFromUI();

  setMatchStatus("LIVE");
  matchState.period = 1;
  matchState.timer.startTimestamp = Date.now();
  matchState.timer.elapsedMs = 0;

  await safeSetDoc(doc(db, "matches", matchState.matchId), {
    status: "LIVE",
    startedAt: serverTimestamp(),
    timer: {
      elapsedMs: 0,
      startTimestamp: Date.now()
    },
    updatedAt: serverTimestamp()
  }, { merge: true });

addEvent("Kamp startet");

startPlayingTime();
startClock();

syncUI();
});

function pausePlayingTime(timeMs) {
  matchState.squad.onField.home.forEach(playerId => {
    const player = matchState.players.home[playerId];
    const lastInterval = player.intervals.at(-1);

    if (lastInterval && lastInterval.out === null) {
      lastInterval.out = timeMs;
    }
  });
}

let pauseConfirm = false;

pauseBtn.addEventListener("click", () => {

  if (matchState.status !== "LIVE") return;

  // Første klikk → bekreft
  if (!pauseConfirm) {
    pauseConfirm = true;
    pauseBtn.textContent = "Bekreft pause";

    setTimeout(() => {
      pauseConfirm = false;
      pauseBtn.textContent = "Pause";
    }, 2000);

    return;
  }

  // Andre klikk → faktisk pause
  pauseConfirm = false;
  pauseBtn.textContent = "Pause";

  const now = Date.now();

pauseTimerNow();
setMatchStatus("PAUSED");

  pausePlayingTime(matchState.timer.elapsedMs);

  stopClock();
  periodIndicator.textContent = "Pause i kampen";

addEvent("⏸️ Pause i kampen");

syncUI();
});

let endConfirm = false;

endBtn.addEventListener("click", async () => {

  if (matchState.status !== "LIVE") return;

  // Første klikk → bekreft
  if (!endConfirm) {
    endConfirm = true;
    endBtn.textContent = "Bekreft slutt";

    setTimeout(() => {
      endConfirm = false;
      endBtn.textContent = "Stopp";
    }, 2000);

    return;
  }

  // Andre klikk → avslutt
  endConfirm = false;
  endBtn.textContent = "Stopp";

  if (matchState.timer.startTimestamp) {
    matchState.timer.elapsedMs +=
      Date.now() - matchState.timer.startTimestamp;
  }

  stopClock();
  matchState.status = "ENDED";

  periodIndicator.textContent = "Kamp ferdig";

  addEvent("🏁 Kamp avsluttet");

  updateControls();

  await saveFinalMatch();
});

resumeBtn.addEventListener("click", () => {

  if (matchState.status !== "PAUSED") return;

  // 👉 Sett til start av 2. omgang
  matchState.period = 2;
  matchState.timer.elapsedMs = getHalfLengthMs(); // ← VIKTIG

  matchState.status = "LIVE";
  startTimerNow();

  periodIndicator.textContent = "2. omgang";

  resumePlayingTime(matchState.timer.elapsedMs);

startClock();
addEvent("▶️ 2. omgang startet");
syncUI();
});

document.getElementById("game-clock").textContent = "00:00";

document.querySelectorAll(".goalBtn").forEach(button => {
  button.addEventListener("click", () => {
    if (!requireLineupConfirmed()) return;
    if (matchState.status !== "LIVE") return;

    pendingGoalTeam = button.dataset.team;
    openGoalModal();
  });
});

function openGoalModal() {
  goalModal.classList.remove("hidden");

  // 🔁 Reset: skjul begge først
  homeScorerWrapper.classList.add("hidden");
  opponentScorerWrapper.classList.add("hidden");

  // 🏠 Hjemmelag
  if (pendingGoalTeam === "home") {
    homeScorerWrapper.classList.remove("hidden");
    populateGoalScorers("home");
  }

  // 🚌 Bortelag
  if (pendingGoalTeam === "away") {
    opponentScorerWrapper.classList.remove("hidden");
    opponentScorerInput.value = "";
  }
}

function closeGoalModal() {
  goalModal.classList.add("hidden");

  // reset tid
  manualGoalTimeInput.value = "";
  manualGoalTimeInput.disabled = true;

  // reset radios
  const nowRadio =
    document.querySelector('input[name="goalTimeType"][value="now"]');
  if (nowRadio) nowRadio.checked = true;

  // reset spillervalg
  goalScorerSelect.value = "";
  opponentScorerInput.value = "";
}

document.querySelectorAll('input[name="goalTimeType"]').forEach(radio => {
  radio.addEventListener("change", () => {
    manualGoalTimeInput.disabled =
      radio.value !== "manual";
  });
});

confirmGoalBtn.addEventListener("click", () => {
  let timeMs;

  const timeType =
    document.querySelector('input[name="goalTimeType"]:checked').value;

  if (timeType === "manual") {
    const value = manualGoalTimeInput.value.trim();
    if (!/^\d{1,3}$/.test(value)) {
  alert("Skriv inn minutt (f.eks 12)");
  return;
}

const minute = Number(value);

if (!Number.isInteger(minute)) {
  alert("Ugyldig minutt");
  return;
}

const maxMinute = (matchState.meta.halfLengthMin ?? 45) * 2;

if (minute < 1 || minute > maxMinute) {
  alert(`Minutt må være mellom 1 og ${maxMinute}`);
  return;
}

if (minute > matchState.meta.halfLengthMin) {
  timeMs =
    getHalfLengthMs() +
    (minute - matchState.meta.halfLengthMin - 1) * 60 * 1000;
} else {
  timeMs = (minute - 1) * 60 * 1000;
}

  } else {
    timeMs = getLiveElapsedMs();
  }

  let scorerData = null;

  if (pendingGoalTeam === "home") {
    const scorerId = goalScorerSelect.value;
    if (!scorerId) {
      alert("Velg målscorer");
      return;
    }
    scorerData = { id: scorerId };
  }

  if (pendingGoalTeam === "away") {
    const text = opponentScorerInput.value.trim();
    scorerData = {
      text: text || null
    };
  }

 registerGoal(pendingGoalTeam, timeMs, scorerData);
closeGoalModal();

setTimeout(() => {
  updatePlayingTimeUI();
}, 0);
});

cancelGoalBtn.addEventListener("click", closeGoalModal);

  
  updateScoreboard();

function openSubModal() {
  const outSelect = document.getElementById("subOutSelect");
  const inSelect = document.getElementById("subInSelect");

  outSelect.innerHTML = "";
  inSelect.innerHTML = "";

  // Spillere på banen → kan gå UT
  matchState.squad.onField.home.forEach(id => {
    const p = matchState.players.home[id];
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    outSelect.appendChild(opt);
  });

  // Spillere på benken → kan gå INN
Object.values(matchState.players.home).forEach(p => {
  const hasRedCard = p.cards?.some(c => c.type === "red");

  if (!isOnField(p.id) && !hasRedCard) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
    inSelect.appendChild(opt);
  }
});

  document.getElementById("subModal").classList.remove("hidden");
}

document.getElementById("confirmSubBtn").addEventListener("click", () => {
  const outId = document.getElementById("subOutSelect").value;
  const inId = document.getElementById("subInSelect").value;

  const timeMs = getCurrentMatchTimeMs();
  
makeSubstitution(outId, inId, timeMs);
closeSubModal();

setTimeout(() => {
  updatePlayingTimeUI();
}, 0);
});

function calculateMinutesPlayed(player) {
  let totalMs = 0;

  const currentTime = getCurrentMatchTimeMs(); // 🔥 viktig

  player.intervals.forEach(interval => {
    const end = interval.out ?? currentTime;
    totalMs += end - interval.in;
  });

  return Math.floor(totalMs / 60000);
}


document.getElementById("togglePlayingTimeBtn")
.addEventListener("click", () => {

  const panel = document.getElementById("playingTimePanel");
  panel.classList.toggle("hidden");

  const isHidden = panel.classList.contains("hidden");

  document.getElementById("togglePlayingTimeBtn").textContent =
    isHidden ? "Vis spilletid" : "Skjul spilletid";

  // 🔥 START/STOP OPPDATERING
  if (!isHidden) {
    updatePlayingTimeUI(); // kjør én gang

    playingTimeInterval = setInterval(() => {
      updatePlayingTimeUI();
    }, 5000); // hvert 5 sekund
  } else {
    clearInterval(playingTimeInterval);
    playingTimeInterval = null;
  }
});
  
  const adjustModal = document.getElementById("adjustTimeModal");
const adjustInput = document.getElementById("adjustTimeInput");

document.getElementById("adjustStartBtn").addEventListener("click", () => {

  if (matchState.status !== "LIVE") {
    alert("Kampen må være startet");
    return;
  }

  adjustInput.value = "";

  // 🔥 LEGG DENNE HER
  adjustModal.querySelector(".modal-hint").textContent =
    matchState.period === 1
      ? "Angi hvor mange minutter som er spilt i 1. omgang"
      : "Angi minutter ut i 2. omgang";

  adjustModal.classList.remove("hidden");
});


document.getElementById("cancelAdjustTimeBtn").addEventListener("click", () => {
  adjustModal.classList.add("hidden");
});


document.getElementById("confirmAdjustTimeBtn").addEventListener("click", () => {

  const minutes = Number(adjustInput.value);

  if (!Number.isFinite(minutes) || minutes < 0) {
    alert("Ugyldig tall");
    return;
  }

  let adjustMs;

  if (matchState.period === 1) {
    adjustMs = minutes * 60 * 1000;
  } else {
    adjustMs =
      getHalfLengthMs() + minutes * 60 * 1000;
  }

  // 🔥 JUSTER KLOKKE
  matchState.timer.elapsedMs = adjustMs;
  matchState.timer.startTimestamp = Date.now();

  // 🔥 JUSTER SPILLERTID
  matchState.squad.onField.home.forEach(playerId => {
    const player = matchState.players.home[playerId];
    if (!player || !player.intervals?.length) return;

    const last = player.intervals.at(-1);

    if (last.out === null) {
      last.in =
        matchState.period === 1
          ? 0
          : getHalfLengthMs();
    }
  });

  addEvent(`⏱️ Starttid justert til ${minutes} min`);

  updatePlayingTimeUI();
saveLiveUpdate();
  adjustModal.classList.add("hidden");
});

function updatePlayingTimeUI() {
  const list = document.getElementById("playingTimeList");
  list.innerHTML = "";

  const players = Object.values(matchState.players.home);

  players.sort((a, b) => {
    const aOn = isOnField(a.id);
    const bOn = isOnField(b.id);

    const aMin = Math.max(0, calculateMinutesPlayed(a));
    const bMin = Math.max(0, calculateMinutesPlayed(b));

    // På banen først
    if (aOn && !bOn) return -1;
    if (!aOn && bOn) return 1;

    // Begge på banen → mest først
    if (aOn && bOn) return bMin - aMin;

    // Begge på benken → minst nederst
    return bMin - aMin;
  });

  const allPlayers = Object.values(matchState.players.home);

  const avgMinutes =
    allPlayers.reduce((sum, p) => sum + calculateMinutesPlayed(p), 0) /
    allPlayers.length;

  let currentSection = null;

  players.forEach(player => {
    const isOn = isOnField(player.id);
    const minutes = Math.max(0, calculateMinutesPlayed(player));

    if (isOn && currentSection !== "on") {
      const header = document.createElement("li");
      header.textContent = "På banen";
      header.className = "pt-header";
      list.appendChild(header);
      currentSection = "on";
    }

    if (!isOn && currentSection !== "bench") {
      const header = document.createElement("li");
      header.textContent = "På benken";
      header.className = "pt-header";
      list.appendChild(header);
      currentSection = "bench";
    }

    const li = document.createElement("li");

    const cards = player.cards ?? [];
    const yellow = cards.filter(c => c.type === "yellow").length;
    const red = cards.some(c => c.type === "red");

    let cardText = "";
    if (yellow > 0) cardText += " 🟨".repeat(yellow);
    if (red) cardText += " 🟥";

    li.innerHTML = `
  <span class="player-name">
    ${player.name} <span class="cards">${cardText}</span>
  </span>
  <span class="player-minutes">
    ${minutes} min
  </span>
`;

    if (isOn) {
      li.classList.add("on");
    } else {
      li.classList.add("bench");
    }

    if (minutes > avgMinutes + 5) {
      li.classList.add("tired");
    }

    if (minutes < avgMinutes - 5) {
      li.classList.add("fresh");
    }

    list.appendChild(li);
  });
}

const venueToggleBtn =
  document.getElementById("venueToggleBtn");

function updateVenueToggle() {
  const btn = document.getElementById("venueToggleBtn");

  if (!btn) return;

  const venue = matchState.meta.venue;

  if (venue === "away") {
    btn.textContent = "Bortekamp";
    btn.classList.remove("home");
    btn.classList.add("away");
  } else {
    btn.textContent = "Hjemmekamp";
    btn.classList.remove("away");
    btn.classList.add("home");
  }
}

venueToggleBtn.addEventListener("click", () => {
  // 🆕 Etter kamp: Ny kamp
  if (venueToggleBtn.textContent === "Ny kamp") {
    resetMatchState();
    return;
  }

  // Før kamp: Hjem / Borte
  matchState.meta.venue =
    matchState.meta.venue === "home" ? "away" : "home";

  updateVenueToggle();
});

function setLoginMessage(text, type = "") {
  const el = document.getElementById("loginMessage");
  if (!el) return;

  el.textContent = text;
  el.className = `login-message ${type}`;
}


document.getElementById("squadBtn").addEventListener("click", openSquadModal);

function openSquadModal() {
	 isSquadModalOpen = true;
	const squadLocked = !["NOT_STARTED", "UPCOMING"].includes(matchState.status);
  const list = document.getElementById("squadList");
  list.innerHTML = "";
  
  // 🔥 INIT DEFAULT STATE (VIKTIG)
HOME_SQUAD.forEach(p => {
  if (!matchState.players.home[p.id]) {
    matchState.players.home[p.id] = createPlayer({
      id: p.id,
      name: p.name
    });
  }
});
  
  const saveBtn = document.getElementById("saveSquadBtn");

if (squadLocked) {
  saveBtn.disabled = true;
  saveBtn.style.display = "none";
} else {
  saveBtn.disabled = true; // styres av starter-teller
  saveBtn.style.display = "inline-block";
}

  Object.values(matchState.players.home).forEach(player => {

  if (!player || !player.id) return;

  const li = document.createElement("li");
  li.className = "squad-row";
  li.dataset.playerId = player.id;

  /* ===== TILSTEDE ===== */
  const presentLabel = document.createElement("label");
  presentLabel.className = "checkbox";

const presentCheckbox = document.createElement("input");
presentCheckbox.type = "checkbox";
presentCheckbox.checked =
  matchState.players.home[player.id]?.present ?? false;
	presentCheckbox.disabled = squadLocked;

  const presentText = document.createElement("span");
  presentText.textContent = "Tilstede";

  presentLabel.append(presentCheckbox, presentText);

  /* ===== STARTER ===== */
  const starterLabel = document.createElement("label");
  starterLabel.className = "checkbox";

const starterCheckbox = document.createElement("input");
starterCheckbox.type = "checkbox";
const existing = matchState.players.home[player.id];

starterCheckbox.checked =
  existing ? existing.starter : false;
  starterCheckbox.disabled = squadLocked || !presentCheckbox.checked;

  const starterText = document.createElement("span");
  starterText.textContent = "Starter";

  starterLabel.append(starterCheckbox, starterText);

  /* ===== STARTFARGE ===== */
if (starterCheckbox.checked) {
  li.classList.add("is-starter");
} else {
  li.classList.remove("is-starter");
}

  /* ===== REGEL: ikke tilstede => ikke starter ===== */
presentCheckbox.addEventListener("change", () => {

  const playerId = li.dataset.playerId;
  const player = matchState.players.home[playerId];
  if (!player) return;

  player.present = presentCheckbox.checked;

  if (!presentCheckbox.checked) {
    player.starter = false;
    starterCheckbox.checked = false;
    starterCheckbox.disabled = true;

    li.classList.remove("is-starter");
    li.classList.add("not-present");
  } else {
    starterCheckbox.disabled = false;
    li.classList.remove("not-present");
  }

  updateStarterCounter();
});

  /* ===== FARGEBYTTE RØD / GRØNN ===== */
starterCheckbox.addEventListener("change", (e) => {

  const playerId = li.dataset.playerId;
  const player = matchState.players.home[playerId];
  if (!player) return;

  if (e.isTrusted) {
    const currentStarters =
      document.querySelectorAll(".squad-row.is-starter").length;

    if (starterCheckbox.checked && currentStarters >= MAX_STARTERS) {
      starterCheckbox.checked = false;
      return;
    }
  }

  player.starter = starterCheckbox.checked;

  li.classList.toggle("is-starter", starterCheckbox.checked);

  updateStarterCounter();
});

  /* ===== NAVN ===== */
  const nameSpan = document.createElement("span");
  nameSpan.className = "player-name";
  nameSpan.textContent = player.name;

if (player.id && player.id.startsWith("loan_")) {
  nameSpan.style.color = "#60a5fa"; // blå
}

  /* ===== SETT SAMMEN ===== */
  li.append(presentLabel, starterLabel, nameSpan);
  list.appendChild(li);
});


  document.getElementById("squadModal").classList.remove("hidden");
  updateStarterCounter();
}

function openCardModal() {
  const modal = document.getElementById("cardModal");
  const select = document.getElementById("cardPlayer");

  select.innerHTML = "";
  
  const placeholder = document.createElement("option");
placeholder.value = "";
placeholder.textContent = "Velg spiller";
select.appendChild(placeholder);


  // Kun spillere som er på banen
Object.values(matchState.players.home).forEach(p => {
  if (!p) return;
  if (p.cards?.some(c => c.type === "red")) return;

  const opt = document.createElement("option");
  opt.value = p.id;

  opt.textContent = isOnField(p.id)
    ? p.name
    : p.name + " (benk)";

  select.appendChild(opt);
});

  // nullstill radioknapper
  document
    .querySelectorAll('input[name="cardType"]')
    .forEach(r => (r.checked = false));

  modal.classList.remove("hidden");
  
  // reset lagvalg
document.querySelector(
  'input[name="cardTeam"][value="home"]'
).checked = true;

cardHomeWrapper.classList.remove("hidden");
cardAwayWrapper.classList.add("hidden");
cardOpponentInput.value = "";

}
document
  .querySelectorAll('input[name="cardTeam"]')
  .forEach(radio => {
    radio.addEventListener("change", () => {
      const team =
        document.querySelector(
          'input[name="cardTeam"]:checked'
        ).value;

      cardHomeWrapper.classList.toggle(
        "hidden",
        team !== "home"
      );
      cardAwayWrapper.classList.toggle(
        "hidden",
        team !== "away"
      );
    });
  });


document
  .getElementById("cancelCardBtn")
  .addEventListener("click", () =>
    document.getElementById("cardModal").classList.add("hidden")
  );
  
document
  .getElementById("confirmCardBtn")
  .addEventListener("click", () => {
    const team =
  document.querySelector(
    'input[name="cardTeam"]:checked'
  ).value;

const type =
  document.querySelector(
    'input[name="cardType"]:checked'
  )?.value;

if (!type) {
  alert("Velg korttype");
  return;
}

const timeMs = getCurrentMatchTimeMs();
const minuteText = formatMatchMinute(timeMs);
const icon = type === "yellow" ? "🟨" : "🟥";

if (team === "home") {
  const playerId =
    document.getElementById("cardPlayer").value;

  if (!playerId) {
    alert("Velg spiller");
    return;
  }

  const player = matchState.players.home[playerId];

  if (player.cards.some(c => c.type === "red")) {
    alert("Spilleren er allerede utvist");
    return;
  }

  player.cards.push({ type, timeMs });
  addEvent(`${icon} ${minuteText} – ${player.name}`);

  const yellowCount =
    player.cards.filter(c => c.type === "yellow").length;

  if (type === "yellow" && yellowCount === 2) {
    player.cards.push({ type: "red", timeMs });
    addEvent(
      `🟥 ${minuteText} – ${player.name} (2 gule)`
    );
    handleRedCard(playerId, timeMs);
  }

if (type === "red") {
  handleRedCard(playerId, timeMs);
}

setTimeout(() => {
  updatePlayingTimeUI();
}, 0);
}

if (team === "away") {
  const name =
    cardOpponentInput.value.trim() || "Ukjent spiller";

  addEvent(
    `${icon} ${minuteText} – ${name} (${matchState.meta.opponent})`
  );
}

document
  .getElementById("cardModal")
  .classList.add("hidden");
saveLiveUpdate(); 
});


document.getElementById("saveSquadBtn").addEventListener("click", () => {

  if (!["NOT_STARTED", "UPCOMING"].includes(matchState.status)) {
    return;
  }

  const starterCount =
    document.querySelectorAll(".squad-row.is-starter").length;

  if (starterCount !== MAX_STARTERS) {
    alert(`Du må velge akkurat ${MAX_STARTERS} startere`);
    return;
  }

const newOnField = [];

document.querySelectorAll("#squadList li").forEach(li => {
  const id = li.dataset.playerId;
  const [present, starter] = li.querySelectorAll("input");

  const player = matchState.players.home[id];
  if (!player) return;

  player.present = present.checked;
  player.starter = starter.checked;

  if (starter.checked) {
    newOnField.push(id);
  }
});

matchState.squad.onField.home = newOnField;
  
  sanitizePlayers();
  
matchState.lineupConfirmed = true;
console.log("STATUS:", matchState.status);
console.log("LINEUP:", matchState.lineupConfirmed);
saveLiveUpdate();
isSquadModalOpen = false;
document.getElementById("squadModal").classList.add("hidden");
syncUI();

});

document.getElementById("cancelSquadBtn")
  .addEventListener("click", () => {
    isSquadModalOpen = false; // 👈 legg til
    document.getElementById("squadModal").classList.add("hidden");
  });

document.getElementById("cancelSubBtn").addEventListener("click", closeSubModal);

document
  .getElementById("cardBtn")
  .addEventListener("click", () => {
    if (!requireLineupConfirmed()) return;
    openCardModal();
  });

function closeSubModal() {
  document.getElementById("subModal").classList.add("hidden");
}

document
  .getElementById("subBtn")
  .addEventListener("click", () => {
    if (!requireLineupConfirmed()) return;
    openSubModal();
  });

function updateStarterCounter() {
  const counter = document.getElementById("starterCounter");
  const saveBtn = document.getElementById("saveSquadBtn");
  if (!counter || !saveBtn) return;

  const count =
    document.querySelectorAll(".squad-row.is-starter").length;

  counter.textContent = `Startere: ${count} / ${MAX_STARTERS}`;

  // kun lov å lagre når EXACT 11
  saveBtn.disabled = count !== MAX_STARTERS;
}

function getMatchSummary() {
  const result =
    `${matchState.score.our}-${matchState.score.their}`;

  return {
    meta: matchState.meta,
    score: matchState.score,
    result,
    events: matchState.events,
playingTime: Object.values(matchState.players.home)
  .filter(p => p.present)
  .map(p => ({
    id: p.id,
    name: p.name,
    minutes: calculateMinutesPlayed(p),
    cards: p.cards || []   // ✅ riktig
  }))
  };
}

onAuthStateChanged(auth, async (user) => {

if (!user) {
  window.location.href = "index.html";
  return;
}

// 🔥 LOGG INNLOGGING
await setDoc(
  doc(collection(db, "userLogins", user.uid, "sessions")),
  {
    email: user.email,
    loginAt: serverTimestamp()
  }
);

  const userRef = doc(db, "users", user.uid);
  const snap = await getDoc(userRef);

if (!snap.exists()) {
  await signOut(auth);
  window.location.href = "index.html";
  return;
}

  const data = snap.data();

if (!["coach", "assistantCoach"].includes(data.role)) {
  await signOut(auth);
  window.location.href = "index.html";
  return;
}

if (data.role !== "coach" && !user.emailVerified) {
  await signOut(auth);
  window.location.href = "index.html";
  return;
}

// ✅ Godkjent – gjør ingenting
matchState.userRole = data.role;
await loadActiveMatch();

const liveMatch = await findLiveMatch();

if (liveMatch) {
  const liveId = liveMatch.id;

  // hvis du IKKE allerede er i denne kampen
  if (localStorage.getItem("activeMatchId") !== liveId) {
    localStorage.setItem("activeMatchId", liveId);
    window.location.href = `kamp.html?matchId=${liveId}`;
    return;
  }
}
});

const urlMatchId = getMatchIdFromUrl();
const existingMatchId = localStorage.getItem("activeMatchId");

// 🔥 Hvis vi kommer fra oversikt → bruk URL
if (urlMatchId) {
  console.log("Laster kamp fra URL:", urlMatchId);
  localStorage.setItem("activeMatchId", urlMatchId);
}

if (existingMatchId) {
  console.log("Forsøker å laste aktiv kamp:", existingMatchId);
} else {
  console.log("Ingen aktiv kamp");
}

async function saveNewMatch() {
  const user = auth.currentUser;
  if (!user) {
    console.error("Ikke innlogget");
    return;
  }

  /* ======================================================
     BESTEM HVOR DET SKAL LAGRES BASERT PÅ ROLLE
     ====================================================== */

let matchRef;
let snap;

if (matchState.userRole === "assistantCoach") {

  // 🔹 prøv assistant først
  matchRef = doc(db, "assistantMatches", user.uid, "matches", matchState.matchId);
  snap = await getDoc(matchRef);

  console.log("Prøver assistant:", snap.exists());

  // 🔹 fallback til coach
  if (!snap.exists()) {
    matchRef = doc(db, "matches", matchState.matchId);
    snap = await getDoc(matchRef);

    console.log("Fallback til coach:", snap.exists());
  }
 }
else {
  matchRef = doc(db, "matches", matchState.matchId);
  snap = await getDoc(matchRef);
}

  /* ======================================================
     DATA
     ====================================================== */

const meta = {
  ourTeam: matchState.meta.ourTeam,
  opponent: matchState.meta.opponent,
  venue: matchState.meta.venue || "home",
  date: matchState.meta.date,
  startTime: matchState.meta.startTime,
  halfLengthMin: matchState.meta.halfLengthMin,
  type: matchState.meta.type
};

  const present = [];
  const starters = [];

  Object.values(matchState.players.home).forEach(player => {
	    if (!player || !player.id) return;
    if (player.present) {
      present.push({
        id: player.id,
        name: player.name
      });
    }

    if (player.starter) {
      starters.push({
        id: player.id,
        name: player.name
      });
    }
  });

const matchData = {
  meta,
  type: matchState.meta.type, 
  status: "LIVE",
  score: {
    our: 0,
    their: 0
  },
  
  timer: {
  elapsedMs: 0,
  startTimestamp: Date.now()
},

  squad: {
    present,
    starters
  },

  startedAt: serverTimestamp(), // 🔥 LEGG TIL DENNE

  ownerUid: user.uid,
  role: matchState.userRole,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp()
};

  await setDoc(matchRef, matchData, { merge: true });

  console.log(
    "Kamp opprettet:",
    matchState.matchId,
    "Lagringssted:",
    matchState.userRole
  );
}

async function saveFinalMatch() {
  const user = auth.currentUser;
  if (!user) return;

  let matchRef;

  if (matchState.userRole === "coach") {
    matchRef = doc(db, "matches", matchState.matchId);
  } else {
    matchRef = getMatchRef();
  }

  if (!matchRef) return;

  const summary = getMatchSummary();

const data = {
  meta: matchState.meta,
  score: matchState.score,
  events: matchState.events,
  ...summary,
  status: "ENDED",
  updatedAt: serverTimestamp()
};

// 🔥 legg til type kun hvis den finnes
if (matchState.meta?.type) {
  data.type = matchState.meta.type;
}

await setDoc(matchRef, data, { merge: true });

  console.log("Kamp avsluttet:", matchState.matchId);
}

async function saveLiveUpdate() {
	if (!isReadyForFirestore()) {
  console.warn("Firestore ikke klar – hopper over save");
  return;
}
	
  const user = auth.currentUser;
  if (!user) return;

let matchRef;

try {
  matchRef = getMatchRef();
} catch (e) {
  console.warn(e.message);
  return;
}

  const data = {
    score: matchState.score,
    events: matchState.events,
    period: matchState.period,
    status: matchState.status,
    timer: {
      elapsedMs: matchState.timer.elapsedMs,
      startTimestamp: matchState.timer.startTimestamp
    },
    players: matchState.players.home,
    onField: matchState.squad.onField.home,
	lineupConfirmed: matchState.lineupConfirmed,
    updatedAt: serverTimestamp()
  };

  // 🔥 legg kun til hvis de finnes
  if (matchState.startedAt) {
    data.startedAt = matchState.startedAt;
  }

  if (matchState.meta?.type) {
    data.type = matchState.meta.type;
  }

  await setDoc(matchRef, data, { merge: true });

  localStorage.setItem("lastMatchState", JSON.stringify(matchState));
}


/* ======================================================
   INITIAL UI STATE
   ====================================================== */
   function resetMatchState() {
  // 🔄 Match state
  matchState.status = "NOT_STARTED";
  matchState.period = 1;
  matchState.lineupConfirmed = false;

  matchState.timer.elapsedMs = 0;
  matchState.timer.startTimestamp = null;

  matchState.score.our = 0;
  matchState.score.their = 0;

  matchState.squad.onField.home = [];
  matchState.players.home = {};
  matchState.events = [];

  // 🔄 UI – klokke og score
  document.getElementById("game-clock").textContent = "00:00";
  updateScoreboard();
  renderEvents();

  // 🔄 UI – vis pre-kamp-elementer
  document.getElementById("preMatchMeta")?.classList.remove("hidden");
  document.getElementById("squadBtn")?.classList.remove("hidden");

  // 🔄 Venue-knapp tilbake til Hjem/Borte
  const venueBtn = document.getElementById("venueToggleBtn");
  if (venueBtn) {
    venueBtn.textContent = "Hjemmekamp";
    venueBtn.classList.remove("new-match", "away");
    venueBtn.classList.add("home");
    venueBtn.classList.remove("hidden");
    matchState.meta.venue = "home";
  }

  // 🔄 Meta-inputs låses opp
  homeTeamInput.disabled = true; // Samnanger fast
  awayTeamInput.disabled = false;
  dateInput.disabled = false;
  timeInput.disabled = false;
  halfLengthInput.disabled = false;
  halfLengthInput.value = 35;

  // 🔄 Periodetekst
  periodIndicator.textContent = "Klar for kamp";

  stopClock();
  updateControls();
}

updateControls();
updateVenueToggle();

window._auth = auth;

document.getElementById("logoutBtn")
  ?.addEventListener("click", async () => {
    await signOut(auth);
    window.location.href = "index.html";
  });
  
newMatchBtn?.addEventListener("click", () => {
  localStorage.removeItem("activeMatchId");

  // 🔥 fjern matchId fra URL
  window.history.replaceState({}, "", "kamp.html");

  location.reload();
});
  
  window.addEventListener("load", () => {
  setTimeout(() => {
    document.querySelectorAll('input[type="date"], input[type="time"]')
      .forEach(input => {
        input.style.display = "none";
        input.offsetHeight; // trigger reflow
        input.style.display = "";
      });
  }, 50);
});

const toggleEventsBtn = document.getElementById("toggleEventsBtn");

toggleEventsBtn.addEventListener("click", () => {
  eventLog.classList.toggle("hidden");

  const isHidden = eventLog.classList.contains("hidden");

  toggleEventsBtn.textContent = isHidden
    ? "Vis hendelser"
    : "Skjul hendelser";
});

// Sett dagens dato og klokkeslett automatisk ved oppstart
document.addEventListener("DOMContentLoaded", function () {

  if (localStorage.getItem("activeMatchId")) return; // 🔥 VIKTIG

  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");

  document.getElementById("matchDate").value = `${yyyy}-${mm}-${dd}`;
  document.getElementById("matchTime").value = `${hh}:${min}`;
});

setInterval(() => {
  if (matchState.status === "LIVE" && isReadyForFirestore()) {
    const ref = getMatchRef();

    if (!ref) {
      console.warn("Autosave hoppet over (mangler matchRef)");
      return;
    }

    saveLiveUpdate();
    console.log("Autosave (3 min)");
  }
}, 3 * 60 * 1000);

async function loadActiveMatch() {
  const matchId = localStorage.getItem("activeMatchId");
  if (!matchId) return;

  const user = auth.currentUser;
  if (!user) return;

  let matchRef;
  let snap;

  if (matchState.userRole === "assistantCoach") {
    matchRef = doc(db, "assistantMatches", user.uid, "matches", matchId);
    snap = await getDoc(matchRef);

    if (!snap.exists()) {
      matchRef = doc(db, "matches", matchId);
      snap = await getDoc(matchRef);
    }
  } else {
    matchRef = doc(db, "matches", matchId);
    snap = await getDoc(matchRef);
  }

  if (!snap.exists()) {
    localStorage.removeItem("activeMatchId");
    window.location.href = "kamp.html";
    return;
  }

  const data = snap.data();

  if (data.status === "ENDED") {
    localStorage.removeItem("activeMatchId");
    return;
  }

  matchState.matchId = matchId;
  matchState.meta = {
    ourTeam: "",
    opponent: "",
    date: "",
    startTime: "",
    halfLengthMin: 35,
    venue: "home",
    type: "league",
    ...data.meta
  };

  matchState.meta.venue =
    data.meta?.venue ||
    data.meta?.venueType ||
    "home";

  console.log("✅ Fant kamp:", data);
  console.log("Gjenoppretter kamp:", matchId);

  /* =========================
     META + UI
  ========================= */

  matchState.matchId = matchId;
  matchState.meta = data.meta || {};

// 🔥 FIX: støtt begge navn
matchState.meta.venue =
  data.meta?.venue ||
  data.meta?.venueType ||
  "home";
  
updateVenueToggle();

homeTeamInput.value =
  matchState.meta?.ourTeam?.trim() || "Samnanger";

awayTeamInput.value =
  matchState.meta?.opponent?.trim() || "Motstander";
  
  dateInput.value = matchState.meta.date || "";
  timeInput.value = matchState.meta.startTime || matchState.meta.time || "";
  halfLengthInput.value = matchState.meta.halfLengthMin || 35;
  matchTypeInput.value = matchState.meta.type || "league";
  
  console.log("VENUE FRA FIRESTORE:", matchState.meta.venue);

  updateVenueToggle();

  /* =========================
     SCORE + EVENTS
  ========================= */

  matchState.score = data.score || { our: 0, their: 0 };
  matchState.events = data.events || [];

matchState.lineupConfirmed = data.lineupConfirmed ?? false;

  /* =========================
     PLAYERS (KJERNE)
  ========================= */

matchState.players.home = {};

// 1. lag alle spillere først
HOME_SQUAD.forEach(p => {
  matchState.players.home[p.id] = {
    id: p.id,
    name: p.name,
    present: false,
    starter: false,
    intervals: [],
    cards: []
  };
});

// 2. legg inn Firestore-data oppå
if (data.players) {
  Object.values(data.players).forEach(p => {
    if (!p?.name) return;

    const firstName = p.name.split(" ")[0].trim().toLowerCase();

    const squadPlayer = HOME_SQUAD.find(
      s => s.name.trim().toLowerCase() === firstName
    );

    if (!squadPlayer) return;

    matchState.players.home[squadPlayer.id] = {
      ...matchState.players.home[squadPlayer.id],
      present: p.present === true
    };
  });
}

  // 2️⃣ Gå gjennom lineup og sett riktig spiller
const hasSavedStarters =
  Object.values(matchState.players.home || {})
    .some(p => p.starter);

if (!hasSavedStarters && data.lineup && data.lineup.length > 0) {

  data.lineup.forEach(p => {
    if (!p.name) return;

    const firstName = p.name.split(" ")[0].trim().toLowerCase();

    const squadPlayer = HOME_SQUAD.find(
      s => s.name.trim().toLowerCase() === firstName
    );

    if (!squadPlayer) {
      console.warn("Fant ikke spiller:", p.name);
      return;
    }

    const player = matchState.players.home[squadPlayer.id];

    player.present = true;
    player.starter = true;

    matchState.squad.onField.home.push(player.id);
  });
}

  /* =========================
     ON FIELD (VIKTIG)
  ========================= */

if (data.onField && data.onField.length > 0) {
  matchState.squad.onField.home = data.onField;
} else if (data.squad?.starters?.length) {
  matchState.squad.onField.home = data.squad.starters.map(p => p.id);
}
  
  // 🔥 sørg for at alle på banen har aktivt interval
matchState.squad.onField.home.forEach(id => {
  const player = matchState.players.home[id];

  if (!player || !player.intervals) return;

  if (player.intervals.length === 0) {
    player.intervals.push({
      in: matchState.timer.elapsedMs,
      out: null
    });
    return;
  }

  const last = player.intervals.at(-1);

  if (last.out !== null) {
    player.intervals.push({
      in: matchState.timer.elapsedMs,
      out: null
    });
  }
});

  updateControls();

  /* =========================
     STATUS + TIMER
  ========================= */

  matchState.period = data.period || 1;
  matchState.status = data.status || "NOT_STARTED";
  matchState.timer.elapsedMs = data.timer?.elapsedMs || 0;

if (matchState.status === "LIVE") {

if (data.timer?.startTimestamp) {
  matchState.timer.startTimestamp = data.timer.startTimestamp;
} else {
  console.warn("Mangler startTimestamp – bruker nåtid (fallback)");
  matchState.timer.startTimestamp = Date.now();
}

  // 🔥 SETT RIKTIG OMGANGSTEKST
  if (matchState.period === 1) {
    periodIndicator.textContent = "1. omgang";
  } else {
    periodIndicator.textContent = "2. omgang";
  }
const now = Date.now();

const currentElapsed =
  matchState.timer.elapsedMs +
  (now - matchState.timer.startTimestamp);

const baseMs =
  matchState.period === 1
    ? getHalfLengthMs()
    : getHalfLengthMs() * 2;

const overtimeMs = Math.max(0, currentElapsed - baseMs);

const clockEl = document.getElementById("game-clock");

if (overtimeMs > 0) {
  clockEl.innerHTML =
    formatTime(baseMs) +
    ` <span class="overtime">(+${formatTime(overtimeMs)})</span>`;
} else {
  clockEl.textContent = formatTime(currentElapsed);
}
  startClock();
}

  if (matchState.status === "PAUSED") {
    matchState.timer.startTimestamp = null;

    document.getElementById("game-clock").textContent =
      formatTime(matchState.timer.elapsedMs);

    periodIndicator.textContent = "Pause i kampen";
  }



  /* =========================
     UI UPDATE
  ========================= */
sanitizePlayers();

syncUI();
teams.style.display = "flex";
populateGoalScorers("home");

if (matchState.status === "LIVE" || matchState.status === "PAUSED") {
  document.getElementById("matchUI")?.classList.remove("hidden");
}

setTimeout(() => {
  updatePlayingTimeUI();
}, 0);

setTimeout(() => {
  updatePlayingTimeUI();
}, 0);

// 🔥 LEGG INN HER
const coachRef = doc(db, "matches", matchState.matchId);

onSnapshot(coachRef, (snap) => {
  console.log("SNAPSHOT TRIGGERED");

  if (!snap.exists()) return;

  const data = snap.data();

  if (!data.lineup) return;

// 🔥 VIKTIG: ikke overskriv hvis vi allerede har lagret starters
if (data.lineupConfirmed) return;

  const newOnField = [];

  data.lineup.forEach(p => {
    const firstName = p.name.split(" ")[0];
    const squadPlayer = HOME_SQUAD.find(s => s.name === firstName);
    if (!squadPlayer) return;

    newOnField.push(squadPlayer.id);
  });

// nullstill alle
Object.values(matchState.players.home).forEach(p => {
  p.starter = false;
});

// sett nye startere fra lineup
data.lineup.forEach(p => {
  const firstName = p.name.split(" ")[0].trim().toLowerCase();
  const squadPlayer = HOME_SQUAD.find(
  s => s.name.trim().toLowerCase() === firstName
);
  if (!squadPlayer) return;

  if (matchState.players.home[squadPlayer.id]) {
    matchState.players.home[squadPlayer.id].starter = true;
  }
});

// 🔥 oppdater UI
updatePlayingTimeUI();
if (isSquadModalOpen) {
  openSquadModal();
}
});

document.addEventListener("DOMContentLoaded", () => {

  const startNewMatchBtn = document.getElementById("startNewMatchBtn");
  const activeMatchId = localStorage.getItem("activeMatchId");

  // 🔴 STOPP hvis kamp finnes
  if (activeMatchId) {
    return;
  }

  // 👉 START: vis KUN startknapp
  startScreen.style.display = "block";
  preMatch.classList.add("hidden");
  teams.style.display = "none"; // 🔥 viktig

  startNewMatchBtn.addEventListener("click", () => {

    matchState.status = "UPCOMING";

    startScreen.style.display = "none";

    updateUIByStatus();
  });

});

const controls = document.getElementById("controls");

let controlsVisible = true;

clockSection.addEventListener("click", () => {
  // kun når kampen faktisk er live
  if (matchState.status !== "LIVE") return;

  controlsVisible = !controlsVisible;

  controls.classList.toggle("hidden-controls", !controlsVisible);
});

document.getElementById("backBtn")?.addEventListener("click", () => {

  // 🔥 fjern aktiv kamp fra localStorage
  localStorage.removeItem("activeMatchId");

  // 🔥 gå tilbake til oversikt
  window.location.href = "oversikt.html"; // <- juster hvis siden heter noe annet
});
}