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

function getWeekNumber() {

  const date = new Date();
  const firstJan = new Date(date.getFullYear(),0,1);

  const days = Math.floor((date - firstJan) / (24*60*60*1000));

  return Math.ceil((date.getDay()+1+days)/7);

}

const currentWeek = getWeekNumber();

const weekSelect = document.getElementById("weekSelect");

if(weekSelect){

  const firstOption = document.createElement("option");
  firstOption.text = "Velg uke";
  firstOption.value = "";
  weekSelect.appendChild(firstOption);

  for(let i = 0; i < 8; i++){

    const option = document.createElement("option");

    let weekNumber = currentWeek + i;

    if(i === 0){
      option.text = "Denne uken";
    }
    else if(i === 1){
      option.text = "Neste uke";
    }
    else{
      option.text = "Uke " + weekNumber;
    }

    option.value = "week" + weekNumber;

    weekSelect.appendChild(option);

  }

}

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

const swReg = await navigator.serviceWorker.register("./firebase-messaging-sw.js");
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

if (!header || !statusText) return;

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
	  alert("Notification permission: " + Notification.permission);
    };
  }
}

updateHeaderStatus();

}); // ✅ VIKTIG: lukker onAuthStateChanged

window.saveExercises = async function(){

  const focus = document.getElementById("focusInput").value;

  const weekChoice = document.getElementById("weekSelect").value;
  const weekNumber = weekChoice.replace("week","");

  const titles = document.querySelectorAll(".exerciseTitle");
  const videos = document.querySelectorAll(".exerciseVideo");

  const exercises = [];

  titles.forEach((title,i)=>{

    if(title.value !== ""){

      exercises.push({
        title: title.value,
        video: "ovelser/" + videos[i].value
      });

    }

  });

  await setDoc(doc(db, "weeklyExercises", "week"+weekNumber), {

    focus: focus,
    exercises: exercises

  });

  alert("Ukens øvelser lagret!");

}

window.addExercise = function(){

  const container = document.getElementById("exerciseContainer");

  const div = document.createElement("div");

  div.className = "exercise-row";

  div.innerHTML = `
    <input placeholder="Tittel på øvelse" class="exerciseTitle">

    <select class="exerciseVideo">
      <option value="kantlop-innlegg.mp4">Kantløp innlegg</option>
      <option value="kantoverlapp.mp4">Kantoverlapp</option>
    </select>
  `;

  container.appendChild(div);

}

window.removeExercise = function () {

  const container = document.getElementById("exerciseContainer");

  if (container.children.length > 0) {
    container.removeChild(container.lastElementChild);
  }

};

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