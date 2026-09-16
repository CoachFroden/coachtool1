import { auth, db } from "./firebase-refleksjon.js";

import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";
import {
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const hint = document.getElementById("hint");
const backBtn = document.getElementById("backBtn");
const logoutBtn = document.getElementById("logoutBtn");

const dateEl = document.getElementById("date");
const timeEl = document.getElementById("time");
const oppEl = document.getElementById("opponent");
const typeEl = document.getElementById("type");
const venueEl = document.getElementById("venue");
const ourEl = document.getElementById("our");
const theirEl = document.getElementById("their");
const statusEl = document.getElementById("status");

const saveBtn = document.getElementById("saveBtn");
const deleteBtn = document.getElementById("deleteBtn");

const params = new URLSearchParams(window.location.search);
const source = params.get("source"); // "assistant" | "official"
const assistantUid = params.get("assistantUid");
const matchId = params.get("matchId");

let coachUid = null;
let matchRef = null;

logoutBtn.onclick = async () => {
  await signOut(auth);
  window.location.href = "index.html";
};

function ensureParams() {
  if (!matchId) return false;
  if (source === "assistant" && !assistantUid) return false;
  if (source !== "assistant" && source !== "official") return false;
  return true;
}

function getRef() {
  if (source === "official") {
    return doc(db, "matches", matchId);
  }
  return doc(db, "assistantMatches", assistantUid, "matches", matchId);
}

function setBackTarget() {
  backBtn.onclick = () => window.location.href = "assistant-kamper.html";
}

function fillForm(data) {
  const meta = data.meta || {};
  const score = data.score || {};

  dateEl.value = meta.date || "";
  timeEl.value = meta.startTime || "";
  oppEl.value = meta.opponent || "";
  typeEl.value = meta.type || "";
  venueEl.value = meta.venue || "";
  ourEl.value = typeof score.our === "number" ? score.our : "";
  theirEl.value = typeof score.their === "number" ? score.their : "";
  statusEl.value = data.status || "ENDED";

  hint.textContent = `Kilde: ${source === "official" ? "matches" : "assistantMatches"} • ID: ${matchId}`;
}

function readForm(existing) {
  const meta = { ...(existing.meta || {}) };

  meta.date = dateEl.value || "";
  meta.startTime = timeEl.value || "";
  meta.opponent = oppEl.value || "";
  meta.type = typeEl.value || "";
  meta.venue = venueEl.value || "";

  const score = { ...(existing.score || {}) };
  const our = ourEl.value === "" ? null : Number(ourEl.value);
  const their = theirEl.value === "" ? null : Number(theirEl.value);

  if (our !== null && Number.isFinite(our)) score.our = our;
  if (their !== null && Number.isFinite(their)) score.their = their;

  return {
    meta,
    score,
    status: statusEl.value || existing.status || "ENDED"
  };
}

async function ensureCoach(user) {
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) return false;
  return snap.data()?.role === "coach";
}

function stripClockPrefix(value) {
  return String(value || "")
    .replace(/^\d{1,2}:\d{2}\s*[–-]\s*/u, "")
    .trim();
}

function cleanEventDescription(value) {
  return stripClockPrefix(value)
    .replace(/^(?:⚽|🟨|🟥|🔁|🔄|📝)\s*/u, "")
    .replace(/^\d{1,3}(?:\s*\+\s*\d{1,2})?\s*[–-]\s*/u, "")
    .trim();
}

function normalizePublicEventType(event) {
  if (event.type === "yellow" || event.type === "red" || event.type === "card") return "card";
  if (event.type === "sub") return "substitution";
  if (event.type === "custom") return "text";
  return event.type || "text";
}

function minuteToNumber(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  const match = String(value || "").match(/^(\d{1,3})(?:\s*\+\s*(\d{1,2}))?$/);
  if (!match) return 0;
  return Number(match[1]) + Number(match[2] || 0);
}

