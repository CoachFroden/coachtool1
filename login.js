import { auth, db } from "./firebase-refleksjon.js";

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signOut
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
const resendVerifyBtn = document.getElementById("resendVerifyBtn");

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

function routeByRole(role) {
  // Tilpass filnavnene om du bruker andre
  if (role === "coach") {
    window.location.href = "fremside.html";
  } else if (role === "assistantCoach") {
    window.location.href = "oversikt.html";
  } else {
    // hvis noen logger inn som player via denne siden, stopp
    setError("Denne innloggingen er kun for trenerteam.");
  }
}

// REGISTRER (alltid assistantCoach)
registerBtn.onclick = async () => {
  setError("");
  resendVerifyBtn.style.display = "none";

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

  setInfo("Registrert! Sjekk e-post og trykk på verifiseringslinken før du logger inn.");
  await signOut(auth);

} catch (err) {
  console.log(err);
  setError(err.message);
}
};

// LOGIN
loginBtn.onclick = async () => {
  setError("");
  resendVerifyBtn.style.display = "none";

  const email = emailInput.value.trim();
  const pass = passwordInput.value.trim();

  if (!email || !pass) return setError("Fyll inn e-post og passord.");

  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
	
	

    // Hent rolle fra Firestore først
    const snap = await getDoc(doc(db, "users", cred.user.uid));
    if (!snap.exists()) {
      await signOut(auth);
      return setError("Brukerprofil mangler i Firestore (users).");
    }

    const data = snap.data();
	
await setDoc(doc(collection(db, "loginLogs")), {
  uid: cred.user.uid,
  email: cred.user.email,
  role: data.role,
  timestamp: serverTimestamp()
});

    // Krev e-postverifisering for assistenter (og evt andre), men IKKE for coach
    if (data.role !== "coach" && !cred.user.emailVerified) {
      setError("E-posten er ikke verifisert. Sjekk innboksen og trykk på verifiseringslinken.");
      resendVerifyBtn.style.display = "inline-block";
      return; // ikke redirect
    }

    routeByRole(data.role);

  } catch (err) {
    setError("Feil e-post eller passord.");
  }
};

// Send verifiseringsmail på nytt (krever at brukeren er logget inn i auth)
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