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

onAuthStateChanged(auth, (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }
});

const db = getFirestore();

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
    halfLengthMin: 45,
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

const homeScorerWrapper =
  document.getElementById("homeScorerWrapper");

const opponentScorerWrapper =
  document.getElementById("opponentScorerWrapper");

const opponentScorerInput =
  document.getElementById("opponentScorerInput");

const goalScorerSelect =
  document.getElementById("goalScorer");

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

    if (
      !document
        .getElementById("playingTimePanel")
        .classList.contains("hidden")
    ) {
      updatePlayingTimeUI();
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
}
   
 function formatTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

let clockInterval = null;

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
    Number.isFinite(half) && half > 0 ? half : 45;

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
  matchState.status === "NOT_STARTED" &&
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
  const min = matchState.meta.halfLengthMin ?? 45;
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

  // Normaliser input
  const baseEvent =
    typeof event === "string"
      ? {
          type: "text",
          text: event
        }
      : event;

  // Full hendelse med rapportør
const fullEvent = {
  ...baseEvent,
  text: `${timestamp} – ${baseEvent.text}`,
  reportedAt: new Date().toISOString(),
  ...(user ? { reportedBy: user.uid } : {})
};

  // Legg til øverst i listen
  matchState.events.unshift(fullEvent);

  renderEvents();
}