function buildPublicEvents(data) {
  const halfLength = Number(data.meta?.halfLengthMin) || 35;

  return (data.events || []).map(event => {
    const type = normalizePublicEventType(event);
    const sourceText = event.rawText || stripClockPrefix(event.text || "");
    const minuteNumber = minuteToNumber(event.minute);
    const timeMs = Number.isFinite(Number(event.timeMs))
      ? Number(event.timeMs)
      : Math.max(0, minuteNumber - 1) * 60 * 1000;

    let playerName = event.playerName || "";
    if (!playerName && (type === "goal" || type === "card")) {
      playerName = cleanEventDescription(sourceText);
    }

    return {
      id: String(event.id || ""),
      type,
      team: event.team || "",
      playerName,
      minute: event.minute ?? "",
      period: Number(event.period) || (minuteNumber > halfLength ? 2 : 1),
      timeMs,
      rawText: sourceText,
      createdClock: event.createdClock || "",
      reportedAt: event.reportedAt || event.editedAt || "",
      edited: event.edited === true,
      cardType: event.cardType || (event.type === "red" ? "red" : event.type === "yellow" ? "yellow" : ""),
      outPlayerName: event.outPlayerName || "",
      inPlayerName: event.inPlayerName || ""
    };
  });
}

async function syncPublicMatch(data) {
  if (!matchId) return;

  const publicMatchRef = doc(db, "publicMatches", matchId);
  const featuredRef = doc(db, "publicMatches", "samnanger-g14-live");

  try {
    const [publicSnap, featuredSnap] = await Promise.all([
      getDoc(publicMatchRef),
      getDoc(featuredRef)
    ]);

    // Ikke publiser en kamp som aldri har vært delt offentlig.
    // Har kampen allerede en offentlig kopi, skal alle senere korreksjoner speiles dit.
    const shouldSyncPublic = publicSnap.exists() || data.liveSharingEnabled === true;
    if (!shouldSyncPublic) return;

    const publicData = {
      status: data.status || "ENDED",
      period: Number(data.period) || 1,
      score: {
        our: Number(data.score?.our) || 0,
        their: Number(data.score?.their) || 0
      },
      meta: {
        ourTeam: data.meta?.ourTeam || "Samnanger",
        opponent: data.meta?.opponent || "Motstander",
        date: data.meta?.date || "",
        startTime: data.meta?.startTime || "",
        venue: data.meta?.venue || data.meta?.venueType || "home",
        type: data.meta?.type || "league",
        halfLengthMin: Number(data.meta?.halfLengthMin) || 35
      },
      events: buildPublicEvents(data),
      updatedAt: serverTimestamp()
    };

    const writes = [setDoc(publicMatchRef, publicData, { merge: true })];

    if (featuredSnap.exists() && featuredSnap.data()?.sourceMatchId === matchId) {
      writes.push(setDoc(featuredRef, {
        ...publicData,
        sourceMatchId: matchId
      }, { merge: true }));
    }

    await Promise.all(writes);
  } catch (error) {
    console.error("Kunne ikke synkronisere korreksjonen til Live-visningen:", error);
  }
}

async function persistEvents(data) {
  const score = calculateScore(data.events || []);
  data.score = score;

  await updateDoc(matchRef, {
    events: data.events || [],
    score,
    updatedAt: serverTimestamp(),
    editedBy: coachUid
  });

  // Hvis en assistentkamp allerede er godkjent inn i hovedarkivet,
  // må korreksjonen følge samme vei videre.
  if (source === "assistant" && (data.approvedToMatches === true || data.approved === true)) {
    await setDoc(doc(db, "matches", matchId), {
      events: data.events || [],
      score,
      updatedAt: serverTimestamp(),
      lastEditedAt: serverTimestamp()
    }, { merge: true });
  }

  ourEl.value = score.our;
  theirEl.value = score.their;
  await syncPublicMatch(data);
}

