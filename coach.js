import { auth, db } from "./firebase-refleksjon.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

/* ==============================
   Navigasjon
============================== */

function go(page) {
  window.location.href = page;
}

window.go = go;

/* ==============================
   Auth-sjekk (kun coach)
============================== */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // Ikke logget inn
    window.location.href = "./fremside.html";
    return;
  }

  const snap = await getDoc(doc(db, "users", user.uid));

  if (!snap.exists()) {
    window.location.href = "./fremside.html";
    return;
  }

  const data = snap.data();

  if (data.role !== "coach") {
    alert("Kun trener har tilgang.");
    window.location.href = "./fremside.html";
  }
});

/* ==============================
   Logout
============================== */

const logoutBtn = document.getElementById("logoutBtn");

if (logoutBtn) {
  logoutBtn.onclick = async () => {
    await signOut(auth);
    window.location.href = "./index.html";
  };
}
