console.log("Refleksjon JS lastet");


import { auth, db } from "./firebase-refleksjon.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";


/* =====================================================
   AUTH – KUN COACH
===================================================== */

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

  // Når coach er bekreftet → start UI
  initCoachRefleksjonUI();
});

/* =====================================================
   HENT DATA
===================================================== */

async function fetchUsers() {
  const snap = await getDocs(collection(db, "users"));

  return snap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => u.role === "player" && u.approved === true);
}

async function fetchRefleksjoner(playerId) {
  const snap = await getDocs(
    collection(db, "refleksjoner", playerId, "entries")
  );

  return snap.docs.map(d => ({
    id: d.id,
    ...d.data()
  }));
}


/* =========================
   ULeste refleksjoner
========================= */

async function countUnreadReflections(){

  const users = await fetchUsers();
  let unread = 0;

  for(const u of users){

    const snap = await getDocs(
      collection(db,"refleksjoner",u.uid,"entries")
    );

    snap.docs.forEach(d=>{
      const data = d.data();

      if(!data.coachRead){
        unread++;
      }
    });

  }

  updateUnreadBadge(unread);

}


function updateUnreadBadge(count){

  const badge = document.getElementById("refUnreadBadge");
  const dot = document.querySelector(".dot");

  if(!badge) return;

  if(count > 0){

    badge.style.display = "inline-block";
    badge.textContent = `${count} nye`;

    if(dot){
      dot.style.background = "#ef4444";
    }

  }else{

    badge.style.display = "none";

    if(dot){
      dot.style.background = "#22c55e";
    }

  }

}

/* =====================================================
   GODKJENNING AV BRUKERE
===================================================== */

async function loadPendingUsersUI() {
  const toggle = document.getElementById("approvalToggle");
  const dropdown = document.getElementById("approvalDropdown");

  if (!toggle || !dropdown) return;

  const snap = await getDocs(collection(db, "users"));
  
  console.log("Total users in DB:", snap.size);
console.log("All users data:", snap.docs.map(d => d.data()));

  const pending = snap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => u.role === "player" && u.approved !== true);

  toggle.textContent = `Ventende (${pending.length}) ▾`;

  if (pending.length === 0) {
    dropdown.innerHTML =
      '<div class="ref-approval-empty">Ingen ventende godkjenninger</div>';
    return;
  }

  dropdown.innerHTML = "";

  pending.forEach(u => {
    const row = document.createElement("div");
    row.className = "ref-approval-item";

    const label = document.createElement("span");
    label.textContent = u.name || u.email || "Ukjent";

    const btn = document.createElement("button");
    btn.className = "ref-approve-btn";
    btn.textContent = "Godkjenn";

    btn.onclick = async () => {
      await updateDoc(doc(db, "users", u.uid), {
        approved: true
      });
      loadPendingUsersUI();
    };

    row.appendChild(label);
    row.appendChild(btn);
    dropdown.appendChild(row);
  });
}

/* =====================================================
   HOVED-UI
===================================================== */

async function initCoachRefleksjonUI() {

await loadPendingUsersUI();
await countUnreadReflections();
await loadUnreadRefleksjoner();

  const selPlayer = document.getElementById("refPlayerSelect");
  const selWeek = document.getElementById("refWeekSelect");
  const list = document.getElementById("refList");

  selPlayer.innerHTML = `<option value="">Velg spiller</option>`;
  selWeek.innerHTML = `<option value="">Alle</option>`;
  list.innerHTML = `<div class="ref-empty">Velg en spiller.</div>`;

  const players = await fetchUsers();

  players.forEach(p => {
    const op = document.createElement("option");
    op.value = p.uid;
    op.textContent = p.name || p.email;
    selPlayer.appendChild(op);
  });

  selPlayer.onchange = () => loadAndRenderRefleksjoner(selPlayer.value);
  selWeek.onchange = () => loadAndRenderRefleksjoner(selPlayer.value);
}

async function loadUnreadRefleksjoner(){

  const container = document.getElementById("refInbox");
  if(!container) return;

  const users = await fetchUsers();

  let html = "";
  let count = 0;

  for(const u of users){

    const snap = await getDocs(
      collection(db,"refleksjoner",u.uid,"entries")
    );

    snap.docs.forEach(d=>{

      const r = d.data();

      if(!r.coachRead){

        count++;

        html += `
        <div class="ref-inbox-item"
          onclick="openUnreadRef('${u.uid}', '${r.week}')">

          ${u.name || u.email} – uke ${r.week}

        </div>
        `;

      }

    });

  }

  if(count === 0){
    container.innerHTML = "";
    return;
  }

  container.innerHTML = `
    <div class="ref-inbox-title">
      🔴 Nye refleksjoner (${count})
    </div>
    ${html}
  `;
}