async function loadMatch() {
  matchRef = getRef();

  const snap = await getDoc(matchRef);
  if (!snap.exists()) {
    hint.textContent = "Fant ikke kampen.";
    return;
  }

  const data = snap.data() || {};
  fillForm(data);
  renderEvents(data);

  saveBtn.onclick = async () => {
    const newData = readForm(data);

    if (source === "assistant") {
      const snap2 = await getDoc(matchRef);
      if (!snap2.exists()) return;

      const d = snap2.data() || {};

      await updateDoc(matchRef, {
        ...newData,
        approvedToMatches: true,
        approvedAt: serverTimestamp(),
        approvedBy: coachUid,
        updatedAt: serverTimestamp(),
        editedBy: coachUid
      });

      const officialData = {
        ...d,
        ...newData,
        status: "ENDED",
        approved: true,
        approvedToMatches: true,
        approvedFromAssistant: assistantUid
      };

      await setDoc(doc(db, "matches", matchId), {
        ...officialData,
        approvedAt: serverTimestamp(),
        approvedBy: auth.currentUser.uid,
        lastEditedAt: serverTimestamp()
      }, { merge: true });

      Object.assign(data, officialData);
      await syncPublicMatch(data);

      alert("Lagret og godkjent ✅");
      window.location.href = "assistant-kamper.html";
      return;
    }

    await updateDoc(matchRef, {
      ...newData,
      updatedAt: serverTimestamp(),
      editedBy: coachUid
    });

    Object.assign(data, newData);
    await syncPublicMatch(data);
    alert("Lagret ✅");
  };

  deleteBtn.onclick = async () => {
    const ok = confirm("Sikker på at du vil slette kampen?");
    if (!ok) return;

    await deleteDoc(matchRef);
    alert("Slettet.");
    window.location.href = "assistant-kamper.html";
  };
}

onAuthStateChanged(auth, async user => {
  if (!ensureParams()) {
    hint.textContent = "Mangler parametre i URL.";
    return;
  }

  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const ok = await ensureCoach(user);
  if (!ok) {
    alert("Kun coach har tilgang.");
    await signOut(auth);
    window.location.href = "index.html";
    return;
  }

  coachUid = user.uid;
  setBackTarget();
  await loadMatch();
});

function calculateScore(events) {
  let our = 0;
  let their = 0;

  events.forEach(event => {
    if (event.type === "goal") {
      if (event.team === "home") our++;
      if (event.team === "away") their++;
    }
  });

  return { our, their };
}

