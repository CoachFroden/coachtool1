import { auth, db } from "./firebase-refleksjon.js";

import {
  signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginBtn = document.getElementById("loginBtn");
const errorMsg = document.getElementById("errorMsg");

loginBtn.onclick = async () => {
  errorMsg.textContent = "";

  const email = emailInput.value.trim();
  const password = passwordInput.value.trim();

  if (!email || !password) {
    errorMsg.textContent = "Fyll inn e-post og passord.";
    return;
  }

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    const user = cred.user;

    const snap = await getDoc(doc(db, "users", user.uid));

    if (!snap.exists()) {
      await auth.signOut();
      errorMsg.textContent = "Bruker finnes ikke i systemet.";
      return;
    }

    const data = snap.data();

    if (data.role !== "coach") {
      await auth.signOut();
      errorMsg.textContent = "Kun trener har tilgang.";
      return;
    }

    // OK → Coach
    window.location.href = "fremside.html";

  } catch (err) {
    errorMsg.textContent = "Feil e-post eller passord.";
  }
};
