import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";

import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  arrayUnion,
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

import {
  getMessaging,
  getToken,
  isSupported as isMessagingSupported
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

const firebaseConfig = {
  apiKey: "AIzaSyAKZMu2HZPmmoZ1fFT7DNA9Q6ystbKEPgE",
  authDomain: "samnanger-g14-f10a1.firebaseapp.com",
  projectId: "samnanger-g14-f10a1",
  storageBucket: "samnanger-g14-f10a1.firebasestorage.app",
  messagingSenderId: "926427862844",
  appId: "1:926427862844:web:eeb814a349e9bfd701b039"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth();

const db = getFirestore();
const cloudFunctions = getFunctions(firebaseApp, "europe-west1");
const sendMatchPushTest = httpsCallable(cloudFunctions, "testMatchPushNotification");

const saveStatusElement = document.getElementById("saveStatus");
let saveStatusVersion = 0;
let activeMatchDocumentRef = null;
let unsubscribeActiveMatch = null;
let lastAppliedRemoteUpdateMs = 0;

function beginSaveStatus() {
  const version = ++saveStatusVersion;
  saveStatusElement.textContent = "Lagrer …";
  saveStatusElement.className = "save-status saving";
  return version;
}

function finishSaveStatus(version, succeeded) {
  // Et eldre lagringskall skal ikke overskrive statusen til et nyere kall.
  if (version !== saveStatusVersion) return;

  saveStatusElement.textContent = succeeded
    ? "✓ Lagret"
    : "Kunne ikke lagre – prøv igjen";
  saveStatusElement.className = succeeded
    ? "save-status saved"
    : "save-status error";
}

async function safeSetDoc(ref, data, options = {}) {
  const saveVersion = beginSaveStatus();

  try {
    if (!ref) {
      console.warn("❌ Mangler docRef – lagring hoppet over");
      finishSaveStatus(saveVersion, false);
      return false;
    }

    await setDoc(ref, data, options);
    finishSaveStatus(saveVersion, true);
    return true;

  } catch (error) {
    console.error("🔥 Firestore setDoc feil:", error);
    finishSaveStatus(saveVersion, false);
    alert("Noe gikk galt ved lagring. Prøv igjen.");
    return false;
  }
}

let matchStarted = false;
let isSquadModalOpen = false;
let squadDraftSnapshot = null;
let pendingNewLoanPlayerId = null;
const KAMP_PAGE_VERSION = "20260820-1";

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

  // Bruk dokumentet kampen faktisk ble lastet fra. Dette er særlig viktig
  // når en assistent åpner en kamp som ligger i trenerens matches-samling.
  if (activeMatchDocumentRef?.id === matchState.matchId) {
    return activeMatchDocumentRef;
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
  liveSharingEnabled: false,
  halftimeStartedAt: null,
  firstHalfActualEndMs: null,

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
    extraPlayingTimeMs: 0,
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
 // { id: "h18", name: "William" },
 //{ id: "h19", name: "Lån 1" },
 // { id: "h20", name: "Lånespiller 2" },
 // { id: "h21", name: "Lånespiller 3" },
 // { id: "h22", name: "Lånespiller 4" },
 // { id: "h23", name: "Lånespiller 5" },
 // { id: "h24", name: "Lånespiller 6" },
 // { id: "h25", name: "Lånespiller 7" }
];

const RETIRED_PLAYER_NAMES = new Set(["torvald"]);

function isRetiredPlayerName(value) {
  const firstName = String(value || "")
    .trim()
    .split(/\s+/)[0]
    .toLocaleLowerCase("no");

  return RETIRED_PLAYER_NAMES.has(firstName);
}

const DEFAULT_451_LINEUP = [
  { id: "h15", name: "Thage", x: 50, y: 93 },
  { id: "h3", name: "Gabriel", x: 15, y: 75 },
  { id: "h1", name: "Ask", x: 38, y: 80 },
  { id: "h7", name: "Martin", x: 62, y: 80 },
  { id: "h2", name: "Brage", x: 85, y: 75 },
  { id: "h5", name: "Liam", x: 12, y: 48 },
  { id: "h4", name: "Lars", x: 31, y: 54 },
  { id: "h8", name: "Nicolai", x: 50, y: 58 },
  { id: "h12", name: "Snorre", x: 69, y: 54 },
  { id: "h6", name: "Lukas", x: 88, y: 48 },
  { id: "h10", name: "Noah", x: 50, y: 22 }
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
const halfTimeBtn = document.getElementById("halfTimeBtn");
const resumeBtn = document.getElementById("resumeBtn");
const endBtn = document.getElementById("endBtn");

const eventList = document.getElementById("eventList");
const periodIndicator = document.getElementById("period-indicator");

const matchReminder = document.getElementById("matchReminder");
const matchReminderText = document.getElementById("matchReminderText");
const matchReminderActionBtn = document.getElementById("matchReminderActionBtn");
const dismissReminderBtn = document.getElementById("dismissReminderBtn");
const enableReminderSoundBtn = document.getElementById("enableReminderSoundBtn");
const enableMatchPushDuringBtn = document.getElementById("enableMatchPushDuringBtn");
const reminderNotificationStatus = document.getElementById("reminderNotificationStatus");
const HALFTIME_REMINDER_MS = 10 * 60 * 1000;
const REMINDER_REPEAT_MS = 30 * 1000;
const MATCH_PUSH_VAPID_KEY = "BMliWkFTxc-mlxFygGosVuvYirsguGa-lpUiYUhWwpkmwkP_bJXFZRtpUetZ3NSa4YY7sig2ikaVoTTtlTg0x8o";
const MATCH_PUSH_SW_VERSION = "20260818-5";

let activeReminderKey = null;
let lastReminderAt = 0;
let reminderAudioContext = null;
let reminderAudioUnlocked = false;
let reminderTargetButton = null;

function getReminderAudioContext() {
  if (reminderAudioContext) return reminderAudioContext;

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;

  reminderAudioContext = new AudioContextClass();
  return reminderAudioContext;
}

async function unlockReminderAudio() {
  const audioContext = getReminderAudioContext();
  if (!audioContext) return false;

  try {
    if (audioContext.state === "suspended") {
      await audioContext.resume();
    }

    // En uhørbar, svært kort tone låser opp lyd på iPhone etter et brukertrykk.
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.02);
    reminderAudioUnlocked = audioContext.state === "running";
    return reminderAudioUnlocked;
  } catch (error) {
    console.warn("Kunne ikke aktivere lydvarsler:", error);
    return false;
  }
}

function playReminderTone(reminderKey) {
  const audioContext = getReminderAudioContext();
  if (!audioContext || !reminderAudioUnlocked || audioContext.state !== "running") {
    return;
  }

  const frequencies = reminderKey === "match-start"
    ? [660, 880, 1040]
    : [880, 660, 880];
  const startAt = audioContext.currentTime + 0.02;

  frequencies.forEach((frequency, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const toneStart = startAt + index * 0.24;
    const toneEnd = toneStart + 0.16;

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, toneStart);
    gain.gain.setValueAtTime(0.0001, toneStart);
    gain.gain.exponentialRampToValueAtTime(0.22, toneStart + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, toneEnd);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start(toneStart);
    oscillator.stop(toneEnd + 0.02);
  });
}

document.addEventListener("pointerdown", unlockReminderAudio, { capture: true });
document.addEventListener("keydown", unlockReminderAudio, { capture: true });

function setMatchPushButtonState(state, statusText = "") {
  const states = {
    idle: {
      icon: "🔔",
      title: "Aktiver kampvarsler",
      detail: "Lyd + låseskjerm"
    },
    loading: {
      icon: "◌",
      title: "Aktiverer …",
      detail: "Kobler til mobilen"
    },
    active: {
      icon: "✓",
      title: "Kampvarsler er på",
      detail: "Også på låseskjermen"
    },
    foreground: {
      icon: "🔊",
      title: "Lydvarsel er på",
      detail: "Legg appen på Hjem-skjermen for push"
    },
    error: {
      icon: "!",
      title: "Varsler er blokkert",
      detail: "Åpne Varslinger i iPhone-innstillinger"
    }
  };
  const content = states[state] || states.idle;

  if (enableReminderSoundBtn) {
    enableReminderSoundBtn.classList.toggle("is-active", state === "active");
    enableReminderSoundBtn.classList.toggle("is-loading", state === "loading");
    enableReminderSoundBtn.classList.toggle("is-error", state === "error");
    enableReminderSoundBtn.disabled = state === "loading";
    enableReminderSoundBtn.innerHTML = `
      <span class="match-alert-orb" aria-hidden="true">${content.icon}</span>
      <span class="match-alert-copy">
        <strong>${content.title}</strong>
        <small>${content.detail}</small>
      </span>
    `;
  }

  if (enableMatchPushDuringBtn) {
    enableMatchPushDuringBtn.classList.toggle("is-active", state === "active");
    enableMatchPushDuringBtn.classList.toggle("is-error", state === "error");
    enableMatchPushDuringBtn.disabled = state === "loading";
    enableMatchPushDuringBtn.textContent = state === "active"
      ? "✓ Låseskjermvarsler er på"
      : state === "loading"
        ? "Aktiverer varsler …"
        : state === "error"
          ? "! Varsler er blokkert"
          : "🔔 Aktiver låseskjermvarsler";
  }

  if (reminderNotificationStatus) {
    reminderNotificationStatus.textContent = statusText;
    reminderNotificationStatus.classList.toggle("is-error", state === "error");
  }
}

function isIosDevice() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isRunningAsInstalledApp() {
  return window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
}

async function enableMatchPushNotifications({ showReadyNotification = false } = {}) {
  const audioEnabled = await unlockReminderAudio();
  if (audioEnabled) playReminderTone("match-start");

  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    setMatchPushButtonState(
      "foreground",
      isIosDevice()
        ? "Åpne siden fra ikonet på Hjem-skjermen for å få låseskjermvarsler."
        : "Denne nettleseren støtter ikke låseskjermvarsler."
    );
    return false;
  }

  if (isIosDevice() && !isRunningAsInstalledApp()) {
    setMatchPushButtonState(
      "foreground",
      "Del → Legg til på Hjem-skjermen, og aktiver varsler derfra."
    );
    return false;
  }

  setMatchPushButtonState("loading", "Ber iPhone om tillatelse …");

  try {
    const supported = await isMessagingSupported();
    if (!supported) {
      setMatchPushButtonState(
        "foreground",
        "Lyd virker mens kampen er åpen, men push støttes ikke her."
      );
      return false;
    }

    let permission = Notification.permission;
    if (permission === "default") {
      permission = await Notification.requestPermission();
    }

    if (permission !== "granted") {
      setMatchPushButtonState(
        "error",
        permission === "denied"
          ? "Varsler er avslått. Tillat dem under Innstillinger → Varslinger."
          : "Du må tillate varsler for å få beskjed når telefonen er låst."
      );
      return false;
    }

    const user = auth.currentUser;
    if (!user) throw new Error("Du må være logget inn for å aktivere kampvarsler.");

    const serviceWorkerRegistration = await navigator.serviceWorker.register(
      `./firebase-messaging-sw.js?v=${MATCH_PUSH_SW_VERSION}`,
      { updateViaCache: "none" }
    );
    await serviceWorkerRegistration.update().catch(() => {});

    const messaging = getMessaging(firebaseApp);
    const token = await getToken(messaging, {
      vapidKey: MATCH_PUSH_VAPID_KEY,
      serviceWorkerRegistration
    });

    if (!token) throw new Error("Mobilen ga ikke fra seg et varslingstoken.");

    await setDoc(doc(db, "adminTokens", user.uid), {
      token,
      tokens: arrayUnion(token),
      platform: isIosDevice() ? "ios-web-app" : "web",
      matchRemindersEnabled: true,
      updatedAt: serverTimestamp()
    }, { merge: true });

    localStorage.setItem("matchPushNotificationsEnabled", "true");
    setMatchPushButtonState("active", "Pause og kampslutt varsles automatisk.");

    if (showReadyNotification) {
      setMatchPushButtonState(
        "active",
        "Lås telefonen nå – et ekte testvarsel kommer om 8 sekunder."
      );

      sendMatchPushTest({ token, delaySeconds: 8 })
        .then(result => {
          const delivered = Number(result?.data?.successCount) || 0;
          setMatchPushButtonState(
            "active",
            delivered > 0
              ? "Testvarsel sendt. Pause og kampslutt varsles automatisk."
              : "Varsler er aktivert, men testen kunne ikke leveres."
          );
        })
        .catch(error => {
          console.error("Kunne ikke sende testvarsel:", error);
          setMatchPushButtonState(
            "error",
            "Telefonen ble registrert, men testvarslet feilet. Trykk for å prøve igjen."
          );
        });
    }

    return true;
  } catch (error) {
    console.error("Kunne ikke aktivere kampvarsler:", error);
    setMatchPushButtonState(
      "error",
      error?.message || "Kunne ikke koble til varslingstjenesten."
    );
    return false;
  }
}

enableReminderSoundBtn?.addEventListener("click", () => {
  enableMatchPushNotifications({ showReadyNotification: true });
});

enableMatchPushDuringBtn?.addEventListener("click", () => {
  enableMatchPushNotifications({ showReadyNotification: true });
});

setMatchPushButtonState(
  typeof Notification !== "undefined" &&
    Notification.permission === "granted" &&
    localStorage.getItem("matchPushNotificationsEnabled") === "true"
    ? "active"
    : "idle"
);

function clearMatchReminder() {
  matchReminder.classList.add("hidden");
  document.querySelectorAll(".reminder-pulse").forEach(element => {
    element.classList.remove("reminder-pulse");
  });
  document.title = "Kampregistrering";
}

function showOverviewReturnMode() {
  clearMatchReminder();
  document.body.classList.add("overview-return-mode");
  startScreen.style.display = "block";
}

