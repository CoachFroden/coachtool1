import { auth, db } from "./firebase-refleksjon.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  getDoc,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { httpsCallable } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js";
import { functions } from "./firebase-refleksjon.js";

let currentFeedbackDocId = null;

const reflectionSelect = document.getElementById("reflectionSelect");

/* ==============================
   Auth – kun coach
============================== */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "../login.html";
    return;
  }

  const snap = await getDoc(doc(db, "users", user.uid));

  if (!snap.exists() || snap.data().role !== "coach") {
    alert("Kun trener har tilgang.");
    window.location.href = "./fremside.html";
    return;
  }

  initUI();
});

/* ==============================
   Init UI
============================== */

async function initUI() {
  await loadPlayers();
}

document.getElementById("playerSelect")
  .addEventListener("change", loadPreviousFeedback);

/* ==============================
   Last spillere
============================== */

async function loadPlayers() {
  const select = document.getElementById("playerSelect");

  select.innerHTML = `<option value="">Velg spiller</option>`;

  const playersSnap = await getDocs(collection(db, "users"));

  const players = playersSnap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => u.role === "player" && u.approved === true);

  players.forEach(p => {
    const option = document.createElement("option");
    option.value = p.uid;
    option.textContent = p.name || p.email;
    select.appendChild(option);
  });
}

async function loadPreviousFeedback() {
	
reflectionSelect.innerHTML = `<option value="">Velg refleksjon</option>`;

  const playerId = document.getElementById("playerSelect").value;
  const textarea = document.getElementById("feedbackText");

  textarea.value = "";
  currentFeedbackDocId = null;

  if (!playerId) return;
  
  // hent refleksjoner
const reflectionsSnap = await getDocs(
  collection(db, "refleksjoner", playerId, "entries")
);

const feedbackSnap = await getDocs(
  query(
    collection(db, "feedback"),
    where("playerId", "==", playerId)
  )
);

const feedbackReflectionIds = new Set(
  feedbackSnap.docs.map(d => d.data().reflectionId)
);

const reflections = reflectionsSnap.docs
  .map(d => ({ id: d.id, ...d.data() }))
  .sort((a, b) => {

    if (a.year !== b.year) return b.year - a.year;
    return b.week - a.week;

  });

let currentWeek = null;

const dayMap = {
  Mon: "Mandag",
  Tue: "Tirsdag",
  Wed: "Onsdag",
  Thu: "Torsdag",
  Fri: "Fredag",
  Sat: "Lørdag",
  Sun: "Søndag"
};

for (const data of reflections) {
	
let statusIcon = "⚪";

const feedbackDoc = feedbackSnap.docs.find(d => {
  return d.data().reflectionId === data.id;
});

if (feedbackDoc) {

  const status = feedbackDoc.data().status;

  if (status === "sent") {
    statusIcon = "🟢";
  } else {
    statusIcon = "🟡";
  }

}

  if (currentWeek !== data.week) {

    const weekHeader = document.createElement("option");
    weekHeader.textContent = `— Uke ${data.week} —`;
    weekHeader.disabled = true;

    reflectionSelect.appendChild(weekHeader);

    currentWeek = data.week;
  }

  const option = document.createElement("option");

  const typeIcon = data.type === "match" ? "🏆 Kamp" : "🔵 ⚽ Trening";

  option.value = data.id;

const dayText = dayMap[data.day] || data.day;
const typeText = data.type === "match" ? "Kamp" : "Trening";

option.textContent =
  `${statusIcon} ${typeText} – ${dayText}`;

  reflectionSelect.appendChild(option);

}
}
/* ==============================
   Generer tilbakemelding
============================== */

const generateBtn = document.getElementById("generateBtn");

