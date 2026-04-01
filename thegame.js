import { db } from "./firebase-refleksjon.js";
import { collection, getDocs, deleteDoc, doc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
const list = document.getElementById("list");

async function loadData(){

  const snap = await getDocs(collection(db, "exerciseLogs"));

  let players = {};

  snap.forEach(doc => {
    const data = doc.data();

    const name = data.navn || data.name; // fallback hvis ulikt navn
    const uid = data.uid;
	
    if(!players[uid]){
  players[uid] = {
    name: name,
    exercises: []
  };
}

players[uid].exercises.push({
  exercise: data.exercise,
  category: data.category
});

  });
window.playersData = players;
  render(players);
}

function render(players){

  const list = document.getElementById("list");
  list.innerHTML = "";

  Object.keys(players).forEach(uid => {

    const player = players[uid];
    const exercises = player.exercises;
    const name = player.name;
	const total = exercises.length;

    let counts = {};

    exercises.forEach(item => {
  const ex = item.exercise;
  counts[ex] = (counts[ex] || 0) + 1;
});
	
	const uniqueExercises = Object.keys(counts).length;

    const div = document.createElement("div");
div.classList.add("playerCard");

const deleteBtn = document.createElement("button");
deleteBtn.innerHTML = "🗑️ <span>Slett logg</span>";
deleteBtn.classList.add("deleteBtn");

deleteBtn.onclick = (e) => {
  e.stopPropagation(); // viktig!
  deletePlayerLogs(uid);
};

div.appendChild(deleteBtn);

let html = `
  <button class="deleteBtn" onclick="deletePlayerLogs('${uid}')">
    🗑️ Slett logg
  </button>

  <div class="playerName" onclick="togglePlayer('${uid}')">
    ${name} (${total} økter)
  </div>

  <div class="playerDetails" id="player-${uid}" data-player="${name}" style="display:none;"></div>
`;

div.innerHTML = html;

    list.appendChild(div);

  });
}

window.showPlayer = function(uid){
  const playerData = window.playersData[uid].exercises;

  const container = document.getElementById("list");


  let html = `<button class="backBtn" onclick="location.reload()">← Tilbake</button>`;
  html += `<h2 style="margin-top:10px;">${name}</h2>`;

  let counts = {};

playerData.forEach(item => {
  const cat = item.category;
  counts[cat] = (counts[cat] || 0) + 1;
});

const uniqueCategories = Object.keys(counts).length;

  Object.entries(counts)
    .sort((a,b) => b[1] - a[1])
    .forEach(([ex,count]) => {
      html += `<div>${ex} (${count})</div>`;
    });
	
	if(uniqueCategories <= 2){
  html += `<div class="medium">🟡 Litt ensidig trening</div>`;
} else {
  html += `<div class="good">🟢 Bra variasjon</div>`;
}

  container.innerHTML = html;
};

window.togglePlayer = function(uid){

  const all = document.querySelectorAll(".playerDetails");

  // lukk alle først
  all.forEach(el => {
    el.style.display = "none";
  });

  const el = document.getElementById(`player-${uid}`);

  // hvis den vi klikker på allerede var åpen → ikke åpne igjen
  if(el.dataset.open === "true"){
    el.dataset.open = "false";
    return;
  }

  // sett alle til lukket
  all.forEach(el => el.dataset.open = "false");

  // åpne valgt
  el.style.display = "block";
  el.dataset.open = "true";

  // bygg innhold hvis tom
  if(!el.innerHTML){

    const data = window.playersData[uid].exercises;

    let counts = {};

    data.forEach(item => {
      const ex = item.exercise;
      counts[ex] = (counts[ex] || 0) + 1;
    });
	
	let categoryCounts = {};

data.forEach(item => {
  const cat = item.category;
  categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
});

    const sorted = Object.entries(counts)
      .sort((a,b) => b[1] - a[1]);

let html = "";

// 🔹 kategori-knapper
html += `<div class="categoryFilters">`;

// 🔹 KUN kategorier her
Object.entries(categoryCounts).forEach(([cat, count]) => {
  html += `<button onclick="filterExercises('${uid}', '${cat}')">
    ${cat} (${count})
  </button>`;
});

html += `</div>`;

// 🔹 "Alle" separat
html += `
  <div class="allWrapper">
    <button class="allBtn" onclick="filterExercises('${uid}', 'all')">Alle</button>
  </div>
`;

    sorted.forEach(([ex,count], index) => {

if(index === 0){

  const xpMatch = ex.match(/\(\+.*?XP\)/);
  const xp = xpMatch ? xpMatch[0].replace(/[()]/g, "") : "";

  const cleanName = ex.replace(/\(\+.*?XP\)/, "").trim();

  html += `
    <div class="exercise">
      <span class="left favorite">⭐ ${cleanName}</span>
      <span class="right">${xp} • ${count}x</span>
    </div>
  `;

} else {
       // trekk ut XP
const xpMatch = ex.match(/\(\+.*?XP\)/);
const xp = xpMatch ? xpMatch[0].replace(/[()]/g, "") : "";

const cleanName = ex.replace(/\(\+.*?XP\)/, "").trim();

if(index === 0){
	
  html += `
    <div class="exercise">
      <span class="left favorite">⭐ ${cleanName}</span>
      <span class="right">${xp} • ${count}x</span>
    </div>
  `;
} else {
  html += `
    <div class="exercise">
      <span class="left">${cleanName}</span>
      <span class="right">${xp} • ${count}x</span>
    </div>
  `;
}
      }

    });

    el.innerHTML = html;
  }

};

window.filterExercises = function(uid, category){
const data = window.playersData[uid].exercises;

  const container = document.getElementById(`player-${uid}`);

  let filtered = data;

  if(category !== "all"){
    filtered = data.filter(item => item.category === category);
  }

  let counts = {};

  filtered.forEach(item => {
    const ex = item.exercise;
    counts[ex] = (counts[ex] || 0) + 1;
  });

  const sorted = Object.entries(counts)
    .sort((a,b) => b[1] - a[1]);

  let html = "";

  sorted.forEach(([ex,count], index) => {

    const xpMatch = ex.match(/\(\+.*?XP\)/);
    const xp = xpMatch ? xpMatch[0].replace(/[()]/g, "") : "";

    const cleanName = ex.replace(/\(\+.*?XP\)/, "").trim();

    if(index === 0){
      html += `
        <div class="exercise">
          <span class="left favorite">⭐ ${cleanName}</span>
          <span class="right">${xp} • ${count}x</span>
        </div>
      `;
    } else {
      html += `
        <div class="exercise">
          <span class="left">${cleanName}</span>
          <span class="right">${xp} • ${count}x</span>
        </div>
      `;
    }

  });

  // 🔥 viktig: behold knappene
  const filters = container.querySelector(".categoryFilters").outerHTML;
  const allBtn = container.querySelector(".allWrapper").outerHTML;

  container.innerHTML = filters + allBtn + html;
};

window.deletePlayerLogs = async function(uid){

  if(!confirm("Slette all logg?")) return;

  const snap = await getDocs(collection(db, "exerciseLogs"));

  const deletes = [];

  snap.forEach(d => {
    const data = d.data();

    if(data.uid === uid){
      deletes.push(deleteDoc(doc(db, "exerciseLogs", d.id)));
    }
  });

  await Promise.all(deletes);

  alert("Logg slettet");

  loadData();
};

loadData();