function getEventMatchTimeMs(event) {
  if (Number.isFinite(event?.timeMs)) {
    return event.timeMs;
  }

  const minuteText = String(event?.minute || "").trim();
  const minuteMatch = minuteText.match(/^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?$/);
  if (minuteMatch) {
    return (Number(minuteMatch[1]) + Number(minuteMatch[2] || 0)) * 60 * 1000;
  }

  const rawText = String(event?.rawText || event?.text || "");
  const rawMinuteMatch = rawText.match(
    /(?:^|\s)(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*[–-]/u
  );
  if (rawMinuteMatch) {
    return (Number(rawMinuteMatch[1]) + Number(rawMinuteMatch[2] || 0)) * 60 * 1000;
  }

  if (/kamp(?:en)? startet/i.test(rawText)) return 0;
  if (/pause|2\. omgang startet/i.test(rawText)) return getHalfLengthMs();

  return null;
}

function getEventSortPeriod(event) {
  if (Number.isFinite(event?.period)) return event.period;
  const text = String(event?.rawText || event?.text || "");
  if (/kamp avsluttet/i.test(text)) return 3;
  if (/2\. omgang/i.test(text)) return 2;
  return 1;
}

function getEventReportedTime(event) {
  const clockText = String(event?.createdClock || event?.text || "");
  const clockMatch = clockText.match(/(?:^|\s)(\d{1,2}):(\d{2})(?=\s|$)/);
  if (clockMatch) {
    return (Number(clockMatch[1]) * 60 + Number(clockMatch[2])) * 60 * 1000;
  }

  const reportedAt = new Date(event?.reportedAt || "");
  if (Number.isNaN(reportedAt.getTime())) return null;

  return (
    reportedAt.getHours() * 60 * 60 * 1000 +
    reportedAt.getMinutes() * 60 * 1000 +
    reportedAt.getSeconds() * 1000 +
    reportedAt.getMilliseconds()
  );
}

function getEventDisplayText(event) {
  const rawText = String(event?.rawText || event?.text || "Hendelse")
    .replace(/^\s*\d{1,2}:\d{2}\s*[–-]\s*/, "");
  const isMatchMilestone =
    /kamp(?:en)? startet|pause|1\. omgang avsluttet|2\. omgang startet|kamp avsluttet/i
      .test(rawText);

  if (!isMatchMilestone) return rawText;

  const clock = event?.createdClock ||
    String(event?.text || "").match(/^\s*(\d{1,2}:\d{2})/)?.[1];
  return clock ? `${clock} – ${rawText}` : rawText;
}

function renderFinalEventReview() {
  const review = document.getElementById("finalEventReview");
  const list = document.getElementById("finalEventList");
  const count = document.getElementById("finalEventCount");
  if (!review || !list || !count) return;

  const events = (matchState.events || [])
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const periodDifference = getEventSortPeriod(a.event) - getEventSortPeriod(b.event);
      if (periodDifference !== 0) return periodDifference;

      const aTime = getEventMatchTimeMs(a.event);
      const bTime = getEventMatchTimeMs(b.event);
      if (aTime !== null && bTime !== null && aTime !== bTime) {
        return aTime - bTime;
      }

      const aReported = getEventReportedTime(a.event);
      const bReported = getEventReportedTime(b.event);
      if (aReported !== null && bReported !== null && aReported !== bReported) {
        return aReported - bReported;
      }
      return b.index - a.index;
    })
    .map(entry => entry.event);

  list.innerHTML = "";

  events.forEach(event => {
    const row = document.createElement("div");
    row.className = "final-event-item";
    row.textContent = getEventDisplayText(event);
    list.appendChild(row);
  });

  count.textContent = `${events.length} hendelser`;
  review.classList.toggle("hidden", events.length === 0);
}

function getSortedGoalEvents() {
  return (matchState.events || [])
    .map((event, index) => ({ event, index }))
    .filter(({ event }) =>
      event?.type === "goal" || /⚽/.test(event?.rawText || event?.text || "")
    )
    .sort((a, b) => {
      const periodDifference = getEventSortPeriod(a.event) - getEventSortPeriod(b.event);
      if (periodDifference !== 0) return periodDifference;

      const aTime = getEventMatchTimeMs(a.event);
      const bTime = getEventMatchTimeMs(b.event);
      if (aTime !== null && bTime !== null && aTime !== bTime) {
        return aTime - bTime;
      }
      return a.index - b.index;
    })
    .map(entry => entry.event);
}

function getGoalMinuteLabel(event) {
  const storedMinute = String(event?.minute || "").trim();
  if (storedMinute) return storedMinute;

  const text = String(event?.rawText || event?.text || "");
  const match = text.match(/⚽\s*(\d{1,3}(?:\s*\+\s*\d{1,2})?)/u);
  if (match) return match[1].replace(/\s*\+\s*/, " + ");

  const timeMs = getEventMatchTimeMs(event);
  if (timeMs === null) return "–";
  return String(Math.max(1, Math.ceil(timeMs / 60000)));
}

function getGoalScorerName(event) {
  if (event?.playerName) return event.playerName;

  const text = getEventDisplayText(event);
  const scorerMatch = text.match(
    /⚽\s*\d{1,3}(?:\s*\+\s*\d{1,2})?\s*[–-]\s*(.+?)(?:\s*\([^)]*\))?$/u
  );
  return scorerMatch?.[1]?.trim() || "Ukjent spiller";
}

function getFinalFixture() {
  const ourTeam = matchState.meta.ourTeam?.trim() || "Samnanger";
  const opponent = matchState.meta.opponent?.trim() || "Motstander";
  const isAway = matchState.meta.venue === "away" || matchState.meta.venueType === "away";

  return isAway
    ? {
        homeTeam: opponent,
        awayTeam: ourTeam,
        homeScore: matchState.score.their,
        awayScore: matchState.score.our,
        ourTeam,
        opponent
      }
    : {
        homeTeam: ourTeam,
        awayTeam: opponent,
        homeScore: matchState.score.our,
        awayScore: matchState.score.their,
        ourTeam,
        opponent
      };
}

function formatShareDate(dateString) {
  const match = String(dateString || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";

  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return new Intl.DateTimeFormat("nb-NO", {
    day: "numeric",
    month: "long",
    year: "numeric"
  }).format(date);
}

function buildGoalOverviewText() {
  const goals = getSortedGoalEvents();
  const fixture = getFinalFixture();
  const date = formatShareDate(matchState.meta.date);
  const lines = [
    "Måloversikt",
    `${fixture.homeTeam} – ${fixture.awayTeam} ${fixture.homeScore}–${fixture.awayScore}`
  ];

  if (date) lines.push(date);

  const appendTeamGoals = (teamKey, teamName) => {
    const teamGoals = goals.filter(event => event.team === teamKey);
    if (teamGoals.length === 0) return;

    lines.push("", `${teamName}:`);
    teamGoals.forEach(event => {
      lines.push(`${getGoalMinuteLabel(event)}. min – ${getGoalScorerName(event)}`);
    });
  };

  appendTeamGoals("home", fixture.ourTeam);
  appendTeamGoals("away", fixture.opponent);

  if (goals.length === 0) {
    lines.push("", "Ingen mål registrert.");
  }

  return lines.join("\n");
}

function renderFinalGoalShare() {
  const panel = document.getElementById("finalGoalShare");
  const score = document.getElementById("finalGoalScore");
  const count = document.getElementById("finalGoalCount");
  const list = document.getElementById("finalGoalList");
  const status = document.getElementById("shareGoalsStatus");
  if (!panel || !score || !count || !list || !status) return;

  const fixture = getFinalFixture();
  const goals = getSortedGoalEvents();

  score.textContent =
    `${fixture.homeTeam} ${fixture.homeScore}–${fixture.awayScore} ${fixture.awayTeam}`;
  count.textContent = `${goals.length} ${goals.length === 1 ? "mål" : "mål"}`;
  list.replaceChildren();
  status.textContent = "";

  if (goals.length === 0) {
    const empty = document.createElement("p");
    empty.className = "final-goal-empty";
    empty.textContent = "Ingen mål er registrert i kampen.";
    list.appendChild(empty);
  } else {
    goals.forEach(event => {
      const row = document.createElement("div");
      row.className = "final-goal-item";

      const minute = document.createElement("span");
      minute.className = "final-goal-minute";
      minute.textContent = `${getGoalMinuteLabel(event)}′`;

      const details = document.createElement("span");
      details.className = "final-goal-details";

      const scorer = document.createElement("strong");
      scorer.textContent = getGoalScorerName(event);

      const team = document.createElement("small");
      team.textContent = event.team === "away" ? fixture.opponent : fixture.ourTeam;

      details.append(scorer, team);
      row.append(minute, details);
      list.appendChild(row);
    });
  }

  panel.classList.remove("hidden");
}

async function copyGoalOverview(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textArea = document.createElement("textarea");
  textArea.value = text;
  textArea.setAttribute("readonly", "");
  textArea.style.position = "fixed";
  textArea.style.opacity = "0";
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  textArea.remove();
}

function getPublicMatchUrl() {
  const url = new URL("kamp-live.html", window.location.href);
  url.search = "";
  url.searchParams.set("app", "1");
  return url.toString();
}

function getLiveShareFixtureLabel() {
  const fixture = getFinalFixture();
  return `${fixture.homeTeam} – ${fixture.awayTeam}`;
}

async function shareLiveMatch(button) {
  const status = document.getElementById("shareLiveMatchStatus");
  if (!matchState.matchId) {
    if (status) status.textContent = "Kunne ikke finne kampen.";
    return;
  }

  readMatchMetaFromUI();
  matchState.liveSharingEnabled = true;
  button.disabled = true;
  const originalText = button.textContent;
  button.textContent = "Klargjør…";

  const published = await saveLiveUpdate();
  if (!published) {
    button.disabled = false;
    button.textContent = originalText;
    if (status) status.textContent = "Kunne ikke klargjøre livevisningen. Prøv igjen.";
    return;
  }

  const url = getPublicMatchUrl();
  const text = `Følg ${getLiveShareFixtureLabel()} live:`;

  if (navigator.share) {
    try {
      await navigator.share({ title: "Følg kampen live", text, url });
      button.textContent = "✓ Live-lenke delt";
      if (status) status.textContent = "Laglederen får alle oppdateringer automatisk.";
      setTimeout(() => {
        button.disabled = false;
        button.textContent = originalText;
      }, 2200);
      return;
    } catch (error) {
      if (error?.name === "AbortError") {
        button.disabled = false;
        button.textContent = originalText;
        return;
      }
      console.warn("Kunne ikke åpne delingsmenyen for livevisningen:", error);
    }
  }

  try {
    await copyGoalOverview(`${text}\n${url}`);
    button.textContent = "✓ Lenke kopiert";
    if (status) status.textContent = "Lim inn lenken i Messenger.";
  } catch (error) {
    console.error("Kunne ikke kopiere live-lenken:", error);
    button.textContent = originalText;
    if (status) status.textContent = "Kunne ikke kopiere lenken. Prøv igjen.";
  }

  setTimeout(() => {
    button.disabled = false;
    button.textContent = originalText;
  }, 2200);
}

["shareLiveMatchBtn", "shareLiveMatchDuringBtn"].forEach(buttonId => {
  const button = document.getElementById(buttonId);
  button?.addEventListener("click", () => shareLiveMatch(button));
});

document.getElementById("shareGoalsBtn")?.addEventListener("click", async () => {
  const text = buildGoalOverviewText();
  const status = document.getElementById("shareGoalsStatus");

  if (navigator.share) {
    try {
      await navigator.share({ title: "Måloversikt", text });
      status.textContent = "Måloversikten er delt.";
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
      console.warn("Kunne ikke åpne delingsmenyen:", error);
    }
  }

  try {
    await copyGoalOverview(text);
    status.textContent = "Kopiert – lim inn i meldingen til laglederen.";
  } catch (error) {
    console.error("Kunne ikke kopiere måloversikten:", error);
    status.textContent = "Kunne ikke kopiere. Prøv igjen.";
  }
});

function showMatchReminder(key, message, button) {
  const now = Date.now();
  const isNewReminder = activeReminderKey !== key;

  if (!isNewReminder && now - lastReminderAt < REMINDER_REPEAT_MS) return;

  clearMatchReminder();
  activeReminderKey = key;
  lastReminderAt = now;
  reminderTargetButton = button || null;
  matchReminderText.textContent = message;
  matchReminderActionBtn.textContent = {
    "match-start": "Start klokken",
    "first-half-end": "Avslutt 1. omgang",
    "second-half-start": "Start 2. omgang",
    "match-end": "Avslutt kampen"
  }[key] || "Åpne";
  matchReminder.classList.remove("hidden");
  button?.classList.add("reminder-pulse");
  document.title = `⚠️ ${message}`;

  playReminderTone(key);

  if (navigator.vibrate) {
    navigator.vibrate([300, 140, 300, 140, 500]);
  }
}

function getScheduledStartMs() {
  const date = matchState.meta.date || dateInput.value;
  const time = matchState.meta.startTime || timeInput.value;
  if (!date || !time) return null;

  const timestamp = new Date(`${date}T${time}`).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function checkMatchReminders() {
  let reminder = null;

  if (["NOT_STARTED", "UPCOMING"].includes(matchState.status)) {
    const scheduledStartMs = getScheduledStartMs();
    if (scheduledStartMs && Date.now() >= scheduledStartMs) {
      reminder = {
        key: "match-start",
        message: "Kampen skulle ha startet – start klokken?",
        button: startBtn
      };
    }
  } else if (matchState.status === "LIVE" && Number(matchState.period) === 1) {
    const currentMatchTimeMs = getCurrentMatchTimeMs();
    if (Number.isFinite(currentMatchTimeMs) && currentMatchTimeMs >= getHalfLengthMs()) {
      reminder = {
        key: "first-half-end",
        message: "Tiden er ute – avslutt 1. omgang?",
        button: halfTimeBtn
      };
    }
  } else if (["HALFTIME", "PAUSED"].includes(matchState.status)) {
    if (
      matchState.halftimeStartedAt &&
      Date.now() - matchState.halftimeStartedAt >= HALFTIME_REMINDER_MS
    ) {
      reminder = {
        key: "second-half-start",
        message: "Har 2. omgang startet?",
        button: resumeBtn
      };
    }
  } else if (matchState.status === "LIVE" && Number(matchState.period) === 2) {
    const currentMatchTimeMs = getCurrentMatchTimeMs();
    if (Number.isFinite(currentMatchTimeMs) && currentMatchTimeMs >= getHalfLengthMs() * 2) {
      reminder = {
        key: "match-end",
        message: "Tiden er ute – avslutt kampen?",
        button: endBtn
      };
    }
  }

  if (reminder) {
    showMatchReminder(reminder.key, reminder.message, reminder.button);
    return;
  }

  activeReminderKey = null;
  clearMatchReminder();
}

matchReminderActionBtn.addEventListener("click", () => {
  const targetButton = reminderTargetButton;
  clearMatchReminder();
  targetButton?.click();
});
dismissReminderBtn.addEventListener("click", clearMatchReminder);
setInterval(checkMatchReminders, 1000);
window.addEventListener("pageshow", checkMatchReminders);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") checkMatchReminders();
});

const ourGoalBtn = document.getElementById("ourGoalBtn");
const theirGoalBtn = document.getElementById("theirGoalBtn");

const goalModal = document.getElementById("goalModal");
const confirmGoalBtn = document.getElementById("confirmGoalBtn");
const cancelGoalBtn = document.getElementById("cancelGoalBtn");
const manualGoalTimeInput = document.getElementById("manualGoalTime");
const manualGoalTimeWrapper = document.getElementById("manualGoalTimeWrapper");
const toggleManualGoalTimeBtn = document.getElementById("toggleManualGoalTimeBtn");
const goalTimeSummary = document.getElementById("goalTimeSummary");
const goalModalTitle = document.getElementById("goalModalTitle");
const goalModalHelp = document.getElementById("goalModalHelp");
const goalScorerGrid = document.getElementById("goalScorerGrid");

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
const goalActions = document.getElementById("goal-actions");
const actionCard = document.getElementById("action-card"); 
  