function renderEvents() {
  const list = document.getElementById("eventList");
  list.innerHTML = "";

  matchState.events.forEach(event => {
    const li = document.createElement("li");
    li.textContent = event.text;
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
   
startBtn.addEventListener("click", async () => {
  if (!auth.currentUser) {
    alert("Du må være logget inn");
    return;
  }
  document.getElementById("preMatchMeta")
  .classList.add("hidden-meta");

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

  await saveNewMatch(); // ⬅️ lagres én gang, kontrollert

  matchState.status = "LIVE";
  matchState.period = 1;
  matchState.timer.startTimestamp = Date.now();
  matchState.timer.elapsedMs = 0;

lockMatchMetaInputs();
document.getElementById("preMatchMeta")?.classList.add("hidden");
document.getElementById("squadBtn")?.classList.add("hidden");
document.getElementById("venueToggleBtn")?.classList.add("hidden");
periodIndicator.textContent = "1. omgang";

  startPlayingTime();
  startClock();
  updateControls();
  addEvent("Kamp startet");
  updatePlayingTimeUI();
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

pauseBtn.addEventListener("click", () => {
  const now = Date.now();

  matchState.timer.elapsedMs +=
    now - matchState.timer.startTimestamp;

  matchState.timer.startTimestamp = null;
  matchState.status = "PAUSED";
  
  const pauseTimeMs = matchState.timer.elapsedMs;
pausePlayingTime(pauseTimeMs);

  stopClock();
  periodIndicator.textContent = "Pause";

  updateControls();
  const baseMs =
  matchState.period === 1
    ? getHalfLengthMs()
    : getHalfLengthMs() * 2;

const overtimeMs = Math.max(0, pauseTimeMs - baseMs);

let pauseText = "Pause";

if (overtimeMs > 0) {
  pauseText +=
    " – " +
    formatTime(baseMs) +
    " + " +
    formatTime(overtimeMs);
}

addEvent(pauseText);

});

endBtn.addEventListener("click", async () => {
  if (matchState.timer.startTimestamp) {
    matchState.timer.elapsedMs +=
      Date.now() - matchState.timer.startTimestamp;
    console.log("KAMPOPPSUMMERING:", getMatchSummary());
  }

  stopClock();
matchState.status = "ENDED";

document.getElementById("preMatchMeta")?.classList.remove("hidden");
document.getElementById("squadBtn")?.classList.remove("hidden");

const venueBtn = document.getElementById("venueToggleBtn");

if (venueBtn) {
  venueBtn.classList.remove("hidden");
  venueBtn.textContent = "Ny kamp";
  venueBtn.classList.remove("home", "away");
  venueBtn.classList.add("new-match");
  
  document.getElementById("preMatchMeta")
  .classList.remove("hidden-meta");
}

periodIndicator.textContent = "Kamp ferdig";
updateControls();

  const endTimeMs = getCurrentMatchTimeMs();

  matchState.squad.onField.home.forEach(playerId => {
    const player = matchState.players.home[playerId];
    const lastInterval = player.intervals.at(-1);

    if (lastInterval && lastInterval.out === null) {
      lastInterval.out = endTimeMs;
    }
  });

  addEvent("Kamp ferdig");
  updatePlayingTimeUI();
  
await saveFinalMatch();

  console.log("TOTAL SPILLETID (ms):", matchState.timer.elapsedMs);
});

resumeBtn.addEventListener("click", () => {
  matchState.status = "LIVE";

  // Hvis 1. omgang er ferdig → start 2. omgang
  if (matchState.timer.elapsedMs >= getHalfLengthMs()) {
    matchState.period = 2;
    matchState.timer.elapsedMs = getHalfLengthMs();
    periodIndicator.textContent = "2. omgang";
    addEvent("2. omgang startet");
  } else {
    // Ellers: vanlig fortsettelse av samme omgang
    periodIndicator.textContent =
      matchState.period === 1 ? "1. omgang" : "2. omgang";
    addEvent("Kampen gjenopptatt");
  }

  matchState.timer.startTimestamp = Date.now();
  resumePlayingTime(matchState.timer.elapsedMs);

  startClock();
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
  if (!isOnField(p.id)) {
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
  updatePlayingTimeUI();
  closeSubModal();
});

function calculateMinutesPlayed(player) {
  let totalMs = 0;

  player.intervals.forEach(interval => {
    const end = interval.out ?? getCurrentMatchTimeMs();
    totalMs += end - interval.in;
  });

  return Math.floor(totalMs / 60000);
}

document
  .getElementById("togglePlayingTimeBtn")
  .addEventListener("click", () => {
    const panel = document.getElementById("playingTimePanel");
    panel.classList.toggle("hidden");

    document.getElementById("togglePlayingTimeBtn").textContent =
      panel.classList.contains("hidden")
        ? "Vis spilletid"
        : "Skjul spilletid";
  });

function updatePlayingTimeUI() {
  const list = document.getElementById("playingTimeList");
  list.innerHTML = "";

  Object.values(matchState.players.home).forEach(player => {
    const minutes = calculateMinutesPlayed(player);

    const li = document.createElement("li");
    const cards = player.cards ?? [];
const yellow = cards.filter(c => c.type === "yellow").length;
const red = cards.some(c => c.type === "red");

let cardText = "";
if (yellow > 0) cardText += " 🟨".repeat(yellow);
if (red) cardText += " 🟥";

li.textContent =
  `${player.name} – ${minutes} min${cardText}`;

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
	const squadLocked = matchState.status !== "NOT_STARTED";
  const list = document.getElementById("squadList");
  list.innerHTML = "";
  
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
  starterCheckbox.checked =
    matchState.players.home[player.id]?.starter ?? false;
  starterCheckbox.disabled = squadLocked || !presentCheckbox.checked;

  const starterText = document.createElement("span");
  starterText.textContent = "Starter";

  starterLabel.append(starterCheckbox, starterText);

  /* ===== STARTFARGE ===== */
  if (starterCheckbox.checked) {
    li.classList.add("is-starter");
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
  starterCheckbox.addEventListener("change", () => {
  const currentStarters =
    document.querySelectorAll(".squad-row.is-starter").length;

  if (starterCheckbox.checked && currentStarters >= MAX_STARTERS) {
    starterCheckbox.checked = false;
    alert(`Maks ${MAX_STARTERS} startere`);
    return;
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

  updatePlayingTimeUI();
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

});


document.getElementById("saveSquadBtn").addEventListener("click", () => {
	if (matchState.status !== "NOT_STARTED") {
  return;
}
matchState.players.home = {};
matchState.squad.onField.home = [];

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
        minutes: calculateMinutesPlayed(p)
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

});

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

  if (matchState.userRole === "coach") {
    matchRef = doc(
      db,
      "matches",
      matchState.matchId
    );
  }

  else if (matchState.userRole === "assistantCoach") {
    matchRef = doc(
      db,
      "assistantMatches",
      user.uid,
      "matches",
      matchState.matchId
    );
  }

  else {
    console.error("Ugyldig rolle:", matchState.userRole);
    return;
  }

  /* ======================================================
     DATA
     ====================================================== */

const meta = {
  ourTeam: matchState.meta.ourTeam,
  opponent: matchState.meta.opponent,
  venue: matchState.meta.venue,
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
    matchRef = doc(
      db,
      "matches",
      matchState.matchId
    );
  }

  else if (matchState.userRole === "assistantCoach") {
    matchRef = doc(
      db,
      "assistantMatches",
      user.uid,
      "matches",
      matchState.matchId
    );
  }

  else {
    console.error("Ugyldig rolle ved lagring");
    return;
  }

  const summary = getMatchSummary();

  await setDoc(
    matchRef,
    {
      ...summary,
      status: "ENDED",
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  console.log(
    "Kamp avsluttet og lagret:",
    matchState.matchId,
    "Rolle:",
    matchState.userRole
  );
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

// Sett dagens dato og klokkeslett automatisk ved oppstart
document.addEventListener("DOMContentLoaded", function () {
  const now = new Date();

  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");

  const hh = String(now.getHours()).padStart(2, "0");
  const min = String(now.getMinutes()).padStart(2, "0");

  document.getElementById("matchDate").value = `${yyyy}-${mm}-${dd}`;
  document.getElementById("matchTime").value = `${hh}:${min}`;
});

const backBtn = document.getElementById("backBtn");

if (backBtn) {
  backBtn.addEventListener("click", () => {
    window.location.href = "oversikt.html";
  });
}