window.openUnreadRef = function(uid, week){

  const playerSelect = document.getElementById("refPlayerSelect");
  const weekSelect = document.getElementById("refWeekSelect");

  playerSelect.value = uid;

  loadAndRenderRefleksjoner(uid).then(()=>{

    weekSelect.value = week;
    loadAndRenderRefleksjoner(uid);

  });

}

/* =====================================================
   RENDER REFLEKSJONER
===================================================== */

async function loadAndRenderRefleksjoner(playerId) {

  const list = document.getElementById("refList");
  const selWeek = document.getElementById("refWeekSelect");

  if (!playerId) {
    list.innerHTML =
      `<div class="ref-empty">Velg en spiller for å se refleksjoner.</div>`;
    return;
  }

  const entries = await fetchRefleksjoner(playerId);
  
  let seasonGoal = "";

const goalSnap = await getDoc(doc(db, "seasonGoals", playerId));

if (goalSnap.exists()) {
  seasonGoal = goalSnap.data().goal || "";
}

  if (seasonGoal) {
  list.innerHTML = `
    <div class="season-goal-line">
      <strong>Spillerens mål for sesongen:</strong> ${seasonGoal}
    </div>
  `;
} else {
  list.innerHTML = "";
}

  selWeek.innerHTML = `<option value="">Alle</option>`;

  [...new Set(entries.map(e => String(e.week)))]
    .sort((a, b) => Number(b) - Number(a))
    .forEach(w => {
      const op = document.createElement("option");
      op.value = w;
      op.textContent = `Uke ${w}`;
      selWeek.appendChild(op);
    });

  const weekFilter = selWeek.value;
  const filtered = weekFilter
    ? entries.filter(e => String(e.week) === weekFilter)
    : entries;

  if (!filtered.length) {
    list.innerHTML =
      `<div class="ref-empty">Ingen refleksjoner funnet.</div>`;
    return;
  }

 list.insertAdjacentHTML("beforeend", filtered.map(e => `
  <div class="ref-item collapsible ${!e.coachRead ? 'unread' : ''}" data-id="${e.id}">
    
    <div class="ref-item-header">
      <div class="ref-item-title">
        Uke ${e.week} – ${e.dateNor || ""}
      </div>
      <div class="chevron">▾</div>
    </div>

    <div class="ref-item-body">
      <div class="ref-kv">
  <div><span class="k">Innsats:</span> ${e.effort ?? "-"}</div>
  <div><span class="k">Energi:</span> ${e.energy ?? "-"}</div>

  <div><span class="k">Opplevelse:</span> ${
    e.fun == 5 ? "Veldig bra" :
    e.fun == 4 ? "Bra" :
    e.fun == 3 ? "OK" :
    e.fun ? "Dårlig" : "-"
  }</div>

  <div><span class="k">Fokus:</span> ${
    e.more?.length ? e.more.join(", ") : "-"
  }</div>

  <div><span class="k">Til trener:</span> ${e.coachNote || "-"}</div>
</div>
    </div>

  </div>
`).join(""));

const items = list.querySelectorAll(".collapsible");

items.forEach(item => {

  const header = item.querySelector(".ref-item-header");

  if (!header) return;

header.addEventListener("click", async (event) => {

  event.stopPropagation();

  items.forEach(i => i.classList.remove("open"));

  item.classList.add("open");
item.classList.remove("unread");

  const refId = item.dataset.id;

  await updateDoc(
    doc(db,"refleksjoner",playerId,"entries",refId),
    {
      coachRead: true,
      coachReadAt: serverTimestamp()
    }
  );
  
  await countUnreadReflections();
await loadUnreadRefleksjoner();

});
  
});

}

const toggleBtn = document.getElementById("approvalToggle");
const dropdown = document.getElementById("approvalDropdown");

if (toggleBtn && dropdown) {

}

document.addEventListener("click", (event) => {

  const clickedInside = event.target.closest(".ref-item");

  if (!clickedInside) {

    document
      .querySelectorAll(".collapsible.open")
      .forEach(i => i.classList.remove("open"));

  }

}); 

window.goBack = function () {
  window.history.back();
};