const loanBtn = document.getElementById("loanPlayersBtn");
const loanModal = document.getElementById("loanModal");
const loanNameInput = document.getElementById("loanNameInput");
const loanReplaceSelect = document.getElementById("loanReplaceSelect");
const loanPlayerError = document.getElementById("loanPlayerError");

const cancelLoanBtn = document.getElementById("cancelLoanBtn");
const confirmLoanBtn = document.getElementById("confirmLoanBtn");

const loanFlowReady = Boolean(
  loanBtn &&
  loanModal &&
  loanNameInput &&
  loanReplaceSelect &&
  loanPlayerError &&
  cancelLoanBtn &&
  confirmLoanBtn
);

if (loanFlowReady) {
loanBtn.addEventListener("click", () => {
  if (!["NOT_STARTED", "UPCOMING"].includes(matchState.status)) return;

  loanNameInput.value = "";
  loanPlayerError.textContent = "";
  loanReplaceSelect.innerHTML =
    '<option value="">Ingen – legg til på benken</option>';

  Object.values(matchState.players.home)
    .filter(player => player?.present)
    .sort((a, b) => {
      if (a.starter !== b.starter) return a.starter ? -1 : 1;
      return a.name.localeCompare(b.name, "nb");
    })
    .forEach(player => {
      const option = document.createElement("option");
      option.value = player.id;
      option.textContent = `${player.name} (${player.starter ? "starter" : "benk"})`;
      loanReplaceSelect.appendChild(option);
    });

  loanModal.classList.remove("hidden");
  setTimeout(() => loanNameInput.focus(), 0);
});

cancelLoanBtn.addEventListener("click", () => {
  loanModal.classList.add("hidden");
  loanPlayerError.textContent = "";
});

loanNameInput.addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  confirmLoanBtn.click();
});

confirmLoanBtn.addEventListener("click", () => {
  const name = loanNameInput.value.trim().replace(/\s+/g, " ");
  if (!name) {
    loanPlayerError.textContent = "Skriv inn navnet på lånespilleren.";
    loanNameInput.focus();
    return;
  }

  const duplicate = Object.values(matchState.players.home).find(player =>
    player?.name?.localeCompare(name, "nb", { sensitivity: "base" }) === 0
  );
  if (duplicate) {
    loanPlayerError.textContent = `${duplicate.name} finnes allerede i kamptroppen.`;
    return;
  }

  const replacedPlayer = matchState.players.home[loanReplaceSelect.value];
  const replacesStarter = replacedPlayer?.starter === true;
  const uniqueId = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const id = `loan_${uniqueId}`;
  const loanPlayer = createPlayer({ id, name });
  loanPlayer.starter = replacesStarter;
  matchState.players.home[id] = loanPlayer;

  if (replacedPlayer) {
    replacedPlayer.present = false;
    replacedPlayer.starter = false;
    matchState.squad.onField.home =
      matchState.squad.onField.home.filter(playerId => playerId !== replacedPlayer.id);
  }

  if (replacesStarter && !matchState.squad.onField.home.includes(id)) {
    matchState.squad.onField.home.push(id);
  }

  pendingNewLoanPlayerId = id;
  sanitizePlayers();

  loanModal.classList.add("hidden");
  openSquadModal();
});
}

