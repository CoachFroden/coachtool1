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

  const playerId = document.getElementById("playerSelect").value;
  const textarea = document.getElementById("feedbackText");

  textarea.value = "";
  currentFeedbackDocId = null;

  if (!playerId) return;

  const q = query(
    collection(db, "feedback"),
    where("playerId", "==", playerId),
    orderBy("createdAt", "desc")
  );

  const snap = await getDocs(q);

  if (snap.empty) {
    textarea.placeholder = "Ingen tidligere tilbakemeldinger.";
    return;
  }

  // Hent siste feedback automatisk
  const latest = snap.docs[0];
  const data = latest.data();

  textarea.value = data.editedText || data.feedbackText || "";
  currentFeedbackDocId = latest.id;
}

/* ==============================
   Generer tilbakemelding
============================== */

const generateBtn = document.getElementById("generateBtn");

generateBtn.addEventListener("click", async () => {

  const playerId = document.getElementById("playerSelect").value;
  const type = document.getElementById("feedbackType").value;


  if (!playerId) {
    alert("Velg en spiller først.");
    return;
  }

  try {
    generateBtn.disabled = true;
    generateBtn.textContent = "Genererer...";

    const generateFeedback = httpsCallable(functions, "generatePlayerFeedback");

    const result = await generateFeedback({ playerId, type });
	
	const textarea = document.querySelector("textarea");
textarea.value = result.data.feedback;

    console.log("Feedback generert:", result.data.feedbackId);
	currentFeedbackDocId = result.data.feedbackId;

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

