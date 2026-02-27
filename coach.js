import { auth, db } from "./firebase-refleksjon.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import {
  getMessaging,
  getToken
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-messaging.js";

/* ==============================
   Navigasjon
============================== */
function go(page) {
  window.location.href = page;
}
window.go = go;

/* ==============================
   Push (kun coach)
============================== */
const VAPID_KEY = "BMliWkFTxc-mlxFygGosVuvYirsguGa-lpUiYUhWwpkmwkP_bJXFZRtpUetZ3NSa4YY7sig2ikaVoTTtlTg0x8o";

async function setupCoachPush(user) {
  try {
    if (!("serviceWorker" in navigator)) return;

const swReg = await navigator.serviceWorker.getRegistration("/coachtool/")
  || await navigator.serviceWorker.register("/coachtool4/firebase-messaging-sw.js");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;

    const messaging = getMessaging();
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swReg
    });

    if (!token) return;

    await setDoc(doc(db, "adminTokens", user.uid), {
      token,
      platform: "web",
      updatedAt: serverTimestamp()
    }, { merge: true });

    console.log("✅ Push aktivert og token lagret");
  } catch (err) {
    console.error("Push-feil:", err);
  }
}

/* ==============================
   Auth-sjekk (kun coach)
============================== */
onAuthStateChanged(auth, async (user) => {
  if (!user) {
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
    return;
  }
  
  // ==============================
  // Push-status i overskrift
  // ==============================
const header = document.getElementById("coachHeader");
const statusText = document.getElementById("pushStatusText");

function setHeaderColor(color) {
  header.style.setProperty("color", color, "important");
}

function updateHeaderStatus() {
  const permission = Notification.permission;

  if (permission === "granted") {
    header.textContent = "Coach Dashboard";
    setHeaderColor("#2ecc71");
    statusText.textContent = "Varsler aktivert";
    header.style.cursor = "default";
    header.onclick = null;
  }

  else if (permission === "denied") {
    header.textContent = "Coach Dashboard";
    setHeaderColor("#e74c3c");
    statusText.textContent = "Varsler blokkert i nettleserinnstillinger";
    header.style.cursor = "default";
    header.onclick = null;
  }

  else {
    header.textContent = "Coach Dashboard";
    setHeaderColor("#e74c3c");
    statusText.textContent = "Klikk her for å aktivere varsler";
    header.style.cursor = "pointer";

    header.onclick = async () => {
      await setupCoachPush(user);
      updateHeaderStatus();
    };
  }
}

updateHeaderStatus();

}); // ✅ VIKTIG: lukker onAuthStateChanged

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