import { auth, db } from "./firebase-refleksjon.js";

import {
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  getFunctions,
  httpsCallable
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js";

const list = document.getElementById("playerList");
const searchInput = document.getElementById("search");

const passwordBox = document.getElementById("passwordBox");
const passwordText = document.getElementById("passwordText");
const copyBtn = document.getElementById("copyBtn");

const functions = getFunctions();
const resetPassword = httpsCallable(functions, "resetPlayerPassword");

let players = [];

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "index.html";
    return;
  }

  const snap = await getDocs(collection(db, "users"));

  let isCoach = false;

  snap.forEach(doc => {
    if (doc.id === user.uid && doc.data().role === "coach") {
      isCoach = true;
    }
  });

  if (!isCoach) {
    alert("Kun trener har tilgang.");
    window.location.href = "index.html";
    return;
  }

  players = snap.docs
    .map(doc => ({ id: doc.id, ...doc.data() }))
    .filter(p => p.role === "player");
players.sort((a, b) => a.name.localeCompare(b.name));
  render(players);
});

function render(listData) {
  list.innerHTML = "";

  listData.forEach(player => {
    const row = document.createElement("div");
    row.className = "player";

    const name = document.createElement("span");
    name.textContent = player.name;

    const btn = document.createElement("button");
    btn.textContent = "Reset";

    btn.onclick = async () => {
		if (!confirm(`Reset passord for ${player.name}?`)) return;
      const res = await resetPassword({ uid: player.id });

      passwordText.textContent = `${player.name}: ${res.data.tempPassword}`;
      passwordBox.style.display = "block";
    };

    row.appendChild(name);
    row.appendChild(btn);

    list.appendChild(row);
  });
}

// 🔍 Søk
searchInput.addEventListener("input", () => {
  const value = searchInput.value.toLowerCase();

  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(value)
  );

  render(filtered);
});

// 📋 Kopier
copyBtn.onclick = () => {
  navigator.clipboard.writeText(passwordText.textContent);
};