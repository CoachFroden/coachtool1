import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp
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

function getMatchIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get("matchId");
}

function getMatchRef() {
  const user = auth.currentUser;

  // 🔴 STOPP hvis auth ikke er klar
  if (!user || !matchState.userRole || !matchState.matchId) {
    console.error("Auth ikke klar enda");
    return null;
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
  { id: "h18", name: "William" },
 // { id: "h19", name: "Lånespiller 1" },
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
    const events = document.getElementById("events");
  const extraEvents = document.getElementById("extra-events");  





function populateGoalScorers(team) {
  goalScorerSelect.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Velg spiller";
  goalScorerSelect.appendChild(placeholder);

  if (team !== "home") return;

  const onField = matchState.squad.onField.home;

  Object.values(matchState.players.home)
    .filter(p => isOnField(p.id))
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
  matchState.score.our += 1;

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
    matchState.score.their += 1;

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
  saveLiveUpdate();
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

    clockSection.style.display = "none";
    matchControls.style.display = "none";
    events.style.display = "none";
    extraEvents.style.display = "none";
    eventLog.style.display = "none";
  }

  if (matchState.status === "LIVE" || matchState.status === "PAUSED") {
    preMatch.classList.add("hidden");
    matchUI.classList.remove("hidden");

    clockSection.style.display = "block";
    matchControls.style.display = "block";
    events.style.display = "block";
    extraEvents.style.display = "block";
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

  // avslutt intervallet til spilleren som går ut
  const lastInterval = outPlayer.intervals.at(-1);
  if (lastInterval && lastInterval.out === null) {
    lastInterval.out = timeMs;
  }

  // start intervallet til spilleren som går inn
  inPlayer.intervals.push({
    in: timeMs,
    out: null
  });

  // oppdater hvem som er på banen
  removeFromField(outId);
  addToField(inId);

  // 🔔 LOGG HENDELSEN
  const minuteText = formatMatchMinute(timeMs);
addEvent(
  `🔁 ${minuteText} – ${outPlayer.name} ut, ${inPlayer.name} inn`
);
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
   BUTTON HANDLERS
   ====================================================== */
   
startBtn.addEventListener("click", () => {

  if (!auth.currentUser) {
    alert("Du må være logget inn");
    return;
  }

  document.getElementById("preMatchMeta")
    .classList.add("hidden-meta");

  // 🔥 LEGG DENNE HER
  clockSection.style.display = "block";

  readMatchMetaFromUI();

  if (!matchState.meta.ourTeam || !matchState.meta.opponent) {
    alert("Legg inn begge lagnavn før start.");
    return;
  }
  
  if (!matchState.meta.date || !matchState.meta.startTime) {
  alert("Du må sette dato og starttid før kampen starter.");
  return;
}


matchState.matchId = crypto.randomUUID();
matchState.createdAt = new Date().toISOString();
localStorage.setItem("activeMatchId", matchState.matchId);

matchState.status = "LIVE";
matchState.period = 1;
matchState.timer.startTimestamp = Date.now();
matchState.timer.elapsedMs = 0;

saveNewMatch();
saveLiveUpdate();

lockMatchMetaInputs();
periodIndicator.textContent = "1. omgang";

startPlayingTime();
startClock();

updateControls();
addEvent("Kamp startet");
updateUIByStatus();

setTimeout(() => {
  updatePlayingTimeUI();
}, 0);
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

  matchState.timer.elapsedMs +=
    now - matchState.timer.startTimestamp;

  matchState.timer.startTimestamp = null;
  matchState.status = "PAUSED";

  pausePlayingTime(matchState.timer.elapsedMs);

  stopClock();
  periodIndicator.textContent = "Pause i kampen";

addEvent("⏸️ Pause i kampen");

updateControls();

setTimeout(() => {
  updatePlayingTimeUI();
}, 0);
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
  matchState.timer.startTimestamp = Date.now();

  periodIndicator.textContent = "2. omgang";

  resumePlayingTime(matchState.timer.elapsedMs);

  startClock();
  addEvent("▶️ 2. omgang startet");
  updateControls();
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
    timeMs = getCurrentMatchTimeMs();
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
  if (matchState.meta.venue === "home") {
    venueToggleBtn.textContent = "Hjemmekamp";
    venueToggleBtn.classList.remove("away");
    venueToggleBtn.classList.add("home");
  } else {
    venueToggleBtn.textContent = "Bortekamp";
    venueToggleBtn.classList.remove("home");
    venueToggleBtn.classList.add("away");
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
	const squadLocked = !["NOT_STARTED", "UPCOMING"].includes(matchState.status);
  const list = document.getElementById("squadList");
  list.innerHTML = "";
  
  // 🔥 INIT DEFAULT STATE (VIKTIG)
HOME_SQUAD.forEach(p => {

  // hvis spiller ikke finnes → lag ny
  if (!matchState.players.home[p.id]) {
    matchState.players.home[p.id] = {
      id: p.id,
      name: p.name,
      present: true,
      starter: true,
      intervals: [],
      cards: []
    };
  }

  // 🔥 VIKTIG: hvis kampen IKKE er startet → reset starter
  if (["NOT_STARTED", "UPCOMING"].includes(matchState.status)) {
    matchState.players.home[p.id].present = true;
    matchState.players.home[p.id].starter = true;
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

  HOME_SQUAD.forEach(player => {
  const li = document.createElement("li");
  li.className = "squad-row";
  li.dataset.playerId = player.id;
  

  /* ===== TILSTEDE ===== */
  const presentLabel = document.createElement("label");
  presentLabel.className = "checkbox";

const presentCheckbox = document.createElement("input");
presentCheckbox.type = "checkbox";
presentCheckbox.checked =
  matchState.players.home[player.id]?.present ?? true;
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
  existing ? existing.starter : true;
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
  if (!presentCheckbox.checked) {
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

  // 🔥 KUN hvis bruker faktisk klikker
  if (e.isTrusted) {
    const currentStarters =
      document.querySelectorAll(".squad-row.is-starter").length;

    if (starterCheckbox.checked && currentStarters >= MAX_STARTERS) {
      starterCheckbox.checked = false;
      alert(`Maks ${MAX_STARTERS} startere`);
      return;
    }
  }

  li.classList.toggle("is-starter", starterCheckbox.checked);
  updateStarterCounter();
});

  /* ===== NAVN ===== */
  const nameSpan = document.createElement("span");
  nameSpan.className = "player-name";
  nameSpan.textContent = player.name;

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
  matchState.squad.onField.home.forEach(id => {
    const p = matchState.players.home[id];
    if (!p) return;
	if (p.cards?.some(c => c.type === "red")) return; // skjul utviste

    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = p.name;
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

  matchState.players.home = {};
  matchState.squad.onField.home = [];

  // resten av koden din...

document.querySelectorAll("#squadList li").forEach(li => {
  const id = li.dataset.playerId;
  const [present, starter] = li.querySelectorAll("input");

  const base = HOME_SQUAD.find(p => p.id === id);

  // 🔴 Hvis ikke tilstede → hopp over helt
  if (!present.checked) {
    return;
  }

  // ✅ Kun tilstedeværende spillere legges inn
  matchState.players.home[id] = {
    id,
    name: base.name,
    present: true,
    starter: starter.checked,
    intervals: [],
    cards: []
  };

  if (starter.checked) {
    addToField(id);
  }
});

matchState.lineupConfirmed = true;
document.getElementById("matchUI").classList.remove("hidden");
updateControls();
document.getElementById("squadModal").classList.add("hidden");
updatePlayingTimeUI();

});

document.getElementById("cancelSquadBtn")
  .addEventListener("click", () =>
    document.getElementById("squadModal").classList.add("hidden")
  );

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
    status: "LIVE",
    score: {
      our: 0,
      their: 0
    },
    squad: {
      present,
      starters
    },
    ownerUid: user.uid,
    role: matchState.userRole,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(matchRef, matchData);

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

  await setDoc(
    matchRef,
    {
      // 🔥 LEGG TIL DETTE
      meta: matchState.meta,
      score: matchState.score,
      events: matchState.events,

      // 🔥 DETTE ER VIKTIG FOR STATISTIKK
      type: matchState.meta.type,

      // resten
      ...summary,
      status: "ENDED",
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  console.log("Kamp avsluttet:", matchState.matchId);
}

async function saveLiveUpdate() {
  const user = auth.currentUser;
  if (!user) return;

  const matchRef = getMatchRef();
  if (!matchRef) return;   // 👈 LEGG TIL DENNE

  await setDoc(matchRef, {
  score: matchState.score,
  events: matchState.events,
  period: matchState.period,
  status: matchState.status,
  timer: {
    elapsedMs: matchState.timer.elapsedMs,
    startTimestamp: matchState.timer.startTimestamp
  },

  // 🔥 LEGG TIL DENNE
  players: matchState.players.home,
  onField: matchState.squad.onField.home,

  updatedAt: serverTimestamp()
}, { merge: true });
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
  if (matchState.status === "LIVE" && matchState.timer.startTimestamp) {
    saveLiveUpdate();
    console.log("Autosave (5 min)");
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

  // prøv assistant sin egen først
  matchRef = doc(
    db,
    "assistantMatches",
    user.uid,
    "matches",
    matchId
  );

  snap = await getDoc(matchRef);

  // fallback → coach sin kamp
  if (!snap.exists()) {
    matchRef = doc(db, "matches", matchId);
    snap = await getDoc(matchRef);
  }

} else {
  // coach
  matchRef = doc(db, "matches", matchId);
  snap = await getDoc(matchRef);
}

if (!snap.exists()) {
  console.log("❌ Fant ikke kamp i Firestore");

  // 🔥 RESET ALT
  localStorage.removeItem("activeMatchId");

  // 👉 send bruker tilbake til start
  window.location.href = "kamp.html";

  return;
}

console.log("✅ Fant kamp:", snap.data());

snap = await getDoc(matchRef);
  if (!snap.exists()) return;

  const data = snap.data();

  // ❗ Hvis ferdig → nullstill
  if (data.status === "ENDED") {
    localStorage.removeItem("activeMatchId");
    return;
  }

  console.log("Gjenoppretter kamp:", matchId);

  /* =========================
     META + UI
  ========================= */

  matchState.matchId = matchId;
  matchState.meta = data.meta || {};

homeTeamInput.value =
  matchState.meta?.ourTeam?.trim() || "Samnanger";

awayTeamInput.value =
  matchState.meta?.opponent?.trim() || "Motstander";
  
  dateInput.value = matchState.meta.date || "";
  timeInput.value = matchState.meta.startTime || matchState.meta.time || "";
  halfLengthInput.value = matchState.meta.halfLengthMin || 35;

  updateVenueToggle();

  /* =========================
     SCORE + EVENTS
  ========================= */

  matchState.score = data.score || { our: 0, their: 0 };
  matchState.events = data.events || [];

  /* =========================
     PLAYERS (KJERNE)
  ========================= */

  matchState.players.home = data.players || {};
  // 🔥 FULL fallback hvis ingenting finnes (kritisk)
if (!data.players && (!data.squad || !data.squad.present?.length)) {
  HOME_SQUAD.forEach(p => {
    matchState.players.home[p.id] = {
      id: p.id,
      name: p.name,
      present: true,
      starter: false,
      intervals: [],
      cards: []
    };
  });
}
  matchState.squad.onField.home = [];

  // 🔥 sørg for struktur
  Object.values(matchState.players.home).forEach(p => {
    if (!p.intervals) p.intervals = [];
    if (!p.cards) p.cards = [];
  });

  // 🔥 fallback hvis players mangler noen
  (data.squad?.present || []).forEach(p => {
    if (!matchState.players.home[p.id]) {
      matchState.players.home[p.id] = {
        id: p.id,
        name: p.name,
        present: true,
        starter: false,
        intervals: [],
        cards: []
      };
    }
  });

  /* =========================
     ON FIELD (VIKTIG)
  ========================= */

  if (data.onField && data.onField.length > 0) {
    matchState.squad.onField.home = data.onField;
  } else {
    Object.values(matchState.players.home).forEach(p => {
      if (p.starter) {
        matchState.squad.onField.home.push(p.id);
      }
    });
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

  matchState.lineupConfirmed =
  Object.keys(matchState.players.home || {}).length > 0;
  updateControls();

  /* =========================
     STATUS + TIMER
  ========================= */

  matchState.period = data.period || 1;
  matchState.status = data.status || "NOT_STARTED";
  matchState.timer.elapsedMs = data.timer?.elapsedMs || 0;

if (matchState.status === "LIVE") {

  matchState.timer.startTimestamp =
    data.timer?.startTimestamp ?? Date.now();

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

updateScoreboard();
renderEvents();
updateControls();
updateUIByStatus();
teams.style.display = "flex";

if (matchState.status === "LIVE" || matchState.status === "PAUSED") {
  document.getElementById("matchUI")?.classList.remove("hidden");
}

setTimeout(() => {
  updatePlayingTimeUI();
}, 0);
}

document.addEventListener("DOMContentLoaded", () => {

  const startNewMatchBtn = document.getElementById("startNewMatchBtn");
  const activeMatchId = localStorage.getItem("activeMatchId");
  
  // 👉 START: vis KUN startknapp
  startScreen.style.display = "block";
  preMatch.classList.add("hidden");
  teams.style.display = "none";
  clockSection.style.display = "none";
  matchControls.style.display = "none";
  events.style.display = "none";
  extraEvents.style.display = "none";
  eventLog.style.display = "none";

  // 👉 KLIKK
  startNewMatchBtn.addEventListener("click", () => {

    startScreen.style.display = "none";
    preMatch.classList.remove("hidden");
    teams.style.display = "flex";
    clockSection.style.display = "block";
    matchControls.style.display = "block";
    events.style.display = "block";
    extraEvents.style.display = "block";
    eventLog.style.display = "block";
  });

});