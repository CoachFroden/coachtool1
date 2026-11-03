import { auth, db } from "./firebase-refleksjon.js";

import {
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  doc,
  getDoc,
  collection,
  getDocs
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const userLine = document.getElementById("userLine");
const logoutBtn = document.getElementById("logoutBtn");
const openOverviewBtn = document.getElementById("openOverviewBtn");
const adminToggle = document.getElementById("adminToggle");
const adminPanel = document.getElementById("adminPanel");

openOverviewBtn?.addEventListener("click", () => {
  window.location.href = "oversikt.html";
});

adminToggle?.addEventListener("click", () => {
  const open = adminPanel?.classList.toggle("isOpen");
  adminToggle.setAttribute("aria-expanded", String(Boolean(open)));
});

logoutBtn?.addEventListener("click", async () => {
  await signOut(auth);
  window.location.href = "index.html";
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    console.warn("[Auth:dashboard-home] Ingen innlogget Firebase-bruker; sender til innlogging.");
    window.location.href = "index.html";
    return;
  }

  let snap;
  try { snap = await getDoc(doc(db, "users", user.uid)); }
  catch (error) { console.error("[Auth:fremside] Kunne ikke lese brukerprofil", error); if (userLine) userLine.textContent = "Kunne ikke kontrollere tilgangen. Last siden på nytt."; return; }
  if (!snap.exists() || snap.data()?.role !== "coach") {
    console.error("[Auth:fremside] Manglende/ugyldig coach-rolle", { uid: user.uid, profileExists: snap.exists(), role: snap.data()?.role });
    if (userLine) userLine.textContent = "Ingen tilgang: trenerrolle mangler. Kontakt administrator.";
    return;
  }

  if (userLine) userLine.textContent = user.email || "Innlogget trener";
  try {
    const [accountSnap, requestSnap, messageSnap] = await Promise.all([
      getDocs(collection(db,"playerAccounts")),
      getDocs(collection(db,"developmentRequests")),
      getDocs(collection(db,"developmentMessages"))
    ]);
    const pending=accountSnap.docs.filter(d=>!d.data().approved);
    const open=requestSnap.docs.filter(d=>d.data().status==="open");
    const playerReplies=messageSnap.docs.filter(d=>d.data().senderRole==="player");
    const seenKey="coachPortalSeenPlayerMessages";
    let seen={};try{seen=JSON.parse(localStorage.getItem(seenKey)||"{}")}catch{}
    const newReplies=playerReplies.filter(d=>{const x=d.data(),stamp=x.createdAt?.seconds||0;return stamp>(seen[d.id]||0)});
    const total=pending.length+open.length+newReplies.length;
    const alert=document.getElementById("playerAlert"),badge=document.getElementById("portalBadge");
    alert.hidden=true;badge.hidden=true;badge.textContent="0";
    if(total>0){
      const parts=[];if(newReplies.length)parts.push(newReplies.length+" nye svar fra spillere");if(open.length)parts.push(open.length+" aktive forespørsler");if(pending.length)parts.push(pending.length+" kontoer venter");
      document.getElementById("playerAlertText").textContent=parts.join(" · ");
      alert.hidden=false;badge.textContent=String(total);badge.hidden=false;
    }
    document.querySelectorAll('a[href="spillerbrukere.html"]').forEach(a=>a.addEventListener("click",()=>{const next={...seen};playerReplies.forEach(d=>next[d.id]=d.data().createdAt?.seconds||Date.now()/1000);localStorage.setItem(seenKey,JSON.stringify(next))}));
  } catch(err){ console.error("Spillerportal-varsel:",err); }
});