function renderEvents(data) {
  const toggleBtn = document.getElementById("toggleEventsBtn");
  const eventsSection = document.getElementById("eventsSection");
  const list = document.getElementById("eventsList");
  const events = data.events || [];

  if (toggleBtn && eventsSection) {
    const isHidden = eventsSection.classList.contains("hidden");
    toggleBtn.textContent = isHidden
      ? `Vis hendelser (${events.length})`
      : `Skjul hendelser (${events.length})`;
  }

  list.innerHTML = "";

  if (events.length === 0) {
    list.innerHTML = "<div>Ingen hendelser registrert.</div>";
  }

  events.forEach((event, index) => {
    const row = document.createElement("div");
    row.className = "eventRow";

    const textSpan = document.createElement("span");
    textSpan.textContent = event.text || event.rawText || "";

    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️";

    const eventDeleteBtn = document.createElement("button");
    eventDeleteBtn.textContent = "🗑";
    eventDeleteBtn.classList.add("eventDeleteBtn");

    editBtn.onclick = () => {
      const input = document.createElement("input");
      input.type = "text";
      input.value = event.text || event.rawText || "";

      const eventSaveBtn = document.createElement("button");
      eventSaveBtn.textContent = "✔";
      eventSaveBtn.classList.add("eventSaveBtn");

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "✖";
      cancelBtn.classList.add("eventCancelBtn");

      row.innerHTML = "";
      row.append(input, eventSaveBtn, cancelBtn);

      cancelBtn.onclick = () => renderEvents(data);

      eventSaveBtn.onclick = async () => {
        const newText = input.value.trim();
        if (!newText) return;

        event.text = newText;
        event.rawText = stripClockPrefix(newText);
        event.edited = true;
        event.editedAt = new Date().toISOString();

        const normalizedType = normalizePublicEventType(event);
        if (normalizedType === "goal" || normalizedType === "card") {
          event.playerName = cleanEventDescription(event.rawText);
        }

        await persistEvents(data);
        renderEvents(data);
      };
    };

    eventDeleteBtn.onclick = async () => {
      const ok = confirm("Slette hendelsen?");
      if (!ok) return;

      data.events.splice(index, 1);
      await persistEvents(data);
      renderEvents(data);
    };

    row.append(textSpan, editBtn, eventDeleteBtn);
    list.appendChild(row);
  });

  const addBtn = document.getElementById("addEventBtn");
  if (addBtn) {
    addBtn.onclick = () => {
      const row = document.createElement("div");
      row.className = "eventRow";

      const minuteInput = document.createElement("input");
      minuteInput.type = "number";
      minuteInput.placeholder = "Min";
      minuteInput.style.width = "60px";

      const typeSelect = document.createElement("select");
      typeSelect.innerHTML = `
        <option value="goal">⚽ Mål</option>
        <option value="yellow">🟨 Gult kort</option>
        <option value="red">🟥 Rødt kort</option>
        <option value="sub">🔁 Bytte</option>
        <option value="custom">📝 Annet</option>
      `;

      const teamSelect = document.createElement("select");
      teamSelect.innerHTML = `
        <option value="home">Vårt lag</option>
        <option value="away">Motstander</option>
      `;

      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Skriv hendelse...";

      const eventSaveBtn = document.createElement("button");
      eventSaveBtn.textContent = "✔";

      const cancelBtn = document.createElement("button");
      cancelBtn.textContent = "✖";

      row.append(minuteInput, typeSelect, teamSelect, input, eventSaveBtn, cancelBtn);
      list.prepend(row);

      cancelBtn.onclick = () => renderEvents(data);

      eventSaveBtn.onclick = async () => {
        const text = input.value.trim();
        const minute = Number(minuteInput.value);
        const type = typeSelect.value;
        const team = teamSelect.value;

        if (!text || !Number.isFinite(minute)) return;
        if (!data.events) data.events = [];

        const symbols = {
          goal: "⚽",
          yellow: "🟨",
          red: "🟥",
          sub: "🔁",
          custom: "📝"
        };

        const createdClock = new Date().toLocaleTimeString("no-NO", {
          hour: "2-digit",
          minute: "2-digit"
        });
        const rawText = `${symbols[type]} ${minute} – ${text}`;
        const halfLength = Number(data.meta?.halfLengthMin) || 35;

        const newEvent = {
          id: `manual-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          minute,
          type,
          team,
          text: `${createdClock} – ${rawText}`,
          rawText,
          createdClock,
          reportedAt: new Date().toISOString(),
          timeMs: Math.max(0, minute - 1) * 60 * 1000,
          period: minute > halfLength ? 2 : 1,
          edited: false,
          playerName: type === "goal" || type === "yellow" || type === "red" ? text : "",
          cardType: type === "red" ? "red" : type === "yellow" ? "yellow" : ""
        };

        data.events.push(newEvent);
        data.events.sort((a, b) => minuteToNumber(a.minute ?? 999) - minuteToNumber(b.minute ?? 999));

        await persistEvents(data);
        renderEvents(data);
      };
    };
  }
}

const toggleBtn = document.getElementById("toggleEventsBtn");
const eventsSection = document.getElementById("eventsSection");

if (toggleBtn && eventsSection) {
  toggleBtn.onclick = () => {
    eventsSection.classList.toggle("hidden");
    const count = document.querySelectorAll("#eventsList .eventRow").length;
    toggleBtn.textContent = eventsSection.classList.contains("hidden")
      ? `Vis hendelser (${count})`
      : `Skjul hendelser (${count})`;
  };
}