function populateGoalScorers(team) {
  goalScorerSelect.innerHTML = "";
  goalScorerGrid.innerHTML = "";

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Velg spiller";
  goalScorerSelect.appendChild(placeholder);

  if (team !== "home") return;

  Object.values(matchState.players.home)
    .filter(p => p && p.id && isOnField(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, "nb"))
    .forEach(player => {
      const opt = document.createElement("option");
      opt.value = player.id;
      opt.textContent = player.name;
      goalScorerSelect.appendChild(opt);

      const button = document.createElement("button");
      button.type = "button";
      button.className = "goal-scorer-option";
      button.textContent = player.name;
      button.addEventListener("click", () => registerPendingGoal({ id: player.id }));
      goalScorerGrid.appendChild(button);
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

	const currentElapsed = getCurrentMatchTimeMs();
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

  const liveStatuses = ["LIVE", "PAUSED", "TEMP_STOPPED", "HALFTIME"];

  // 🔍 Coach-kamper (men kun dine)
  try {
    const coachSnap = await getDocs(
      query(
        collection(db, "matches"),
        where("ownerUid", "==", user.uid),
        where("status", "in", liveStatuses)
      )
    );

    if (!coachSnap.empty) {
      return coachSnap.docs[0];
    }
  } catch (error) {
    // Eldre kamper mangler ownerUid, og enkelte Firebase-oppsett mangler
    // sammensatt indeks. Reserveoppslaget nedenfor finner dem likevel.
    console.warn("Kunne ikke søke etter eierens livekamp:", error);
  }

  // 🔍 Assistant-kamper (kun dine)
  try {
    const assistantSnap = await getDocs(
      query(
        collection(db, "assistantMatches", user.uid, "matches"),
        where("status", "in", liveStatuses)
      )
    );

    if (!assistantSnap.empty) {
      return assistantSnap.docs[0];
    }
  } catch (error) {
    console.warn("Kunne ikke søke etter assistentkamp:", error);
  }

  // Kamper opprettet fra oversikten før ownerUid ble lagret må også kunne
  // gjenopprettes på mobil eller en annen nettleser.
  try {
    const legacyCoachSnap = await getDocs(
      query(
        collection(db, "matches"),
        where("status", "in", liveStatuses)
      )
    );

    if (!legacyCoachSnap.empty) {
      return legacyCoachSnap.docs[0];
    }
  } catch (error) {
    console.error("Kunne ikke finne pågående kamp:", error);
  }

  return null;
}
   
 function getCurrentMatchTimeMs() {
  const elapsedMs = Math.max(0, Number(matchState.timer.elapsedMs) || 0);
  if (matchState.status !== "LIVE") return elapsedMs;

  const startTimestampMs = getRemoteTimestampMs(matchState.timer.startTimestamp);
  if (!Number.isFinite(startTimestampMs)) return elapsedMs;

  return elapsedMs + Math.max(0, Date.now() - startTimestampMs);
}

function updateScoreboard() {
  document.getElementById("ourScore").textContent =
    matchState.score.our;

  document.getElementById("theirScore").textContent =
    matchState.score.their;
}

function updateGoalButtonLabels() {
  const homeName = matchState.meta.ourTeam || homeTeamInput.value.trim() || "Samnanger";
  const awayName = matchState.meta.opponent || awayTeamInput.value.trim() || "Motstander";

  document.querySelector('.goalBtn[data-team="home"] .goal-team-name').textContent = homeName;
  document.querySelector('.goalBtn[data-team="away"] .goal-team-name').textContent = awayName;
  document.getElementById("scoreHomeName").textContent = homeName;
  document.getElementById("scoreAwayName").textContent = awayName;
}

function registerGoal(team, timeMs, scorerData) {
  if (matchState.status !== "LIVE") return;

  const minuteText = formatMatchMinute(timeMs);
  const ourTeamName = matchState.meta.ourTeam || homeTeamInput.value.trim() || "Samnanger";
  const opponentName = matchState.meta.opponent || awayTeamInput.value.trim() || "Motstander";
  let registeredGoalEvent = null;

if (team === "home") {
  addOurGoal();

  const player = matchState.players.home[scorerData.id];
  if (!player) return;

registeredGoalEvent = addEvent({
  type: "goal",
  team: "home",
  playerId: player.id,
  playerName: player.name,
  period: matchState.period,
  timeMs,
  minute: minuteText,
  text: `⚽ ${minuteText} – ${player.name} (${ourTeamName})`
});

}

  if (team === "away") {
    addTheirGoal();

    const label = scorerData.text
      ? scorerData.text
      : "Ukjent spiller";

registeredGoalEvent = addEvent({
  type: "goal",
  team: "away",
  playerId: scorerData.id ?? null,
  playerName: label,
  period: matchState.period,
  timeMs,
  minute: minuteText,
  text: `⚽ ${minuteText} – ${label} (${opponentName})`
});

  }

  updateScoreboard();
  return registeredGoalEvent;
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
  halfTimeBtn.style.display = "none";
  resumeBtn.style.display = "none";
  endBtn.style.display = "none";

if (
  ["NOT_STARTED", "UPCOMING", "SCHEDULED", "PREMATCH", ""].includes(String(matchState.status || "").toUpperCase())
) {
  startBtn.style.display = "block";
  startBtn.disabled = !matchState.lineupConfirmed;
  startBtn.textContent = matchState.lineupConfirmed ? "Start kamp" : "Velg 11 startere først";
}

  if (matchState.status === "LIVE") {
    pauseBtn.style.display = "block";
  }

  if (
    matchState.period === 1 &&
    ["LIVE", "TEMP_STOPPED"].includes(matchState.status)
  ) {
    halfTimeBtn.style.display = "block";
  }

  if (["TEMP_STOPPED", "HALFTIME", "PAUSED"].includes(matchState.status)) {
    resumeBtn.style.display = "block";
    resumeBtn.textContent = matchState.status === "TEMP_STOPPED"
      ? "Fortsett kampen"
      : "Start 2. omgang";
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
  showOverviewReturnMode();
  renderFinalGoalShare();
  renderFinalEventReview();
  matchControls.style.display = "none";
  newMatchBtn.classList.add("hidden");
  document.getElementById("match-header").style.display = "none";
  document.getElementById("backBtn")?.classList.add("hidden");
  matchUI.classList.add("hidden");
  startScreen.style.display = "block";
} else {
  matchControls.style.display = "block";
  newMatchBtn.classList.add("hidden");
}
}

function updateUIByStatus() {

  startScreen.style.display = "none";

  if (["NOT_STARTED", "SCHEDULED", "PREMATCH", ""].includes(String(matchState.status || "").toUpperCase())) {
    preMatch.classList.remove("hidden");
    matchUI.classList.remove("hidden");
    teams.style.display = "flex";
    actionCard.style.display = "none";
    goalActions.style.display = "none";
    clockSection.style.display = "none";
    matchControls.style.display = "block";
    eventLog.style.display = "none";
  }

  if (matchState.status === "UPCOMING") {
    preMatch.classList.remove("hidden");
    matchUI.classList.remove("hidden");
	teams.style.display = "flex";
    actionCard.style.display = "none";
    goalActions.style.display = "none";
    clockSection.style.display = "none";
    matchControls.style.display = "block";
   // events.style.display = "none";
   // extraEvents.style.display = "none";
    eventLog.style.display = "none";
  }

  if (["LIVE", "TEMP_STOPPED", "HALFTIME", "PAUSED"].includes(matchState.status)) {
    preMatch.classList.add("hidden");
    matchUI.classList.remove("hidden");
	teams.style.display = "flex";

    clockSection.style.display = "block";
    matchControls.style.display = "block";
    actionCard.style.display = "block";
    goalActions.style.display = matchState.status === "LIVE" ? "block" : "none";
    const quickActions = actionCard.querySelector(".action-row");
    if (quickActions) {
      quickActions.style.display = matchState.status === "LIVE" ? "grid" : "none";
    }
    eventLog.style.display = "";
  }
}

function startPlayingTime() {
  Object.values(matchState.players.home).forEach(player => {
    if (!player) return;
    player.intervals = [];
    player.extraPlayingTimeMs = 0;
  });

  matchState.squad.onField.home.forEach(playerId => {
    const player = matchState.players.home[playerId];
    if (!player) return;

    player.intervals.push({
      in: 0,
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
  const storedMinutes = Number(matchState.meta.halfLengthMin);
  const min = Number.isFinite(storedMinutes) && storedMinutes > 0
    ? storedMinutes
    : 35;
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
  updateGoalButtonLabels();
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
    timeMs: Number.isFinite(baseEvent.timeMs)
      ? baseEvent.timeMs
      : getCurrentMatchTimeMs(),
    period: baseEvent.period || matchState.period,
    edited: false,
    ...(user ? { reportedBy: user.uid } : {})
  };

  matchState.events.unshift(fullEvent);

  renderEvents();
  saveLiveUpdate();

  return fullEvent;
}

function rebuildEventText(event) {
  const prefix = event.createdClock ? `${event.createdClock} – ` : "";
  return prefix + (event.rawText || "");
}

function editEvent(eventId) {
  const event = matchState.events.find(e => e.id === eventId);
  if (!event) return;

  if (/1\. omgang avsluttet/i.test(event.rawText || event.text || "")) {
    openFirstHalfCorrectionModal(event);
    return;
  }

  if (event.type === "goal") {
    openEditGoalModal(event);
    return;
  }

  if (event.type === "substitution") {
    openEditSubTimeModal(event);
    return;
  }

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

let editingGoalEventId = null;

function openEditGoalModal(event) {
  editingGoalEventId = event.id;

  const minuteInput = document.getElementById("editGoalMinute");
  const scorerSelect = document.getElementById("editGoalScorer");
  const opponentInput = document.getElementById("editOpponentScorer");
  const homeWrapper = document.getElementById("editHomeScorerWrapper");
  const awayWrapper = document.getElementById("editAwayScorerWrapper");

  minuteInput.value = event.minute || "";
  homeWrapper.classList.toggle("hidden", event.team !== "home");
  awayWrapper.classList.toggle("hidden", event.team !== "away");

  if (event.team === "home") {
    scorerSelect.innerHTML = "";

    Object.values(matchState.players.home)
      .filter(player =>
        player?.id &&
        player?.name &&
        (player.present || player.id === event.playerId)
      )
      .sort((a, b) => a.name.localeCompare(b.name, "no"))
      .forEach(player => {
        const option = document.createElement("option");
        option.value = player.id;
        option.textContent = player.name;
        option.selected = player.id === event.playerId;
        scorerSelect.appendChild(option);
      });
  } else {
    opponentInput.value =
      event.playerName === "Ukjent spiller" ? "" : event.playerName || "";
  }

  document.getElementById("editGoalModal").classList.remove("hidden");
}

function closeEditGoalModal() {
  editingGoalEventId = null;
  document.getElementById("editGoalModal").classList.add("hidden");
}

document.getElementById("cancelEditGoalBtn")
  .addEventListener("click", closeEditGoalModal);

document.getElementById("saveEditGoalBtn").addEventListener("click", () => {
  const event = matchState.events.find(item => item.id === editingGoalEventId);
  if (!event || event.type !== "goal") return;

  const minuteValue = document.getElementById("editGoalMinute").value.trim();
  const minuteMatch = minuteValue.match(/^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?$/);

  if (!minuteMatch) {
    alert("Skriv inn kampminutt, for eksempel 12 eller 35 + 2");
    return;
  }

  const baseMinute = Number(minuteMatch[1]);
  const overtimeMinute = Number(minuteMatch[2] || 0);
  const maxBaseMinute = (matchState.meta.halfLengthMin || 35) * 2;

  if (baseMinute < 1 || baseMinute > maxBaseMinute) {
    alert(`Kampminuttet må være mellom 1 og ${maxBaseMinute}, eventuelt med tilleggstid`);
    return;
  }

  const normalizedMinute = overtimeMinute > 0
    ? `${baseMinute} + ${overtimeMinute}`
    : String(baseMinute);

  let playerId = null;
  let playerName = "Ukjent spiller";
  let teamName = matchState.meta.opponent || awayTeamInput.value.trim() || "Motstander";

  if (event.team === "home") {
    playerId = document.getElementById("editGoalScorer").value;
    const player = matchState.players.home[playerId];

    if (!player) {
      alert("Velg målscorer");
      return;
    }

    playerName = player.name;
    teamName = matchState.meta.ourTeam || homeTeamInput.value.trim() || "Samnanger";
  } else {
    playerName = document.getElementById("editOpponentScorer").value.trim()
      || "Ukjent spiller";
  }

  event.playerId = playerId;
  event.playerName = playerName;
  event.minute = normalizedMinute;
  event.timeMs = (baseMinute + overtimeMinute - 1) * 60 * 1000;
  event.rawText = `⚽ ${normalizedMinute} – ${playerName} (${teamName})`;
  event.text = rebuildEventText(event);
  event.edited = true;
  event.editedAt = new Date().toISOString();
  renderEvents();
  saveLiveUpdate();
  closeEditGoalModal();
});

let editingSubEventId = null;

function openEditSubTimeModal(event) {
  editingSubEventId = event.id;
  document.getElementById("editSubSummary").textContent =
    `${event.outPlayerName} → ${event.inPlayerName}`;
  document.getElementById("editSubMinute").value = event.minute || "";
  document.getElementById("editSubTimeModal").classList.remove("hidden");
}

function closeEditSubTimeModal() {
  editingSubEventId = null;
  document.getElementById("editSubTimeModal").classList.add("hidden");
}

document.getElementById("cancelEditSubBtn")
  .addEventListener("click", closeEditSubTimeModal);

document.getElementById("saveEditSubBtn").addEventListener("click", () => {
  const event = matchState.events.find(item => item.id === editingSubEventId);
  if (!event || event.type !== "substitution") return;

  const value = document.getElementById("editSubMinute").value.trim();
  const minuteMatch = value.match(/^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?$/);

  if (!minuteMatch) {
    alert("Skriv inn kampminutt, for eksempel 28 eller 70 + 2");
    return;
  }

  const baseMinute = Number(minuteMatch[1]);
  const overtimeMinute = Number(minuteMatch[2] || 0);
  const enteredMinute = baseMinute + overtimeMinute;
  const currentTimeMs = getCurrentMatchTimeMs();
  const currentMinute = Math.max(1, Math.ceil(currentTimeMs / 60000));

  if (baseMinute < 1 || enteredMinute > currentMinute) {
    alert(`Byttet må være mellom kampminutt 1 og ${currentMinute}`);
    return;
  }

  const newTimeMs = Math.min(enteredMinute * 60 * 1000, currentTimeMs);
  const outPlayer = matchState.players.home[event.outPlayerId];
  const inPlayer = matchState.players.home[event.inPlayerId];

  if (!outPlayer || !inPlayer) {
    alert("Kunne ikke finne spillerne i dette byttet");
    return;
  }

  const outIntervalIndex = outPlayer.intervals.findIndex(
    interval => interval.out === event.timeMs
  );
  const inIntervalIndex = inPlayer.intervals.findIndex(
    interval => interval.in === event.timeMs
  );

  if (outIntervalIndex < 0 || inIntervalIndex < 0) {
    alert("Kunne ikke finne spilleintervallene for dette byttet");
    return;
  }

  const outInterval = outPlayer.intervals[outIntervalIndex];
  const inInterval = inPlayer.intervals[inIntervalIndex];
  const outNextInterval = outPlayer.intervals[outIntervalIndex + 1];
  const inPreviousInterval = inPlayer.intervals[inIntervalIndex - 1];

  if (
    newTimeMs < outInterval.in ||
    (outNextInterval && newTimeMs > outNextInterval.in) ||
    (inPreviousInterval?.out != null && newTimeMs < inPreviousInterval.out) ||
    (inInterval.out != null && newTimeMs > inInterval.out)
  ) {
    alert("Det valgte tidspunktet kolliderer med et annet spillerbytte");
    return;
  }

  outInterval.out = newTimeMs;
  inInterval.in = newTimeMs;

  const normalizedMinute = overtimeMinute > 0
    ? `${baseMinute} + ${overtimeMinute}`
    : String(baseMinute);

  event.timeMs = newTimeMs;
  event.minute = normalizedMinute;
  event.period = baseMinute <= getHalfLengthMs() / 60000 ? 1 : 2;
  event.rawText =
    `🔁 ${normalizedMinute} – ${outPlayer.name} ut, ${inPlayer.name} inn`;
  event.text = rebuildEventText(event);
  event.edited = true;
  event.editedAt = new Date().toISOString();

  renderEvents();
  updatePlayingTimeUI();
  saveLiveUpdate();
  closeEditSubTimeModal();
});

function restorePlayerAfterDeletedRedCard(player, event) {
  if (isOnField(player.id)) return true;

  if (matchState.squad.onField.home.length >= MAX_STARTERS) {
    alert("Kortet kan ikke slettes trygt fordi laget allerede har 11 spillere på banen");
    return false;
  }

  const redTimeMs = event.timeMs;
  const interval = [...player.intervals]
    .reverse()
    .find(item => item.out === redTimeMs);

  if (!interval) {
    alert("Kunne ikke finne spillerens intervall ved utvisningen");
    return false;
  }

  const currentTimeMs = getCurrentMatchTimeMs();
  const isRunningPeriod = ["LIVE", "TEMP_STOPPED"].includes(matchState.status);

  if (event.period === 1 && matchState.period === 2) {
    interval.out = getHalfLengthMs();
    player.intervals.push({
      in: getHalfLengthMs(),
      out: isRunningPeriod ? null : currentTimeMs
    });
  } else {
    interval.out = isRunningPeriod ? null : currentTimeMs;
  }

  addToField(player.id);
  return true;
}

function deleteEvent(eventId) {
  if (!eventId) {
    alert("Kunne ikke slette: hendelsen mangler id");
    return;
  }

  const event = matchState.events.find(item => item.id === eventId);
  if (!event) {
    alert("Kunne ikke finne hendelsen");
    return;
  }

  const isLegacyCard =
    event.type !== "card" &&
    /^[🟨🟥]/u.test(event.rawText || "");

  if (isLegacyCard) {
    alert("Dette eldre kortet mangler dataene som kreves for trygg sletting");
    return;
  }

  const confirmationText = event.type === "goal"
    ? "Vil du slette dette målet? Resultatet blir også korrigert."
    : event.type === "card"
      ? "Vil du slette dette kortet? Spillerstatusen blir også korrigert."
      : "Vil du slette denne hendelsen?";

  const ok = confirm(confirmationText);
  if (!ok) return;

  if (event.type === "goal") {
    if (event.team === "home") {
      matchState.score.our = Math.max(0, matchState.score.our - 1);
    } else if (event.team === "away") {
      matchState.score.their = Math.max(0, matchState.score.their - 1);
    } else {
      alert("Målet mangler laginformasjon og kan ikke slettes trygt");
      return;
    }

    updateScoreboard();
  }

  const eventIdsToDelete = new Set([eventId]);

  if (event.type === "card" && event.team === "home") {
    const player = matchState.players.home[event.playerId];
    if (!player) {
      alert("Kunne ikke finne spilleren som fikk kortet");
      return;
    }

    const relatedRedCard = player.cards.find(card =>
      card.type === "red" &&
      card.derivedFromCardId &&
      (event.cardType === "yellow" || card.derivedFromCardId === event.cardId)
    );
    const removesRedCard =
      event.cardType === "red" || Boolean(relatedRedCard);

    if (removesRedCard) {
      const redEvent = event.cardType === "red"
        ? event
        : matchState.events.find(item => item.cardId === relatedRedCard.id);

      if (!redEvent) {
        return;
      }

      if (
        redEvent.wasPlayerOnField !== false &&
        !restorePlayerAfterDeletedRedCard(player, redEvent)
      ) return;
    }

    const cardIdsToDelete = new Set([event.cardId]);

    if (event.derivedFromCardId) {
      cardIdsToDelete.add(event.derivedFromCardId);
      const sourceEvent = matchState.events.find(
        item => item.cardId === event.derivedFromCardId
      );
      if (sourceEvent) eventIdsToDelete.add(sourceEvent.id);
    }

    if (relatedRedCard) {
      cardIdsToDelete.add(relatedRedCard.id);
      const redEvent = matchState.events.find(
        item => item.cardId === relatedRedCard.id
      );
      if (redEvent) eventIdsToDelete.add(redEvent.id);
    }

    player.cards = player.cards.filter(card => !cardIdsToDelete.has(card.id));
    updatePlayingTimeUI();
  }

  matchState.events = matchState.events.filter(e => !eventIdsToDelete.has(e.id));

  renderEvents();
  saveLiveUpdate();
}



function renderEvents() {
  const list = document.getElementById("eventList");
  list.innerHTML = "";

  const sortedEvents = matchState.events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => {
      const periodDifference = getEventSortPeriod(b.event) - getEventSortPeriod(a.event);
      if (periodDifference !== 0) return periodDifference;

      const aTime = getEventMatchTimeMs(a.event);
      const bTime = getEventMatchTimeMs(b.event);

      if (aTime !== null && bTime !== null && aTime !== bTime) {
        return bTime - aTime;
      }

      const aReported = getEventReportedTime(a.event);
      const bReported = getEventReportedTime(b.event);
      if (aReported !== null && bReported !== null && aReported !== bReported) {
        return bReported - aReported;
      }

      return a.index - b.index;
    })
    .map(entry => entry.event);

  sortedEvents.forEach(event => {
    const li = document.createElement("li");
    const displayText = getEventDisplayText(event);
    const isMilestone =
      /kamp(?:en)? startet|pause|1\. omgang avsluttet|2\. omgang startet|kamp avsluttet/i
        .test(displayText);
    li.className = `event-row event-${event.type || "text"}${isMilestone ? " event-milestone" : ""}`;

    const content = document.createElement("div");
    content.className = "event-content";

    const textSpan = document.createElement("span");
    textSpan.className = "event-text";
    textSpan.textContent = displayText;
    content.appendChild(textSpan);

    if (event.edited) {
      const editedBadge = document.createElement("span");
      editedBadge.className = "event-edited-badge";
      editedBadge.textContent = "redigert";
      content.appendChild(editedBadge);
    }

    const actions = document.createElement("div");
    actions.className = "event-actions";

    const menuToggle = document.createElement("button");
    menuToggle.type = "button";
    menuToggle.className = "event-menu-toggle";
    menuToggle.textContent = "•••";
    menuToggle.setAttribute("aria-label", "Handlinger for hendelsen");
    menuToggle.setAttribute("aria-expanded", "false");

    const menu = document.createElement("div");
    menu.className = "event-action-menu hidden";

    menuToggle.addEventListener("click", clickEvent => {
      clickEvent.stopPropagation();
      document.querySelectorAll(".event-action-menu").forEach(otherMenu => {
        if (otherMenu !== menu) otherMenu.classList.add("hidden");
      });
      const isOpening = menu.classList.contains("hidden");
      menu.classList.toggle("hidden", !isOpening);
      menuToggle.setAttribute("aria-expanded", String(isOpening));
    });

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "event-edit-btn";
    editBtn.textContent = "Rediger";
    editBtn.addEventListener("click", () => {
      menu.classList.add("hidden");
      editEvent(event.id);
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "event-delete-btn";
    deleteBtn.textContent = "Slett";
    deleteBtn.addEventListener("click", () => {
      menu.classList.add("hidden");
      deleteEvent(event.id);
    });

    menu.appendChild(editBtn);
    menu.appendChild(deleteBtn);
    actions.appendChild(menuToggle);
    actions.appendChild(menu);

    li.appendChild(content);
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
  addEvent({
    type: "substitution",
    outPlayerId: outPlayer.id,
    outPlayerName: outPlayer.name,
    inPlayerId: inPlayer.id,
    inPlayerName: inPlayer.name,
    period: matchState.period,
    timeMs,
    minute: minuteText,
    text: `🔁 ${minuteText} – ${outPlayer.name} ut, ${inPlayer.name} inn`
  });

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
  const startTimestampMs = getRemoteTimestampMs(matchState.timer.startTimestamp);
  if (!Number.isFinite(startTimestampMs)) return;

  const now = Date.now();
  matchState.timer.elapsedMs =
    (Number(matchState.timer.elapsedMs) || 0) + Math.max(0, now - startTimestampMs);
  matchState.timer.startTimestamp = null;

  commitState();
}

function getLiveElapsedMs() {
  return getCurrentMatchTimeMs();
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

  // Opprett spillerintervallene før den første LIVE-lagringen. Hvis Firebase
  // får en LIVE-snapshot først, kan sanntidssynken ellers skrive tomme
  // intervaller tilbake over den lokale kampstaten.
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }

  matchState.status = "LIVE";
  matchState.liveSharingEnabled = true;
  matchState.period = 1;
  matchState.timer.elapsedMs = 0;
  matchState.timer.startTimestamp = Date.now();
  startPlayingTime();

  await safeSetDoc(doc(db, "matches", matchState.matchId), {
    status: "LIVE",
    period: 1,
    ownerUid: auth.currentUser.uid,
    role: matchState.userRole,
    liveSharingEnabled: true,
    meta: {
      ...matchState.meta,
      halfLengthMin: Number(matchState.meta.halfLengthMin) || 35
    },
    startedAt: serverTimestamp(),
    timer: {
      elapsedMs: 0,
      startTimestamp: matchState.timer.startTimestamp
    },
    players: matchState.players.home,
    onField: matchState.squad.onField.home,
    lineupConfirmed: matchState.lineupConfirmed,
    pushReminders: {},
    updatedAt: serverTimestamp()
  }, { merge: true });

  addEvent("Kamp startet");
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

pauseBtn.addEventListener("click", () => {

  if (matchState.status !== "LIVE") return;

  pauseTimerNow();
  setMatchStatus("TEMP_STOPPED");

  stopClock();
  periodIndicator.textContent = `${matchState.period}. omgang – klokken stoppet`;

  addEvent("⏸️ Klokken stoppet");

  syncUI();
});

let editingFirstHalfEventId = null;

function getFirstHalfEndMs(event = null) {
  if (Number.isFinite(matchState.firstHalfActualEndMs)) {
    return matchState.firstHalfActualEndMs;
  }

  const parsedMinute = parseMatchMinuteInput(event?.minute);
  if (parsedMinute) return parsedMinute.totalMinutes * 60 * 1000;
  if (Number.isFinite(event?.timeMs)) return event.timeMs;
  return getHalfLengthMs();
}

function formatFirstHalfEndInput(timeMs) {
  const halfMinutes = matchState.meta.halfLengthMin || 35;
  const totalMinutes = Math.max(1, Math.round(timeMs / 60000));
  const overtime = Math.max(0, totalMinutes - halfMinutes);
  return overtime > 0 ? `${halfMinutes} + ${overtime}` : String(totalMinutes);
}

function openHalfTimeEndModal() {
  if (
    matchState.period !== 1 ||
    !["LIVE", "TEMP_STOPPED", "HALFTIME"].includes(matchState.status)
  ) return;

  editingFirstHalfEventId = null;

  const halfMinutes = matchState.meta.halfLengthMin || 35;
  const currentMinute = Math.max(1, Math.ceil(getCurrentMatchTimeMs() / 60000));
  const input = document.getElementById("halfTimeEndInput");

  const savedOvertime = Math.max(0, currentMinute - halfMinutes);
  input.value = matchState.status === "HALFTIME" && savedOvertime > 0
    ? `${halfMinutes} + ${savedOvertime}`
    : String(halfMinutes);
  document.getElementById("halfTimeEndClockHint").textContent =
    `Klokken viser omtrent ${currentMinute} minutter.`;
  document.getElementById("confirmHalfTimeEndBtn").textContent =
    matchState.status === "HALFTIME" ? "Lagre korrigering" : "Start pause";
  document.getElementById("halfTimeEndModal").classList.remove("hidden");
  input.focus();
  input.select();
}

function openFirstHalfCorrectionModal(event) {
  editingFirstHalfEventId = event.id;
  const storedEndMs = getFirstHalfEndMs(event);
  const input = document.getElementById("halfTimeEndInput");

  input.value = formatFirstHalfEndInput(storedEndMs);
  document.getElementById("halfTimeEndClockHint").textContent =
    "Spilletiden for 1. omgang blir korrigert sammen med klokkeslettet.";
  document.getElementById("confirmHalfTimeEndBtn").textContent = "Lagre korrigering";
  document.getElementById("halfTimeEndModal").classList.remove("hidden");
  input.focus();
  input.select();
}

function closeHalfTimeEndModal() {
  document.getElementById("halfTimeEndModal").classList.add("hidden");
  editingFirstHalfEventId = null;
}

async function finishFirstHalfAt(finalMinute) {
  const finalTimeMs = finalMinute.totalMinutes * 60 * 1000;
  const currentTimeMs = getCurrentMatchTimeMs();
  const currentMinute = Math.max(1, Math.ceil(currentTimeMs / 60000));

  if (finalMinute.totalMinutes > currentMinute) {
    alert(`Klokken har bare kommet til omtrent ${currentMinute}. minutt.`);
    return;
  }

  const latestMatchEventTime = Math.max(
    0,
    ...matchState.events
      .filter(event => ["goal", "substitution", "card"].includes(event?.type))
      .map(event => Number(event?.timeMs) || 0)
  );

  if (finalTimeMs < latestMatchEventTime) {
    alert("Sluttminuttet kan ikke være før den siste registrerte kamphendelsen. Rediger hendelsen først.");
    return;
  }

  const wasAlreadyHalfTime = matchState.status === "HALFTIME";
  closePlayingIntervalsAt(finalTimeMs);
  matchState.timer.elapsedMs = finalTimeMs;
  matchState.timer.startTimestamp = null;
  matchState.status = "HALFTIME";
  matchState.halftimeStartedAt = matchState.halftimeStartedAt || Date.now();
  matchState.firstHalfActualEndMs = finalTimeMs;

  const existingHalfTimeEvent = matchState.events.find(event =>
    /1\. omgang avsluttet/i.test(event?.rawText || event?.text || "")
  );

  if (wasAlreadyHalfTime && existingHalfTimeEvent) {
    existingHalfTimeEvent.timeMs = finalTimeMs;
    existingHalfTimeEvent.minute = finalMinute.label;
    existingHalfTimeEvent.period = 1;
    existingHalfTimeEvent.edited = true;
    existingHalfTimeEvent.editedAt = new Date().toISOString();
  } else {
    addEvent("⏸️ 1. omgang avsluttet");
  }

  closeHalfTimeEndModal();
  stopClock();
  periodIndicator.textContent = "Pause mellom omgangene";
  syncUI();
  updatePlayingTimeUI();
  await saveLiveUpdate();
}

function adjustFirstHalfPlayerTime(oldEndMs, newEndMs) {
  const officialHalfMs = getHalfLengthMs();
  const oldBaseEndMs = Math.min(oldEndMs, officialHalfMs);
  const newBaseEndMs = Math.min(newEndMs, officialHalfMs);
  const oldOvertimeMs = Math.max(0, oldEndMs - officialHalfMs);
  const newOvertimeMs = Math.max(0, newEndMs - officialHalfMs);

  Object.values(matchState.players.home).forEach(player => {
    const intervals = Array.isArray(player.intervals) ? player.intervals : [];
    const oldBonusMs = Math.max(0, Number(player.extraPlayingTimeMs) || 0);
    const wasOnAtFirstHalfEnd = oldBonusMs > 0 || intervals.some(interval =>
      Number(interval.in) < oldBaseEndMs &&
      Number(interval.out) === oldBaseEndMs
    );

    if (oldBaseEndMs !== newBaseEndMs && wasOnAtFirstHalfEnd) {
      const intervalIndex = intervals.findLastIndex(interval =>
        Number(interval.in) < oldBaseEndMs &&
        Number(interval.out) === oldBaseEndMs
      );

      if (intervalIndex >= 0) {
        intervals[intervalIndex].out = newBaseEndMs;
        if (intervals[intervalIndex].out <= intervals[intervalIndex].in) {
          intervals.splice(intervalIndex, 1);
        }
      }
    }

    if (newOvertimeMs === 0 || !wasOnAtFirstHalfEnd) {
      player.extraPlayingTimeMs = 0;
    } else if (oldOvertimeMs === 0) {
      player.extraPlayingTimeMs = newOvertimeMs;
    } else if (newOvertimeMs <= oldOvertimeMs) {
      player.extraPlayingTimeMs = Math.min(oldBonusMs, newOvertimeMs);
    } else {
      player.extraPlayingTimeMs = oldBonusMs >= oldOvertimeMs - 1000
        ? newOvertimeMs
        : oldBonusMs;
    }
  });
}

async function correctCompletedFirstHalfAt(finalMinute) {
  const event = matchState.events.find(item => item.id === editingFirstHalfEventId);
  if (!event) return;

  const newEndMs = finalMinute.totalMinutes * 60 * 1000;
  const oldEndMs = getFirstHalfEndMs(event);
  const latestFirstHalfEventMs = Math.max(
    0,
    ...matchState.events
      .filter(item =>
        item.id !== event.id &&
        item.period === 1 &&
        ["goal", "substitution", "card"].includes(item.type)
      )
      .map(item => Number(item.timeMs) || 0)
  );

  if (newEndMs < latestFirstHalfEventMs) {
    alert("Sluttminuttet kan ikke være før den siste hendelsen i 1. omgang.");
    return;
  }

  adjustFirstHalfPlayerTime(oldEndMs, newEndMs);
  matchState.firstHalfActualEndMs = newEndMs;
  event.timeMs = newEndMs;
  event.minute = finalMinute.label;
  event.period = 1;
  event.edited = true;
  event.editedAt = new Date().toISOString();

  closeHalfTimeEndModal();
  renderEvents();
  updatePlayingTimeUI();
  await saveLiveUpdate();
}

halfTimeBtn.addEventListener("click", openHalfTimeEndModal);

document.getElementById("cancelHalfTimeEndBtn")
  .addEventListener("click", closeHalfTimeEndModal);

document.getElementById("confirmHalfTimeEndBtn")
  .addEventListener("click", async () => {
    const finalMinute = parseMatchMinuteInput(
      document.getElementById("halfTimeEndInput").value
    );

    if (!finalMinute || finalMinute.totalMinutes <= 0) {
      alert("Skriv sluttminutt som 35 eller 35 + 2.");
      return;
    }

    if (editingFirstHalfEventId) {
      await correctCompletedFirstHalfAt(finalMinute);
    } else {
      await finishFirstHalfAt(finalMinute);
    }
  });

function parseMatchMinuteInput(value) {
  const match = String(value || "").trim()
    .match(/^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?$/);
  if (!match) return null;

  const baseMinute = Number(match[1]);
  const overtimeMinute = Number(match[2] || 0);
  return {
    baseMinute,
    overtimeMinute,
    totalMinutes: baseMinute + overtimeMinute,
    label: overtimeMinute > 0
      ? `${baseMinute} + ${overtimeMinute}`
      : String(baseMinute)
  };
}

function openEndTimeModal() {
  if (matchState.status !== "LIVE") return;

  const officialMinutes = (matchState.meta.halfLengthMin || 35) * 2;
  const clockMinutes = Math.max(
    officialMinutes,
    Math.ceil(getCurrentMatchTimeMs() / 60000)
  );
  const overtimeMinutes = Math.max(0, clockMinutes - officialMinutes);
  const input = document.getElementById("endTimeInput");

  input.value = overtimeMinutes > 0
    ? `${officialMinutes} + ${overtimeMinutes}`
    : String(officialMinutes);
  document.getElementById("endTimeClockHint").textContent =
    `Klokken viser omtrent ${clockMinutes} minutter.`;
  document.getElementById("endTimeModal").classList.remove("hidden");
  input.focus();
  input.select();
}

function closeEndTimeModal() {
  document.getElementById("endTimeModal").classList.add("hidden");
}

function closePlayingIntervalsAt(finalTimeMs) {
  Object.values(matchState.players.home).forEach(player => {
    const intervals = Array.isArray(player.intervals) ? player.intervals : [];

    player.intervals = intervals
      .filter(interval => Number(interval?.in) < finalTimeMs)
      .map(interval => ({
        ...interval,
        out: Math.min(
          interval.out == null ? finalTimeMs : Number(interval.out),
          finalTimeMs
        )
      }))
      .filter(interval => interval.out > interval.in);
  });
}

async function finishMatchAt(finalMinute) {
  const finalTimeMs = finalMinute.totalMinutes * 60 * 1000;

  // Bare faktiske kamphendelser skal kunne begrense sluttiden.
  // Systemhendelser som klokkejustering, pause/start og statusmeldinger
  // kan ha timeMs fra før/etter en manuell klokkejustering og skal ikke blokkere kampslutt.
  const latestMatchEventTimeMs = Math.max(
    0,
    ...matchState.events
      .filter(event => ["goal", "substitution", "card"].includes(event?.type))
      .map(event => Number(event?.timeMs) || 0)
  );

  if (finalTimeMs < latestMatchEventTimeMs) {
    alert("Sluttminuttet kan ikke være før den siste registrerte kamphendelsen. Rediger hendelsen først.");
    return;
  }

  closePlayingIntervalsAt(finalTimeMs);
  matchState.timer.elapsedMs = finalTimeMs;
  matchState.timer.startTimestamp = null;

  closeEndTimeModal();
  stopClock();
  matchState.status = "ENDED";

  periodIndicator.textContent = "Kamp ferdig";

  addEvent(`🏁 Kamp avsluttet (${finalMinute.label} min)`);

  updateControls();

  await saveFinalMatch();
}

endBtn.addEventListener("click", openEndTimeModal);

document.getElementById("cancelEndTimeBtn")
  .addEventListener("click", closeEndTimeModal);

document.getElementById("confirmEndTimeBtn")
  .addEventListener("click", async () => {
    const finalMinute = parseMatchMinuteInput(
      document.getElementById("endTimeInput").value
    );

    if (!finalMinute || finalMinute.totalMinutes <= 0) {
      alert("Skriv sluttminutt som 70 eller 70 + 3.");
      return;
    }

    await finishMatchAt(finalMinute);
});

function preserveFirstHalfOvertime(firstHalfEndMs) {
  const officialHalfMs = getHalfLengthMs();
  if (firstHalfEndMs <= officialHalfMs) return;

  Object.values(matchState.players.home).forEach(player => {
    const intervals = Array.isArray(player.intervals) ? player.intervals : [];
    const overtimePlayedMs = intervals.reduce((sum, interval) => {
      const start = Math.max(Number(interval.in) || 0, officialHalfMs);
      const end = Math.min(
        interval.out == null ? firstHalfEndMs : Number(interval.out),
        firstHalfEndMs
      );
      return sum + Math.max(0, end - start);
    }, 0);

    player.extraPlayingTimeMs =
      Math.max(0, Number(player.extraPlayingTimeMs) || 0) + overtimePlayedMs;

    player.intervals = intervals
      .filter(interval => (Number(interval.in) || 0) < officialHalfMs)
      .map(interval => ({
        ...interval,
        out: Math.min(
          interval.out == null ? firstHalfEndMs : Number(interval.out),
          officialHalfMs
        )
      }))
      .filter(interval => interval.out > interval.in);
  });
}

resumeBtn.addEventListener("click", () => {

  if (matchState.status === "TEMP_STOPPED") {
    matchState.status = "LIVE";
    startTimerNow();
    periodIndicator.textContent = `${matchState.period}. omgang`;

    startClock();
    addEvent("▶️ Kampen fortsatte");
    syncUI();
    return;
  }

  if (!["HALFTIME", "PAUSED"].includes(matchState.status)) return;

  preserveFirstHalfOvertime(matchState.timer.elapsedMs);

  // Kampklokken starter på ordinære 35:00, mens eventuell tilleggstid
  // fra 1. omgang ligger bevart separat på spillerne.
  matchState.period = 2;
  matchState.timer.elapsedMs = getHalfLengthMs(); // ← VIKTIG
  matchState.halftimeStartedAt = null;

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
  manualGoalTimeWrapper.classList.add("hidden");
  manualGoalTimeInput.value = "";
  toggleManualGoalTimeBtn.textContent = "Endre tidspunkt";
  goalTimeSummary.textContent = `Registreres i ${formatMatchMinute(getLiveElapsedMs()) || "1"}. minutt`;

  homeScorerWrapper.classList.add("hidden");
  opponentScorerWrapper.classList.add("hidden");
  confirmGoalBtn.classList.add("hidden");

  if (pendingGoalTeam === "home") {
    const teamName = matchState.meta.ourTeam || "Samnanger";
    goalModalTitle.textContent = `Hvem scoret for ${teamName}?`;
    goalModalHelp.textContent = "Trykk på spilleren – målet lagres med én gang.";
    homeScorerWrapper.classList.remove("hidden");
    populateGoalScorers("home");
  }

  if (pendingGoalTeam === "away") {
    const teamName = matchState.meta.opponent || "motstanderen";
    goalModalTitle.textContent = `Mål til ${teamName}`;
    goalModalHelp.textContent = "Navn er valgfritt.";
    opponentScorerWrapper.classList.remove("hidden");
    confirmGoalBtn.classList.remove("hidden");
    opponentScorerInput.value = "";
  }
}

function closeGoalModal() {
  goalModal.classList.add("hidden");
  manualGoalTimeInput.value = "";
  manualGoalTimeWrapper.classList.add("hidden");
  toggleManualGoalTimeBtn.textContent = "Endre tidspunkt";
  goalScorerSelect.value = "";
  opponentScorerInput.value = "";
  pendingGoalTeam = null;
}

toggleManualGoalTimeBtn.addEventListener("click", () => {
  const isOpening = manualGoalTimeWrapper.classList.contains("hidden");
  manualGoalTimeWrapper.classList.toggle("hidden", !isOpening);
  toggleManualGoalTimeBtn.textContent = isOpening ? "Bruk kampklokken" : "Endre tidspunkt";
  goalTimeSummary.textContent = isOpening
    ? "Velg kampminutt"
    : `Registreres i ${formatMatchMinute(getLiveElapsedMs()) || "1"}. minutt`;

  if (isOpening) {
    manualGoalTimeInput.focus();
  } else {
    manualGoalTimeInput.value = "";
  }
});

function getPendingGoalTimeMs() {
  if (manualGoalTimeWrapper.classList.contains("hidden")) {
    return getLiveElapsedMs();
  }

  const parsed = parseMatchMinuteInput(manualGoalTimeInput.value);
  if (!parsed || parsed.baseMinute < 1) {
    alert("Skriv inn kampminutt, for eksempel 12 eller 70 + 2");
    return null;
  }

  const liveTimeMs = getLiveElapsedMs();
  const liveMinute = Math.max(1, Math.ceil(liveTimeMs / 60000));
  if (parsed.totalMinutes > liveMinute) {
    alert(`Kampklokken har bare kommet til ${liveMinute}. minutt`);
    return null;
  }

  return Math.min(liveTimeMs, parsed.totalMinutes * 60000 - 1);
}

function registerPendingGoal(scorerData) {
  if (!pendingGoalTeam) return;
  const timeMs = getPendingGoalTimeMs();
  if (timeMs === null) return;

  registerGoal(pendingGoalTeam, timeMs, scorerData);
  closeGoalModal();

  setTimeout(() => {
    updatePlayingTimeUI();
  }, 0);
}

confirmGoalBtn.addEventListener("click", () => {
  const text = opponentScorerInput.value.trim();
  registerPendingGoal({ text: text || null });
});

opponentScorerInput.addEventListener("keydown", event => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  confirmGoalBtn.click();
});

cancelGoalBtn.addEventListener("click", closeGoalModal);

  
  updateScoreboard();

let pendingSubOutId = null;

const subPlayerGrid = document.getElementById("subPlayerGrid");
const subInstruction = document.getElementById("subInstruction");
const subBackBtn = document.getElementById("subBackBtn");
const manualSubTimeWrapper = document.getElementById("manualSubTimeWrapper");
const manualSubTimeInput = document.getElementById("manualSubTime");
const toggleManualSubTimeBtn = document.getElementById("toggleManualSubTimeBtn");
const subTimeSummary = document.getElementById("subTimeSummary");

function fillSubPlayerGrid(players, selectionType) {
  subPlayerGrid.innerHTML = "";

  players
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, "nb"))
    .forEach(player => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `sub-player-option sub-player-${selectionType}`;
      button.textContent = player.name;
      button.addEventListener("click", () => {
        if (selectionType === "out") {
          chooseSubPlayerOut(player.id);
        } else {
          completeQuickSubstitution(player.id);
        }
      });
      subPlayerGrid.appendChild(button);
    });
}

function openSubModal() {
  pendingSubOutId = null;
  subInstruction.textContent = "Hvem skal ut?";
  subBackBtn.classList.add("hidden");
  manualSubTimeWrapper.classList.add("hidden");
  manualSubTimeInput.value = "";
  toggleManualSubTimeBtn.textContent = "Endre tidspunkt";
  subTimeSummary.textContent = `Bytte i ${formatMatchMinute(getCurrentMatchTimeMs()) || "1"}. minutt`;

  const onFieldPlayers = matchState.squad.onField.home
    .map(id => matchState.players.home[id])
    .filter(Boolean);

  fillSubPlayerGrid(onFieldPlayers, "out");
  document.getElementById("subModal").classList.remove("hidden");
}

toggleManualSubTimeBtn.addEventListener("click", () => {
  const isOpening = manualSubTimeWrapper.classList.contains("hidden");
  manualSubTimeWrapper.classList.toggle("hidden", !isOpening);
  toggleManualSubTimeBtn.textContent = isOpening ? "Bruk kampklokken" : "Endre tidspunkt";
  subTimeSummary.textContent = isOpening
    ? "Velg kampminutt"
    : `Bytte i ${formatMatchMinute(getCurrentMatchTimeMs()) || "1"}. minutt`;

  if (isOpening) {
    manualSubTimeInput.focus();
  } else {
    manualSubTimeInput.value = "";
  }
});

function getSubstitutionTimeMs(outId, inId) {
  if (manualSubTimeWrapper.classList.contains("hidden")) {
    return getCurrentMatchTimeMs();
  }

  const parsed = parseMatchMinuteInput(manualSubTimeInput.value);
  if (!parsed || parsed.baseMinute < 1) {
    alert("Skriv inn kampminutt, for eksempel 48 eller 70 + 2");
    return null;
  }

  const currentTimeMs = getCurrentMatchTimeMs();
  const currentMinute = Math.max(1, Math.ceil(currentTimeMs / 60000));

  if (parsed.totalMinutes > currentMinute) {
    alert(`Byttet må være mellom kampminutt 1 og ${currentMinute}`);
    return null;
  }

  const timeMs = Math.min(parsed.totalMinutes * 60 * 1000 - 1, currentTimeMs);
  const outPlayer = matchState.players.home[outId];
  const inPlayer = matchState.players.home[inId];
  const outInterval = outPlayer?.intervals?.at(-1);
  const previousInInterval = inPlayer?.intervals?.at(-1);

  if (outInterval && timeMs < outInterval.in) {
    alert(`${outPlayer.name} var ikke på banen på det tidspunktet`);
    return null;
  }

  if (previousInInterval?.out != null && timeMs < previousInInterval.out) {
    alert(`${inPlayer.name} var fortsatt på banen på det tidspunktet`);
    return null;
  }

  return timeMs;
}

function chooseSubPlayerOut(playerId) {
  pendingSubOutId = playerId;
  const outPlayer = matchState.players.home[playerId];
  const benchPlayers = Object.values(matchState.players.home).filter(player => {
    const hasRedCard = player.cards?.some(card => card.type === "red");
    return !isOnField(player.id) && !hasRedCard && player.present;
  });

  subInstruction.textContent = `${outPlayer.name} ut – hvem skal inn?`;
  subBackBtn.classList.remove("hidden");
  fillSubPlayerGrid(benchPlayers, "in");
}

function completeQuickSubstitution(inPlayerId) {
  if (!pendingSubOutId) return;
  const timeMs = getSubstitutionTimeMs(pendingSubOutId, inPlayerId);
  if (timeMs === null) return;

  makeSubstitution(pendingSubOutId, inPlayerId, timeMs);
  closeSubModal();

  setTimeout(() => {
    updatePlayingTimeUI();
  }, 0);
}

subBackBtn.addEventListener("click", () => {
  pendingSubOutId = null;
  subInstruction.textContent = "Hvem skal ut?";
  subBackBtn.classList.add("hidden");
  const onFieldPlayers = matchState.squad.onField.home
    .map(id => matchState.players.home[id])
    .filter(Boolean);
  fillSubPlayerGrid(onFieldPlayers, "out");
});

function calculatePlayingTimeMs(player) {
  let totalMs = Math.max(0, Number(player?.extraPlayingTimeMs) || 0);
  const currentTime = getCurrentMatchTimeMs();
  const intervals = Array.isArray(player?.intervals) ? player.intervals : [];

  intervals.forEach(interval => {
    const start = Math.max(0, Number(interval?.in) || 0);
    const end = interval?.out == null
      ? currentTime
      : Math.max(0, Number(interval.out) || 0);
    totalMs += Math.max(0, end - start);
  });

  return totalMs;
}

function calculateMinutesPlayed(player) {
  return Math.floor(calculatePlayingTimeMs(player) / 60000);
}


document.getElementById("togglePlayingTimeBtn")
.addEventListener("click", () => {

  const panel = document.getElementById("playingTimePanel");
  panel.classList.toggle("hidden");

  const isHidden = panel.classList.contains("hidden");

  document.getElementById("togglePlayingTimeBtn")
    .classList.toggle("is-expanded", !isHidden);

  // Oppdater hvert sekund slik at det er synlig at spilletiden faktisk går.
  if (!isHidden) {
    updatePlayingTimeUI();

    clearInterval(playingTimeInterval);
    playingTimeInterval = setInterval(() => {
      updatePlayingTimeUI();
    }, 1000);
  } else {
    clearInterval(playingTimeInterval);
    playingTimeInterval = null;
  }
});
  
  const adjustModal = document.getElementById("adjustTimeModal");
const adjustInput = document.getElementById("adjustTimeInput");

document.getElementById("adjustStartBtn").addEventListener("click", () => {
  if (matchState.period === 1 && matchState.status === "HALFTIME") {
    openHalfTimeEndModal();
    return;
  }

  if (!["LIVE", "TEMP_STOPPED"].includes(matchState.status)) {
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

  const latestEventTimeMs = Math.max(
    0,
    ...matchState.events
      .filter(event => ["goal", "substitution", "card"].includes(event?.type))
      .map(event => Number(event?.timeMs) || 0)
  );
  const latestOpenIntervalStart = Math.max(
    0,
    ...Object.values(matchState.players.home)
      .flatMap(player => player?.intervals || [])
      .filter(interval => interval?.out === null)
      .map(interval => Number(interval.in) || 0)
  );

  if (adjustMs < Math.max(latestEventTimeMs, latestOpenIntervalStart)) {
    alert("Klokken kan ikke flyttes til før siste registrerte hendelse eller spillerbytte.");
    return;
  }

  matchState.timer.elapsedMs = adjustMs;
  matchState.timer.startTimestamp = matchState.status === "LIVE" ? Date.now() : null;

  addEvent(`⏱️ Kampklokken korrigert til ${minutes} min`);

  updatePlayingTimeUI();
saveLiveUpdate();
  adjustModal.classList.add("hidden");
});

const MINIMUM_PLAYING_MINUTES = 25;

function updatePlayingTimeUI() {
  const list = document.getElementById("playingTimeList");
  list.innerHTML = "";

  const players = Object.values(matchState.players.home)
    .filter(player => player?.present === true);

  players.sort((a, b) => {
    const aOn = isOnField(a.id);
    const bOn = isOnField(b.id);
    const aPlayedMs = Math.max(0, calculatePlayingTimeMs(a));
    const bPlayedMs = Math.max(0, calculatePlayingTimeMs(b));

    // På banen først
    if (aOn && !bOn) return -1;
    if (!aOn && bOn) return 1;

    // Innen samme gruppe: mest spilletid først.
    return bPlayedMs - aPlayedMs;
  });

  const avgPlayingMs = players.length > 0
    ? players.reduce(
        (sum, player) => sum + Math.max(0, calculatePlayingTimeMs(player)),
        0
      ) / players.length
    : 0;
  const minimumPlayingMs = MINIMUM_PLAYING_MINUTES * 60 * 1000;

  let currentSection = null;

  players.forEach(player => {
    const isOn = isOnField(player.id);
    const playedMs = Math.max(0, calculatePlayingTimeMs(player));
    const minutes = Math.floor(playedMs / 60000);

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

    const minimumReached = playedMs >= minimumPlayingMs;
    const minutesMissing = Math.max(
      0,
      Math.ceil((minimumPlayingMs - playedMs) / 60000)
    );
    const minimumStatus = minimumReached
      ? `<span class="minimum-status minimum-reached" title="Minstekravet er nådd">✓</span>`
      : `<span class="minimum-status minimum-missing">mangler ${minutesMissing}</span>`;

    li.innerHTML = `
  <span class="player-name">
    ${player.name} <span class="cards">${cardText}</span>
  </span>
  <span class="player-minutes">
    <span class="minutes-value">${formatTime(playedMs)}</span>
    ${minimumStatus}
  </span>
`;

    li.classList.add(minimumReached ? "minimum-met" : "minimum-under");

    if (isOn) {
      li.classList.add("on");
    } else {
      li.classList.add("bench");
    }

    if (playedMs > avgPlayingMs + 5 * 60 * 1000) {
      li.classList.add("tired");
    }

    if (playedMs < avgPlayingMs - 5 * 60 * 1000) {
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
  if (!isSquadModalOpen) {
    squadDraftSnapshot = {
      playersHome: JSON.parse(JSON.stringify(matchState.players.home)),
      onFieldHome: [...matchState.squad.onField.home],
      lineupConfirmed: matchState.lineupConfirmed
    };
  }

  isSquadModalOpen = true;
	const squadLocked = !["NOT_STARTED", "UPCOMING", "SCHEDULED", "PREMATCH", ""].includes(String(matchState.status || "").toUpperCase());
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
  if (loanBtn) loanBtn.style.display = "none";
} else {
  saveBtn.disabled = true; // styres av starter-teller
  saveBtn.style.display = "inline-block";
  if (loanBtn) loanBtn.style.display = loanFlowReady ? "block" : "none";
}

  Object.values(matchState.players.home).forEach(player => {

  if (!player || !player.id) return;

  const li = document.createElement("li");
  li.className = "squad-row";
  li.dataset.playerId = player.id;
  li.classList.toggle("not-present", player.present !== true);

  if (player.id === pendingNewLoanPlayerId) {
    li.classList.add("is-new-loan");
  }

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

  if (pendingNewLoanPlayerId) {
    const newLoanRow = [...list.children].find(
      row => row.dataset.playerId === pendingNewLoanPlayerId
    );
    pendingNewLoanPlayerId = null;
    setTimeout(() => {
      newLoanRow?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }
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
  if (!p.present) return;
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
  const wasPlayerOnField = isOnField(playerId);

  if (player.cards.some(c => c.type === "red")) {
    alert("Spilleren er allerede utvist");
    return;
  }

  const cardId = crypto.randomUUID?.() || `card-${Date.now()}-${Math.random()}`;
  player.cards.push({ id: cardId, type, timeMs });
  addEvent({
    type: "card",
    team: "home",
    cardType: type,
    cardId,
    playerId,
    playerName: player.name,
    wasPlayerOnField,
    period: matchState.period,
    timeMs,
    minute: minuteText,
    text: `${icon} ${minuteText} – ${player.name}`
  });

  const yellowCount =
    player.cards.filter(c => c.type === "yellow").length;

  if (type === "yellow" && yellowCount === 2) {
    const redCardId = crypto.randomUUID?.() || `card-${Date.now()}-${Math.random()}`;
    player.cards.push({
      id: redCardId,
      type: "red",
      timeMs,
      derivedFromCardId: cardId
    });
    addEvent({
      type: "card",
      team: "home",
      cardType: "red",
      cardId: redCardId,
      derivedFromCardId: cardId,
      playerId,
      playerName: player.name,
      wasPlayerOnField,
      period: matchState.period,
      timeMs,
      minute: minuteText,
      text: `🟥 ${minuteText} – ${player.name} (2 gule)`
    });
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

  const opponentName =
    matchState.meta.opponent || awayTeamInput.value.trim() || "Motstander";

  addEvent({
    type: "card",
    team: "away",
    cardType: type,
    playerId: null,
    playerName: name,
    period: matchState.period,
    timeMs,
    minute: minuteText,
    text: `${icon} ${minuteText} – ${name} (${opponentName})`
  });
}

document
  .getElementById("cardModal")
  .classList.add("hidden");
saveLiveUpdate(); 
});


function getLineupPlayerKey(name) {
  return String(name || "")
    .trim()
    .split(/\s+/)[0]
    .toLocaleLowerCase("no");
}

async function syncLineupWithSquad() {
  try {
    const matchRef = getMatchRef();
    const snapshot = await getDoc(matchRef);
    const storedData = snapshot.exists() ? snapshot.data() : {};
    const storedLineup = Array.isArray(storedData.lineup)
      ? storedData.lineup
      : DEFAULT_451_LINEUP;
    const starterPlayers = Object.values(matchState.players.home)
      .filter(player => player.present === true && player.starter === true);

    const lineupByPlayer = new Map(
      storedLineup.map(player => [getLineupPlayerKey(player.name), player])
    );
    const positionSlots = [];
    const positionKeys = new Set();

    [...storedLineup, ...DEFAULT_451_LINEUP].forEach(player => {
      if (!Number.isFinite(player?.x) || !Number.isFinite(player?.y)) return;
      const positionKey = `${player.x}:${player.y}`;
      if (positionKeys.has(positionKey)) return;
      positionKeys.add(positionKey);
      positionSlots.push({ x: player.x, y: player.y });
    });

    const usedPositions = new Set();
    starterPlayers.forEach(player => {
      const existing = lineupByPlayer.get(getLineupPlayerKey(player.name));
      if (existing && Number.isFinite(existing.x) && Number.isFinite(existing.y)) {
        usedPositions.add(`${existing.x}:${existing.y}`);
      }
    });

    const syncedLineup = starterPlayers.map(player => {
      const existing = lineupByPlayer.get(getLineupPlayerKey(player.name));
      if (existing) {
        return { ...existing };
      }

      const freePosition = positionSlots.find(position =>
        !usedPositions.has(`${position.x}:${position.y}`)
      ) || { x: 50, y: 50 };
      usedPositions.add(`${freePosition.x}:${freePosition.y}`);

      return {
        id: player.id,
        name: player.fullName || player.name,
        x: freePosition.x,
        y: freePosition.y
      };
    });

    await updateDoc(matchRef, {
      lineup: syncedLineup,
      formation: storedData.formation || "4-5-1",
      players: matchState.players.home,
      onField: matchState.squad.onField.home,
      lineupConfirmed: syncedLineup.length === MAX_STARTERS,
      updatedAt: serverTimestamp()
    });

    return true;
  } catch (error) {
    console.error("Kunne ikke synkronisere kamptropp og lagoppstilling:", error);
    alert("Kunne ikke oppdatere lagoppstillingen. Prøv igjen.");
    return false;
  }
}

document.getElementById("saveSquadBtn").addEventListener("click", async () => {

  if (!["NOT_STARTED", "UPCOMING", "SCHEDULED", "PREMATCH", ""].includes(String(matchState.status || "").toUpperCase())) {
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
const lineupSynced = await syncLineupWithSquad();
if (!lineupSynced) return;
await saveLiveUpdate();
isSquadModalOpen = false;
squadDraftSnapshot = null;
document.getElementById("squadModal").classList.add("hidden");
syncUI();

});

document.getElementById("cancelSquadBtn")
  .addEventListener("click", () => {
    if (squadDraftSnapshot) {
      matchState.players.home = squadDraftSnapshot.playersHome;
      matchState.squad.onField.home = squadDraftSnapshot.onFieldHome;
      matchState.lineupConfirmed = squadDraftSnapshot.lineupConfirmed;
    }

    squadDraftSnapshot = null;
    pendingNewLoanPlayerId = null;
    isSquadModalOpen = false;
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
  pendingSubOutId = null;
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

// Forny varslingstokenet stille når tillatelsen allerede er gitt. Dette er
// viktig på iPhone fordi tokenet kan endres etter en systemoppdatering.
if (typeof Notification !== "undefined" && Notification.permission === "granted") {
  enableMatchPushNotifications().catch(error => {
    console.warn("Kunne ikke fornye kampvarslingstoken:", error);
  });
}

await loadActiveMatch();

const liveMatch = await findLiveMatch();

if (liveMatch) {
  const liveId = liveMatch.id;

  // hvis du IKKE allerede er i denne kampen
  if (localStorage.getItem("activeMatchId") !== liveId) {
    localStorage.setItem("activeMatchId", liveId);
    window.location.href =
      `kamp.html?matchId=${encodeURIComponent(liveId)}&v=${KAMP_PAGE_VERSION}`;
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

  const saveVersion = beginSaveStatus();

  let matchRef;

  if (matchState.userRole === "coach") {
    matchRef = doc(db, "matches", matchState.matchId);
  } else {
    matchRef = getMatchRef();
  }

  if (!matchRef) {
    finishSaveStatus(saveVersion, false);
    return;
  }

  const summary = getMatchSummary();

const data = {
  meta: matchState.meta,
  score: matchState.score,
  events: matchState.events,
  firstHalfActualEndMs: matchState.firstHalfActualEndMs,
  ...summary,
  status: "ENDED",
  updatedAt: serverTimestamp()
};

// 🔥 legg til type kun hvis den finnes
if (matchState.meta?.type) {
  data.type = matchState.meta.type;
}

try {
  await setDoc(matchRef, data, { merge: true });
  if (matchState.liveSharingEnabled) await savePublicLiveUpdate();
  finishSaveStatus(saveVersion, true);
  console.log("Kamp avsluttet:", matchState.matchId);
} catch (error) {
  console.error("Kunne ikke lagre kampslutt:", error);
  finishSaveStatus(saveVersion, false);
}
}

function buildPublicMatchEvents() {
  return matchState.events.map(event => ({
    id: String(event.id || ""),
    type: event.type || "text",
    team: event.team || "",
    playerName: event.playerName || "",
    minute: String(event.minute || ""),
    period: Number(event.period) || 1,
    timeMs: Number(event.timeMs) || 0,
    rawText: event.rawText || "",
    createdClock: event.createdClock || "",
    reportedAt: event.reportedAt || "",
    edited: event.edited === true,
    cardType: event.cardType || "",
    outPlayerName: event.outPlayerName || "",
    inPlayerName: event.inPlayerName || ""
  }));
}

async function savePublicLiveUpdate() {
  if (!matchState.liveSharingEnabled || !auth.currentUser || !matchState.matchId) {
    return false;
  }

  const publicData = {
    status: matchState.status,
    period: matchState.period,
    score: {
      our: Number(matchState.score.our) || 0,
      their: Number(matchState.score.their) || 0
    },
    timer: {
      elapsedMs: Number(matchState.timer.elapsedMs) || 0,
      startTimestamp: matchState.timer.startTimestamp || null
    },
    meta: {
      ourTeam: matchState.meta.ourTeam || "Samnanger",
      opponent: matchState.meta.opponent || "Motstander",
      date: matchState.meta.date || "",
      startTime: matchState.meta.startTime || matchState.meta.time || "",
      venue: matchState.meta.venue || matchState.meta.venueType || "home",
      type: matchState.meta.type || "league",
      halfLengthMin: Number(matchState.meta.halfLengthMin) || 35
    },
    events: buildPublicMatchEvents(),
    updatedAt: serverTimestamp()
  };

  try {
    await Promise.all([
      setDoc(
        doc(db, "publicMatches", matchState.matchId),
        publicData,
        { merge: true }
      ),
      setDoc(
        doc(db, "publicMatches", "samnanger-g14-live"),
        {
          ...publicData,
          sourceMatchId: matchState.matchId
        }
      )
    ]);
    return true;
  } catch (error) {
    console.error("Kunne ikke oppdatere offentlig livevisning:", error);
    return false;
  }
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

  const saveVersion = beginSaveStatus();

  const data = {
    meta: {
      ...matchState.meta,
      halfLengthMin: Number(matchState.meta.halfLengthMin) || 35
    },
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
    liveSharingEnabled: matchState.liveSharingEnabled,
    halftimeStartedAt: matchState.halftimeStartedAt,
    firstHalfActualEndMs: matchState.firstHalfActualEndMs,
    updatedAt: serverTimestamp()
  };

  // 🔥 legg kun til hvis de finnes
  if (matchState.startedAt) {
    data.startedAt = matchState.startedAt;
  }

  if (matchState.meta?.type) {
    data.type = matchState.meta.type;
  }

  try {
    await setDoc(matchRef, data, { merge: true });
    localStorage.setItem("lastMatchState", JSON.stringify(matchState));
    const publicSaved = matchState.liveSharingEnabled
      ? await savePublicLiveUpdate()
      : true;
    finishSaveStatus(saveVersion, true);
    return publicSaved;
  } catch (error) {
    console.error("Kunne ikke lagre kampoppdateringen:", error);
    finishSaveStatus(saveVersion, false);
    return false;
  }
}


/* ======================================================
   INITIAL UI STATE
   ====================================================== */
   function resetMatchState() {
  // 🔄 Match state
  matchState.status = "NOT_STARTED";
  matchState.period = 1;
  matchState.lineupConfirmed = false;
  matchState.liveSharingEnabled = false;
  matchState.halftimeStartedAt = null;
  matchState.firstHalfActualEndMs = null;

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
  window.location.href = "oversikt.html";
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

  toggleEventsBtn.classList.toggle("is-expanded", !isHidden);
  actionCard.classList.toggle("events-panel-open", !isHidden);
});

document.addEventListener("click", event => {
  if (event.target.closest(".event-actions")) return;
  document.querySelectorAll(".event-action-menu").forEach(menu => {
    menu.classList.add("hidden");
  });
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

function getRemoteTimestampMs(value) {
  if (Number.isFinite(value)) return value;
  if (typeof value?.toMillis === "function") return value.toMillis();
  if (value instanceof Date) return value.getTime();
  if (Number.isFinite(value?.seconds)) {
    return value.seconds * 1000 + Math.floor((Number(value.nanoseconds) || 0) / 1000000);
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function copyRemotePlayers(players) {
  if (!players || typeof players !== "object" || Array.isArray(players)) return null;

  return Object.fromEntries(
    Object.entries(players).map(([id, player]) => [
      id,
      {
        ...player,
        id: player?.id || id,
        name: player?.name || "Ukjent",
        present: player?.present === true,
        starter: player?.starter === true,
        intervals: Array.isArray(player?.intervals)
          ? player.intervals.map(interval => ({ ...interval }))
          : [],
        cards: Array.isArray(player?.cards)
          ? player.cards.map(card => ({ ...card }))
          : []
      }
    ])
  );
}

function preserveLocalPlayingTimeOnRemoteSync(remotePlayers, remoteStatus) {
  if (!["LIVE", "TEMP_STOPPED"].includes(remoteStatus)) return remotePlayers;

  Object.entries(remotePlayers).forEach(([id, remotePlayer]) => {
    const localPlayer = matchState.players.home[id];
    if (!localPlayer) return;

    const remoteIntervals = Array.isArray(remotePlayer.intervals)
      ? remotePlayer.intervals
      : [];
    const localIntervals = Array.isArray(localPlayer.intervals)
      ? localPlayer.intervals
      : [];

    // En tom serverkopi rett etter kampstart skal aldri kunne slette et
    // allerede opprettet lokalt spilleintervall.
    if (remoteIntervals.length === 0 && localIntervals.length > 0) {
      remotePlayer.intervals = localIntervals.map(interval => ({ ...interval }));
      remotePlayer.extraPlayingTimeMs = Math.max(
        Number(remotePlayer.extraPlayingTimeMs) || 0,
        Number(localPlayer.extraPlayingTimeMs) || 0
      );
    }
  });

  return remotePlayers;
}

function applyRemoteLineupFallback(data) {
  if (
    !Array.isArray(data.lineup) ||
    data.lineupConfirmed ||
    data.players
  ) {
    return;
  }

  const lineupNames = new Set(
    data.lineup.map(player => getLineupPlayerKey(player?.name))
  );

  Object.values(matchState.players.home).forEach(player => {
    player.starter = lineupNames.has(getLineupPlayerKey(player.name));
    if (player.starter) player.present = true;
  });

  matchState.squad.onField.home = Object.values(matchState.players.home)
    .filter(player => player.starter)
    .map(player => player.id);
}

function updateClockAfterRemoteSync() {
  stopClock();

  if (matchState.status === "LIVE") {
    if (!Number.isFinite(matchState.timer.startTimestamp)) {
      matchState.timer.startTimestamp = Date.now();
    }
    periodIndicator.textContent = `${matchState.period}. omgang`;
    startClock();
    return;
  }

  document.getElementById("game-clock").textContent =
    formatTime(matchState.timer.elapsedMs);

  if (matchState.status === "TEMP_STOPPED") {
    periodIndicator.textContent = `${matchState.period}. omgang – klokken stoppet`;
  } else if (["HALFTIME", "PAUSED"].includes(matchState.status)) {
    periodIndicator.textContent = "Pause mellom omgangene";
  } else if (matchState.status === "ENDED") {
    periodIndicator.textContent = "Kamp ferdig";
  }
}

function applyRemoteMatchData(data) {
  if (!data || !matchState.matchId) return;

  if (data.meta && typeof data.meta === "object") {
    matchState.meta = { ...matchState.meta, ...data.meta };
    matchState.meta.venue =
      data.meta.venue || data.meta.venueType || matchState.meta.venue || "home";
  }

  if (data.score && typeof data.score === "object") {
    matchState.score = {
      our: Number(data.score.our) || 0,
      their: Number(data.score.their) || 0
    };
  }

  if (Array.isArray(data.events)) {
    matchState.events = data.events.map(event => ({ ...event }));
  }

  if (Number.isFinite(data.period)) {
    matchState.period = data.period;
  }

  if (typeof data.status === "string") {
    matchState.status = data.status;
  }

  if (data.timer && typeof data.timer === "object") {
    matchState.timer.elapsedMs = Number(data.timer.elapsedMs) || 0;
    matchState.timer.startTimestamp = getRemoteTimestampMs(data.timer.startTimestamp);
  }

  const remotePlayers = copyRemotePlayers(data.players);
  if (remotePlayers) {
    matchState.players.home = preserveLocalPlayingTimeOnRemoteSync(
      remotePlayers,
      data.status || matchState.status
    );
  }

  if (Array.isArray(data.onField)) {
    matchState.squad.onField.home = data.onField.filter(
      id => matchState.players.home[id]?.present === true
    );
  } else if (Array.isArray(data.squad?.starters)) {
    matchState.squad.onField.home = data.squad.starters
      .map(player => player?.id)
      .filter(id => matchState.players.home[id]?.present === true);
  }

  if (typeof data.lineupConfirmed === "boolean") {
    matchState.lineupConfirmed = data.lineupConfirmed;
  }

  if (typeof data.liveSharingEnabled === "boolean") {
    matchState.liveSharingEnabled = data.liveSharingEnabled;
  }

  if (Object.prototype.hasOwnProperty.call(data, "halftimeStartedAt")) {
    matchState.halftimeStartedAt = getRemoteTimestampMs(data.halftimeStartedAt);
  }
  if (Object.prototype.hasOwnProperty.call(data, "firstHalfActualEndMs")) {
    matchState.firstHalfActualEndMs = Number.isFinite(data.firstHalfActualEndMs)
      ? data.firstHalfActualEndMs
      : null;
  }

  applyRemoteLineupFallback(data);
  sanitizePlayers();
  updateClockAfterRemoteSync();
  syncUI();
  populateGoalScorers("home");

  if (isSquadModalOpen) {
    openSquadModal();
  }
}

function subscribeToActiveMatch(matchRef) {
  unsubscribeActiveMatch?.();
  unsubscribeActiveMatch = onSnapshot(
    matchRef,
    snapshot => {
      if (!snapshot.exists() || snapshot.metadata.hasPendingWrites) return;

      const data = snapshot.data();
      const remoteUpdatedAt = getRemoteTimestampMs(data.updatedAt);
      if (remoteUpdatedAt && remoteUpdatedAt < lastAppliedRemoteUpdateMs) return;
      if (remoteUpdatedAt) lastAppliedRemoteUpdateMs = remoteUpdatedAt;

      applyRemoteMatchData(data);
      saveStatusElement.textContent = "✓ Synkronisert";
      saveStatusElement.className = "save-status saved";
    },
    error => {
      console.error("Sanntidssynkronisering feilet:", error);
    }
  );
}

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

  activeMatchDocumentRef = matchRef;
  const data = snap.data();

  if (data.status === "ENDED") {
    localStorage.removeItem("activeMatchId");
    window.location.href = "oversikt.html";
    return;
  }

  document.body.classList.remove("overview-return-mode");
  startScreen.style.display = "none";
  document.getElementById("match-header").style.display = "";
  document.getElementById("backBtn")?.classList.remove("hidden");
  matchReminder.style.display = "";

  // Nye kamper som aldri har vært åpnet i lagoppstillingen skal likevel
  // starte med den avtalte 4-5-1-oppstillingen og en ferdig kamptropp.
  const shouldApplyDefaultLineup = !Array.isArray(data.lineup);
  const isStoredPreMatch = ["NOT_STARTED", "UPCOMING"].includes(
    String(data.status || "NOT_STARTED").toUpperCase()
  );
  const effectiveLineup = (
    shouldApplyDefaultLineup
      ? DEFAULT_451_LINEUP.map(player => ({ ...player }))
      : data.lineup
  ).filter(player => !isRetiredPlayerName(player?.name));

  matchState.matchId = matchId;
  matchState.meta = {
    ourTeam: "Samnanger",
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
  matchState.meta.ourTeam = matchState.meta.ourTeam?.trim() || "Samnanger";
  matchState.meta.opponent = matchState.meta.opponent?.trim() || "Motstander";

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

  // Eldre hendelser kan inneholde fullt navn fra Firestore.
  // Faste spillere skal vises med samme kortnavn som i resten av kampbildet.
  const shortNameByStoredName = new Map();

  const storedPlayerNames = [
    ...Object.values(data.players || {}),
    ...(Array.isArray(data.lineup) ? data.lineup : [])
  ];

  storedPlayerNames.forEach(storedPlayer => {
    if (!storedPlayer?.name) return;

    const firstName = storedPlayer.name.split(" ")[0].trim().toLowerCase();
    const squadPlayer = HOME_SQUAD.find(
      player => player.name.trim().toLowerCase() === firstName
    );

    if (squadPlayer && storedPlayer.name !== squadPlayer.name) {
      shortNameByStoredName.set(storedPlayer.name, squadPlayer.name);
    }
  });

  matchState.events.forEach(event => {
    shortNameByStoredName.forEach((shortName, storedName) => {
      if (event.playerName === storedName) {
        event.playerName = shortName;
      }

      if (event.rawText) {
        event.rawText = event.rawText.split(storedName).join(shortName);
      }
    });

    if (event.rawText) {
      event.text = rebuildEventText(event);
    }
  });

  // Reparer eldre målhendelser som ble lagret med manglende lagnavn.
  matchState.events.forEach(event => {
    if (event.type !== "goal") return;
    if (!String(event.rawText || event.text || "").includes("(undefined)")) return;

    const teamName = event.team === "home"
      ? matchState.meta.ourTeam
      : matchState.meta.opponent;

    event.rawText = `⚽ ${event.minute} – ${event.playerName} (${teamName})`;
    event.text = rebuildEventText(event);
  });

matchState.lineupConfirmed = data.lineupConfirmed ?? shouldApplyDefaultLineup;
matchState.liveSharingEnabled = data.liveSharingEnabled === true;
matchState.halftimeStartedAt = getRemoteTimestampMs(data.halftimeStartedAt);
matchState.firstHalfActualEndMs = Number.isFinite(data.firstHalfActualEndMs)
  ? data.firstHalfActualEndMs
  : null;

// Eldre kamper har ikke lagret når pausen startet.
if (
  ["HALFTIME", "PAUSED"].includes(data.status) &&
  !matchState.halftimeStartedAt
) {
  matchState.halftimeStartedAt = Date.now();
}

// Les status og lagret kamptid før spillerintervallene gjenopprettes.
matchState.period = Number(data.period) === 2 ? 2 : 1;
matchState.status = data.status || "NOT_STARTED";
matchState.timer.elapsedMs = Math.max(0, Number(data.timer?.elapsedMs) || 0);

  /* =========================
     PLAYERS (KJERNE)
  ========================= */

matchState.players.home = {};

// 1. lag alle spillere først
HOME_SQUAD.forEach(p => {
  matchState.players.home[p.id] = {
    id: p.id,
    name: p.name,
    present: shouldApplyDefaultLineup,
    starter: false,
    intervals: [],
    extraPlayingTimeMs: 0,
    cards: []
  };
});

// 2. legg inn Firestore-data oppå
if (data.players) {
  Object.entries(data.players).forEach(([id, p]) => {
    if (!p?.name) return;
    if (isStoredPreMatch && isRetiredPlayerName(p.name)) return;

    const firstName = p.name.split(" ")[0].trim().toLowerCase();

    const squadPlayer = HOME_SQUAD.find(
      s => s.name.trim().toLowerCase() === firstName
    );

    if (squadPlayer) {
      // Behold hele den lagrede spillerstatusen ved gjenoppretting.
      matchState.players.home[squadPlayer.id] = {
        ...matchState.players.home[squadPlayer.id],
        ...p,
        id: squadPlayer.id,
        name: squadPlayer.name,
        fullName: p.fullName || p.name,
        present: p.present === true,
        starter: p.starter === true,
        intervals: Array.isArray(p.intervals) ? p.intervals : [],
        cards: Array.isArray(p.cards) ? p.cards : []
      };
    } else {
      // Lånespillere må også få tilbake kort, intervaller og status.
      matchState.players.home[id] = {
        ...p,
        id,
        name: p.name,
        fullName: p.fullName || p.name,
        present: p.present === true,
        starter: p.starter === true,
        intervals: Array.isArray(p.intervals) ? p.intervals : [],
        cards: Array.isArray(p.cards) ? p.cards : []
      };
    }
  });
}

// Oppgrader eldre byttehendelser fra tekst til strukturerte data.
matchState.events.forEach(event => {
  if (event.type === "substitution") return;

  const rawText = event.rawText || "";
  const match = rawText.match(
    /^[^0-9]*(\d{1,3})(?:\s*\+\s*(\d{1,2}))?\s*[–-]\s*(.+?)\s+ut,\s*(.+?)\s+inn$/u
  );
  if (!match) return;

  const baseMinute = Number(match[1]);
  const overtimeMinute = Number(match[2] || 0);
  const outName = match[3].trim();
  const inName = match[4].trim();
  const players = Object.values(matchState.players.home);
  const outPlayer = players.find(player => player.name === outName);
  const inPlayer = players.find(player => player.name === inName);
  if (!outPlayer || !inPlayer) return;

  const sharedTimes = outPlayer.intervals
    .map(interval => interval.out)
    .filter(timeMs =>
      timeMs != null &&
      inPlayer.intervals.some(interval => interval.in === timeMs)
    );
  if (sharedTimes.length === 0) return;

  const approximateTimeMs = (baseMinute + overtimeMinute) * 60 * 1000;
  const timeMs = sharedTimes.reduce((closest, candidate) =>
    Math.abs(candidate - approximateTimeMs) < Math.abs(closest - approximateTimeMs)
      ? candidate
      : closest
  );
  if (Math.abs(timeMs - approximateTimeMs) > 60 * 1000) return;

  event.type = "substitution";
  event.outPlayerId = outPlayer.id;
  event.outPlayerName = outPlayer.name;
  event.inPlayerId = inPlayer.id;
  event.inPlayerName = inPlayer.name;
  event.period = baseMinute <= getHalfLengthMs() / 60000 ? 1 : 2;
  event.timeMs = timeMs;
  event.minute = overtimeMinute > 0
    ? `${baseMinute} + ${overtimeMinute}`
    : String(baseMinute);
});

const isPreMatch = ["NOT_STARTED", "UPCOMING"].includes(matchState.status);
const allLoadedPlayers = Object.values(matchState.players.home);
const lineupPlayerKeys = new Set(
  (effectiveLineup || []).map(player => getLineupPlayerKey(player.name))
);

matchState.squad.onField.home = [];

if (isPreMatch) {
  // Før kamp er lagoppstillingen alltid fasiten. Gamle eller delvis lagrede
  // starter-flagg skal aldri kunne gi 6, 7 eller et tilfeldig antall startere.
  allLoadedPlayers.forEach(player => {
    const isInLineup = lineupPlayerKeys.has(getLineupPlayerKey(player.name));
    player.starter = isInLineup;
    if (isInLineup) player.present = true;
  });

  matchState.squad.onField.home = allLoadedPlayers
    .filter(player => player.starter === true)
    .map(player => player.id);
  matchState.lineupConfirmed =
    matchState.squad.onField.home.length === MAX_STARTERS;
} else {
  // Under en pågående kamp er onField den faktiske banen etter bytter.
  const validStoredOnField = Array.isArray(data.onField)
    ? data.onField.filter(id => matchState.players.home[id]?.present === true)
    : [];

  if (validStoredOnField.length > 0) {
    matchState.squad.onField.home = validStoredOnField;
  } else if (data.squad?.starters?.length) {
    matchState.squad.onField.home = data.squad.starters
      .map(player => player.id)
      .filter(id => matchState.players.home[id]?.present === true);
  } else {
    matchState.squad.onField.home = allLoadedPlayers
      .filter(player => player.present === true && player.starter === true)
      .map(player => player.id);
  }
}

if (shouldApplyDefaultLineup) {
  try {
    await updateDoc(matchRef, {
      lineup: effectiveLineup,
      players: matchState.players.home,
      onField: matchState.squad.onField.home,
      lineupConfirmed: true,
      formation: "4-5-1",
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    // Oppstillingen er allerede klar lokalt. En midlertidig lagringsfeil skal
    // ikke hindre at kampregistreringen åpnes; neste lagring prøver igjen.
    console.error("Kunne ikke lagre standardoppstillingen:", error);
  }
} else if (isPreMatch) {
  try {
    const cleanedSquad = data.squad && typeof data.squad === "object"
      ? {
          ...data.squad,
          ...(Array.isArray(data.squad.present)
            ? { present: data.squad.present.filter(player => !isRetiredPlayerName(player?.name)) }
            : {}),
          ...(Array.isArray(data.squad.starters)
            ? { starters: data.squad.starters.filter(player => !isRetiredPlayerName(player?.name)) }
            : {})
        }
      : data.squad;

    await updateDoc(matchRef, {
      players: matchState.players.home,
      lineup: effectiveLineup,
      ...(cleanedSquad ? { squad: cleanedSquad } : {}),
      onField: matchState.squad.onField.home,
      lineupConfirmed: matchState.lineupConfirmed,
      updatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Kunne ikke reparere starterne fra lagoppstillingen:", error);
  }
}
  
// Bare en pågående omgang skal ha åpne spilleintervaller.
if (["LIVE", "TEMP_STOPPED"].includes(matchState.status)) {
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
}

  updateControls();

  /* =========================
     STATUS + TIMER
  ========================= */

if (matchState.status === "LIVE") {

if (data.timer?.startTimestamp) {
  const restoredStartTimestamp = getRemoteTimestampMs(data.timer.startTimestamp);
  matchState.timer.startTimestamp = Number.isFinite(restoredStartTimestamp)
    ? restoredStartTimestamp
    : Date.now();
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
const currentElapsed = getCurrentMatchTimeMs();

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

  if (["TEMP_STOPPED", "HALFTIME", "PAUSED"].includes(matchState.status)) {
    matchState.timer.startTimestamp = null;

    document.getElementById("game-clock").textContent =
      formatTime(matchState.timer.elapsedMs);

    periodIndicator.textContent = matchState.status === "TEMP_STOPPED"
      ? `${matchState.period}. omgang – klokken stoppet`
      : "Pause mellom omgangene";
  }



  /* =========================
     UI UPDATE
  ========================= */
sanitizePlayers();

syncUI();
teams.style.display = "flex";
populateGoalScorers("home");

if (["LIVE", "TEMP_STOPPED", "HALFTIME", "PAUSED"].includes(matchState.status)) {
  document.getElementById("matchUI")?.classList.remove("hidden");
}

setTimeout(() => {
  updatePlayingTimeUI();
}, 0);

setTimeout(() => {
  updatePlayingTimeUI();
}, 0);

// Kamper som ble startet før den faste Live-kanalen ble innført må også
// overta Live-visningen når de åpnes igjen på trenerens enhet.
if (["LIVE", "TEMP_STOPPED", "HALFTIME", "PAUSED"].includes(matchState.status)) {
  matchState.liveSharingEnabled = true;

  try {
    await updateDoc(matchRef, {
      liveSharingEnabled: true,
      updatedAt: serverTimestamp()
    });
    await savePublicLiveUpdate();
  } catch (error) {
    console.error("Kunne ikke koble den pågående kampen til Live-visningen:", error);
  }
}

subscribeToActiveMatch(matchRef);

document.addEventListener("DOMContentLoaded", () => {

  const startNewMatchBtn = document.getElementById("startNewMatchBtn");
  const activeMatchId = localStorage.getItem("activeMatchId");

  // 🔴 STOPP hvis kamp finnes
  if (activeMatchId) {
    return;
  }

  // 👉 START: vis KUN startknapp
  showOverviewReturnMode();
  preMatch.classList.add("hidden");
  teams.style.display = "none"; // 🔥 viktig

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