reflectionSelect.addEventListener("change", async () => {

  const feedbackType = document.getElementById("feedbackType");

  if (reflectionSelect.value) {
	  
	  const preview = document.getElementById("reflectionPreview");

const reflectionDoc = await getDoc(
  doc(
    db,
    "refleksjoner",
    document.getElementById("playerSelect").value,
    "entries",
    reflectionSelect.value
  )
);


const reflectionData = reflectionDoc.data();

let feedbackQuery = query(
  collection(db, "feedback"),
  where("playerId", "==", document.getElementById("playerSelect").value),
  where("reflectionId", "==", reflectionSelect.value)
);

let feedbackSnap = await getDocs(feedbackQuery);

// fallback for gamle feedbacks
if (feedbackSnap.empty) {

  feedbackQuery = query(
    collection(db, "feedback"),
    where("playerId", "==", document.getElementById("playerSelect").value),
    where("week", "==", reflectionData.week),
    where("type", "==", reflectionData.type)
  );

  feedbackSnap = await getDocs(feedbackQuery);

}

if (!feedbackSnap.empty) {

  const data = feedbackSnap.docs[0].data();

  textarea.value = data.editedText || data.feedbackText || "";

  currentFeedbackDocId = feedbackSnap.docs[0].id;

} else {

  textarea.value = "";
  currentFeedbackDocId = null;

}

if (reflectionDoc.exists()) {

  const data = reflectionDoc.data();

const dayMap = {
  Mon: "Mandag",
  Tue: "Tirsdag",
  Wed: "Onsdag",
  Thu: "Torsdag",
  Fri: "Fredag",
  Sat: "Lørdag",
  Sun: "Søndag"
};

const dayText = dayMap[data.day] || data.day;

preview.innerHTML = `
<strong class="preview-title">
${data.type === "match" ? "🏆 Kamp" : "⚽ Trening"} – ${dayText} (uke ${data.week})
</strong>

<div class="preview-meta">
Energi: ${data.energy || "-"} | Innsats: ${data.effort || "-"}
</div>

<div class="preview-section">
<span>Fornøyd med</span>
${data.goodThing || "-"}
</div>

<div class="preview-section">
<span>Neste uke</span>
${data.improveThing || "-"}
</div>

<div class="preview-section">
<span>Til trener</span>
${data.coachNote || "-"}
</div>
`;
}

    generateBtn.disabled = false;

    // refleksjon = ukentlig
    feedbackType.value = "weekly";

  } else {

    generateBtn.disabled = true;

  }

});

generateBtn.addEventListener("click", async () => {

  const playerId = document.getElementById("playerSelect").value;
  const type = document.getElementById("feedbackType").value;
  const reflectionId = document.getElementById("reflectionSelect").value;
  console.log("TYPE VALGT:", type);


  if (!playerId) {
    alert("Velg en spiller først.");
    return;
  }

  try {
    generateBtn.disabled = true;
    generateBtn.textContent = "Genererer...";

let result;
const selectedReflectionId = reflectionId;

if (type === "weekly") {

  const fn = httpsCallable(functions, "generatePlayerFeedback");
  result = await fn({ playerId, reflectionId, type: "weekly" });

}

if (type === "monthly") {

  const fn = httpsCallable(functions, "generateMonthlyFeedback");

  const now = new Date();

  result = await fn({
    playerId,
    year: now.getFullYear(),
    month: now.getMonth() + 1
  });

}

if (type === "season") {

  const fn = httpsCallable(functions, "generateSeasonFeedback");

  const now = new Date();

  result = await fn({
    playerId,
    year: now.getFullYear(),
    season: "spring"
  });

}
	
	const textarea = document.getElementById("feedbackText");
textarea.value = result.data.feedback;

    console.log("Feedback generert:", result.data.feedbackId);
	currentFeedbackDocId = result.data.feedbackId;
	await updateDoc(
  doc(db, "feedback", currentFeedbackDocId),
  { reflectionId: selectedReflectionId }
);

await updateDoc(
  doc(
    db,
    "refleksjoner",
    playerId,
    "entries",
    selectedReflectionId
  ),
  { feedbackId: currentFeedbackDocId }
);

    alert("AI-tilbakemelding generert.");

  } catch (err) {
    console.error(err);
    alert("Feil ved generering av tilbakemelding.");
  } finally {
    generateBtn.disabled = false;
    generateBtn.textContent = "Generer AI-tilbakemelding";
  }

});

const textarea = document.getElementById("feedbackText");

if (textarea) {
  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const backBtn = document.getElementById("backBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      // Gå tilbake til coach-siden (samme mappe)
      window.location.href = "fremside.html";
    });
  }
});

/* ==============================
   Lagre / Send (Firestore)
============================== */

const saveBtn = document.getElementById("saveBtn");
const sendBtn = document.getElementById("sendBtn");

async function updateFeedbackStatus({ markAsSent }) {

  if (!currentFeedbackDocId) {
    alert("Ingen tilbakemelding funnet. Generer først.");
    return;
  }

  const text = document.getElementById("feedbackText").value.trim();

  if (!text) {
    alert("Tekstfeltet er tomt.");
    return;
  }

  const docRef = doc(db, "feedback", currentFeedbackDocId);

  await updateDoc(docRef, {
    editedText: text,
    status: markAsSent ? "sent" : "draft",
    updatedAt: serverTimestamp()
  });
}

if (saveBtn) {
  saveBtn.addEventListener("click", async () => {
    try {
      saveBtn.disabled = true;
      await updateFeedbackStatus({ markAsSent: false });
      alert("Lagret.");
    } catch (err) {
      console.error("Feil ved lagring:", err);
      alert("Feil ved lagring.");
    } finally {
      saveBtn.disabled = false;
    }
  });
}

if (sendBtn) {
  sendBtn.addEventListener("click", async () => {
    try {
      sendBtn.disabled = true;
      await updateFeedbackStatus({ markAsSent: true });
      alert("Markert som sendt.");
    } catch (err) {
      console.error("Feil ved sending:", err);
      alert("Feil ved sending.");
    } finally {
      sendBtn.disabled = false;
    }
  });
}

