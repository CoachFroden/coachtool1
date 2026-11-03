import { auth, db } from "./firebase-refleksjon.js";

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
  collection
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const password2Input = document.getElementById("password2");

const loginBtn = document.getElementById("loginBtn");
const registerBtn = document.getElementById("registerBtn");
const backToLoginBtn = document.getElementById("backToLoginBtn");
const resendVerifyBtn = document.getElementById("resendVerifyBtn");
const authSubtitle = document.getElementById("authSubtitle");

const errorMsg = document.getElementById("errorMsg");
const infoMsg = document.getElementById("infoMsg");

function setError(msg) {
  errorMsg.textContent = msg || "";
  infoMsg.textContent = "";
}
function setInfo(msg) {
  infoMsg.textContent = msg || "";
  errorMsg.textContent = "";
}

let isRegisterMode = false;
let manualLoginInProgress = false;

function setAuthMode(mode) {
  isRegisterMode = mode === "register";
  password2Input.hidden = !isRegisterMode;
  loginBtn.hidden = isRegisterMode;
  backToLoginBtn.hidden = !isRegisterMode;

  registerBtn.textContent = isRegisterMode
    ? "Registrer bruker"
    : "Opprett ny bruker";
  registerBtn.classList.toggle("logout-btn", isRegisterMode);
  registerBtn.classList.toggle("primary-action", isRegisterMode);
  registerBtn.classList.toggle("auth-mode-btn", !isRegisterMode);

  passwordInput.autocomplete = isRegisterMode
    ? "new-password"
    : "current-password";
  authSubtitle.textContent = isRegisterMode
    ? "Opprett en bruker for trenerteamet"
    : "Logg inn for å fortsette";

  if (!isRegisterMode) password2Input.value = "";
  setError("");
}

function routeByRole(role) {
  if (role === "coach") {
    window.location.href = "fremside.html";
  } else if (role === "assistantCoach") {
    window.location.href = "oversikt.html";
  } else {
    setError("Denne innloggingen er kun for trenerteam.");
  }
}

// Hvis treneren allerede er innlogget når appen åpnes,
// gå til riktig startside for rollen i stedet for å vise innloggingssiden igjen.
onAuthStateChanged(auth, async (user) => {
  if (!user || manualLoginInProgress || isRegisterMode) return;

  try {
    const snap = await getDoc(doc(db, "users", user.uid));
    if (!snap.exists()) return;

    const role = snap.data()?.role;
    if (role === "coach" || role === "assistantCoach") {
      routeByRole(role);
    }
  } catch (err) {
    console.warn("Kunne ikke auto-rute innlogget bruker", err);
  }
});

// REGISTRER (alltid assistantCoach)
registerBtn.onclick = async () => {
  if (!isRegisterMode) {
    setAuthMode("register");
    password2Input.focus();
    return;
  }

  setError("");
  resendVerifyBtn.hidden = true;

  const email = emailInput.value.trim();
  const pass = passwordInput.value.trim();
  const pass2 = password2Input.value.trim();

  if (!email || !pass || !pass2) return setError("Fyll inn e-post og begge passordfeltene.");
  if (pass !== pass2) return setError("Passordene er ikke like.");
  if (pass.length < 6) return setError("Passord må være minst 6 tegn.");

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);

    await sendEmailVerification(cred.user);

    await setDoc(doc(db, "users", cred.user.uid), {
      email,
      role: "assistantCoach",
      approved: false,
      createdAt: serverTimestamp()
    });

    await signOut(auth);
    passwordInput.value = "";
    setAuthMode("login");
    setInfo("Registrert! Sjekk e-post og trykk på verifiseringslinken før du logger inn.");
  } catch (err) {
    console.log(err);
    setError(err.message);
  }
};

// LOGIN
loginBtn.onclick = async () => {
  setError("");
  resendVerifyBtn.hidden = true;

  const email = emailInput.value.trim();
  const pass = passwordInput.value.trim();

  if (!email || !pass) return setError("Fyll inn e-post og passord.");

  manualLoginInProgress = true;

  try {
    await setPersistence(auth, browserLocalPersistence);
    const cred = await signInWithEmailAndPassword(auth, email, pass);

    const snap = await getDoc(doc(db, "users", cred.user.uid));
    if (!snap.exists()) {
      await signOut(auth);
      manualLoginInProgress = false;
      return setError("Brukerprofil mangler i Firestore (users).");
    }

    const data = snap.data();

    await setDoc(doc(collection(db, "loginLogs")), {
      uid: cred.user.uid,
      email: cred.user.email,
      role: data.role,
      timestamp: serverTimestamp()
    });

    if (data.role !== "coach" && !cred.user.emailVerified) {
      manualLoginInProgress = false;
      setError("E-posten er ikke verifisert. Sjekk innboksen og trykk på verifiseringslinken.");
      resendVerifyBtn.hidden = false;
      return;
    }

    console.info("[Auth] Innlogging godkjent", { uid: cred.user.uid, role: data.role });
    routeByRole(data.role);
  } catch (err) {
    manualLoginInProgress = false;
    console.error("[Auth] Innlogging feilet:", err.code, err);
    setError(["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found"].includes(err.code) ? "Feil e-post eller passord." : `Innloggingen feilet (${err.code || "ukjent feil"}). Prøv igjen.`);
  }
};

resendVerifyBtn.onclick = async () => {
  setError("");
  try {
    if (!auth.currentUser) {
      return setError("Logg inn først, så kan vi sende verifiseringsmail på nytt.");
    }
    await sendEmailVerification(auth.currentUser);
    setInfo("Verifiseringsmail sendt på nytt. Sjekk e-post.");
  } catch (err) {
    setError("Kunne ikke sende verifiseringsmail på nytt.");
  }
};

[emailInput, passwordInput, password2Input].forEach(input => {
  input.addEventListener("keydown", event => {
    if (event.key !== "Enter") return;
    if (isRegisterMode) {
      registerBtn.click();
    } else {
      loginBtn.click();
    }
  });
});

backToLoginBtn.onclick = () => {
  setAuthMode("login");
};
