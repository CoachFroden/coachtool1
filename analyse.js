import { auth, db } from "./firebase-refleksjon.js";

import {
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-auth.js";

import {
  collection,
  getDocs,
  getDoc,
  doc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

import { getFunctions, httpsCallable } 
from "https://www.gstatic.com/firebasejs/12.6.0/firebase-functions.js";

let developmentChart = null;

let uiInitialized = false;

function parseEnergy(value) {

  if (typeof value === "number") return value;

  if (value === "Lav") return 1;
  if (value === "Middels") return 3;
  if (value === "Høy") return 5;

  return Number(value) || 0;

}

/* =========================================
   AUTH – KUN COACH
========================================= */

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = "./index.html";
    return;
  }

  const snap = await getDoc(doc(db, "users", user.uid));

  if (!snap.exists() || snap.data().role !== "coach") {
    alert("Kun trener har tilgang.");
    window.location.href = "./fremside.html";
    return;
  }

  initAnalyseUI();
  loadAlerts();
});

/* =========================================
   INIT UI
========================================= */

async function initAnalyseUI() {
	
	if (uiInitialized) return;
uiInitialized = true;

  const select = document.getElementById("analysisPlayerSelect");
  const weekSelect = document.getElementById("analysisWeekSelect");
  select.innerHTML = `<option value="">Velg spiller</option>`;

  const playersSnap = await getDocs(collection(db, "users"));

  const players = playersSnap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => u.role === "player" && u.approved === true);

  players.forEach(p => {
    const option = document.createElement("option");
    option.value = p.uid;
    option.textContent = p.name || p.email;
    select.appendChild(option);
  });

select.addEventListener("change", async () => {

  const playerId = select.value;

  const resultDiv = document.getElementById("analysisResult");
  const statsDiv = document.getElementById("analysisStats");

  resultDiv.innerHTML = "";
  statsDiv.innerHTML = "";

  if (!playerId) return;

  await populateWeekSelector(playerId);
  loadPlayerAnalysis(playerId);

});

weekSelect.addEventListener("change", async () => {

  const playerId = select.value;

  if (!playerId) return;

  loadPlayerAnalysis(playerId);

});
  
  const runBtn = document.getElementById("runAnalysisBtn");

runBtn.addEventListener("click", async () => {
  const playerId = select.value;

  if (!playerId) {
    alert("Velg en spiller først.");
    return;
  }

  runBtn.disabled = true;
  runBtn.textContent = "Genererer...";

  try {
  const functions = getFunctions();
const generatePlayerAnalysis = httpsCallable(functions, "generatePlayerAnalysis");

const selectedWeek = document.getElementById("analysisWeekSelect").value;

const alertsSection = document.getElementById("analysisAlerts");

if (alertsSection) {
  alertsSection.style.display = "none";
}

const alertTitle = document.querySelector("#alertTitle");

if (alertTitle) {
  if (selectedWeek === "all") {
    alertTitle.style.display = "block";
  } else {
    alertTitle.style.display = "none";
  }
}

await generatePlayerAnalysis({
  playerId,
  week: selectedWeek
});

    await loadPlayerAnalysis(playerId);

  } catch (err) {
    console.error(err);
    alert("Noe gikk galt under analyse.");
  }

  runBtn.disabled = false;
  runBtn.textContent = "Kjør ny analyse";
});

}

async function loadAlerts() {

  const alertSection = document.getElementById("analysisAlerts");
  const alertList = document.getElementById("alertList");

  if (!alertList || !alertSection) return;

  alertList.innerHTML = "";

  const playersSnap = await getDocs(collection(db, "users"));
  const players = playersSnap.docs
    .map(d => ({ uid: d.id, ...d.data() }))
    .filter(u => u.role === "player" && u.approved === true);

  let alertCount = 0;

  for (const player of players) {

const snap = await getDocs(
  collection(db, "refleksjoner", player.uid, "entries")
);

if (snap.empty) continue;

const entries = snap.docs.map(d => d.data());

// sorter etter uke
entries.sort((a,b)=> (a.year-b.year) || (a.week-b.week));

// siste refleksjon
const last = entries[entries.length - 1];

const effort = Number(last.effort) || 0;
const energy = parseEnergy(last.energy);

let flags = [];

if (effort <= 2) flags.push("Lav innsats i siste refleksjon");
if (energy <= 2) flags.push("Lav energi i siste refleksjon");

if (flags.length > 0) {

  const div = document.createElement("div");
  div.className = "alert-item";

  div.innerHTML = `
    <strong>${player.name || player.email || "Ukjent spiller"}</strong>
    ${flags.map(r => `<div>• ${r}</div>`).join("")}
  `;

  div.addEventListener("click", () => {

    const playerSelect = document.getElementById("analysisPlayerSelect");

    playerSelect.value = player.uid;

    populateWeekSelector(player.uid);
    loadPlayerAnalysis(player.uid);

  });
	  
	  div.addEventListener("click", () => {

  const playerSelect = document.getElementById("analysisPlayerSelect");

  playerSelect.value = player.uid;

  populateWeekSelector(player.uid);
  loadPlayerAnalysis(player.uid);

});

      alertList.appendChild(div);
      alertCount++;
    }
  }

  alertSection.style.display = alertCount > 0 ? "block" : "none";
}

async function populateWeekSelector(playerId) {

  const weekSelect = document.getElementById("analysisWeekSelect");
  weekSelect.innerHTML = `<option value="all">Alle uker</option>`;

  const snap = await getDocs(
    collection(db, "refleksjoner", playerId, "entries")
  );

  const weeks = snap.docs
    .map(d => d.data())
    .map(e => e.week)
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .sort((a, b) => a - b);

  weeks.forEach(w => {
    const option = document.createElement("option");
    option.value = w;
    option.textContent = `Uke ${w}`;
    weekSelect.appendChild(option);
  });

}

/* =========================================
   LOAD PLAYER DATA
========================================= */

async function loadPlayerAnalysis(playerId) {

  const statsDiv = document.getElementById("analysisStats");
  const resultDiv = document.getElementById("analysisResult");

  if (!playerId) {
    statsDiv.innerHTML = "";
    resultDiv.innerHTML = "Velg en spiller for å se analyse.";
    return;
  }

  // Hent refleksjoner
  const snap = await getDocs(
    collection(db, "refleksjoner", playerId, "entries")
  );

  const entries = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const selectedWeek = document.getElementById("analysisWeekSelect").value;
  
  // Sorter refleksjoner etter uke
entries.sort((a, b) =>
  (a.year - b.year) ||
  (a.week - b.week) ||
  (a.type === "training" ? -1 : 1)
);

// Data til graf
const weeks = entries.map(e => `Uke ${e.week}`);
const effortData = entries.map(e => Number(e.effort) || 0);
const energyData = entries.map(e => parseEnergy(e.energy));
const coachEffortData = entries.map(e => Number(e.coachEffort) || null);
const coachEnergyData = entries.map(e => Number(e.coachEnergy) || null);

// Tegn graf

const chartSection = document.getElementById("developmentSection");
const weekComparison = document.getElementById("weekComparison");

if (selectedWeek !== "all") {

  chartSection.style.display = "none";
  weekComparison.style.display = "block";

const weekEntry = entries
  .filter(e => String(e.week) === selectedWeek)
  .slice(-1)[0];
  
  if (weekEntry) {

    const playerEffort = Number(weekEntry.effort) || 0;
    const playerEnergy = parseEnergy(weekEntry.energy);

    const coachEffort = Number(weekEntry.coachEffort) || 0;
    const coachEnergy = Number(weekEntry.coachEnergy) || 0;

    document.getElementById("playerEffortBar").style.width = (playerEffort * 20) + "%";
    document.getElementById("coachEffortBar").style.width = (coachEffort * 20) + "%";

    document.getElementById("playerEnergyBar").style.width = (playerEnergy * 20) + "%";
    document.getElementById("coachEnergyBar").style.width = (coachEnergy * 20) + "%";

    document.getElementById("playerEffortValue").textContent = playerEffort;
    document.getElementById("coachEffortValue").textContent = coachEffort;

    document.getElementById("playerEnergyValue").textContent = playerEnergy;
    document.getElementById("coachEnergyValue").textContent = coachEnergy;

  }

} else {

  chartSection.style.display = "block";
  weekComparison.style.display = "none";

}

if (selectedWeek === "all" && entries.length > 1) {
	chartSection.style.display = "block";

  const ctx = document.getElementById("developmentChart");

  if (ctx) {

    if (developmentChart) {
      developmentChart.destroy();
    }

    developmentChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: weeks,
        datasets: [
          {
            label: "Innsats",
            data: effortData,
            borderColor: "#facc15",
            backgroundColor: "rgba(250,204,21,0.2)",
            tension: 0.3
          },
          {
            label: "Energi",
            data: energyData,
            borderColor: "#22c55e",
            backgroundColor: "rgba(34,197,94,0.2)",
            tension: 0.3
          },
          {
            label: "Trener innsats",
            data: coachEffortData,
            borderColor: "#f97316",
            backgroundColor: "rgba(249,115,22,0.2)",
            borderDash: [5,5],
            tension: 0.3
          },
          {
            label: "Trener energi",
            data: coachEnergyData,
            borderColor: "#38bdf8",
            backgroundColor: "rgba(56,189,248,0.2)",
            borderDash: [5,5],
            tension: 0.3
          }
        ]
      },
      options: {
        responsive: true,
        scales: {
          y: {
            min: 1,
            max: 5,
            ticks: {
              stepSize: 1
            }
          }
        }
      }
    });

  }

} else {

  chartSection.style.display = "none";

  if (developmentChart) {
    developmentChart.destroy();
    developmentChart = null;
  }

}
  
let selectedEntry;
let selectedWeekEntries = [];

if (selectedWeek === "all") {

  const lastEntrySorted = entries[entries.length - 1];
  selectedEntry = lastEntrySorted;
  selectedWeekEntries = [lastEntrySorted];

} else {

  selectedWeekEntries = entries.filter(
    e => String(e.week) === selectedWeek
  );

  if (selectedWeekEntries.length > 0) {
    selectedEntry = selectedWeekEntries[selectedWeekEntries.length - 1];
  }

}

let previousEntry = null;

if (selectedWeek !== "all") {

  const currentWeek = Number(selectedWeek);

  const earlierEntries = entries.filter(e => Number(e.week) < currentWeek);

  if (earlierEntries.length > 0) {
    previousEntry = earlierEntries[earlierEntries.length - 1];
  }

}

const lastEntryId = selectedEntry?.id;

const lastEffort = Number(selectedEntry?.effort) || 0;
const lastEnergy = parseEnergy(selectedEntry?.energy);

let weekComparisonText = "";

if (previousEntry) {

  const prevEnergy = parseEnergy(previousEntry.energy);
  const prevEffort = Number(previousEntry.effort) || 0;

  const energyDiff = lastEnergy - prevEnergy;
  const effortDiff = lastEffort - prevEffort;

  // Energi sammenligning
  if (energyDiff > 0) {
    weekComparisonText += "Energinivået er litt høyere enn forrige uke. ";
  } 
  else if (energyDiff < 0) {
    weekComparisonText += "Energinivået er lavere enn forrige uke. ";
  } 
  else {
    weekComparisonText += "Energinivået er omtrent likt som forrige uke. ";
  }

  // Innsats sammenligning
  if (effortDiff > 0) {
    weekComparisonText += "Innsatsen er høyere enn forrige uke.";
  } 
  else if (effortDiff < 0) {
    weekComparisonText += "Innsatsen er lavere enn forrige uke.";
  } 
  else {
    weekComparisonText += "Innsatsen er omtrent lik som forrige uke.";
  }

}

  if (!entries.length) {
    statsDiv.innerHTML = `<div class="stat-box">Ingen refleksjoner funnet</div>`;
    resultDiv.innerHTML = "Spilleren har ikke levert refleksjoner.";
    return;
  }

  // Beregn nøkkeltall
  const avgEffort =
    entries.reduce((sum, e) => sum + (Number(e.effort) || 0), 0) /
    entries.length;

  const avgEnergy =
  entries.reduce((sum, e) => sum + parseEnergy(e.energy), 0) /
  entries.length;
  
const lastEnergyValue = parseEnergy(selectedEntry?.energy);
const lowEnergy = lastEnergyValue <= 2;

let persistentLowEnergy = false;

if (entries.length >= 2) {

  const lastTwo = entries.slice(-2);

  const bothLow =
    parseEnergy(lastTwo[0].energy) <= 2 &&
    parseEnergy(lastTwo[1].energy) <= 2;

  persistentLowEnergy = bothLow;

}
	
const entriesWithCoach = selectedWeek === "all"
  ? entries.filter(e => e.coachEffort !== undefined && e.coachEnergy !== undefined)
  : [selectedEntry].filter(e => e?.coachEffort !== undefined && e?.coachEnergy !== undefined);

let avgEffortDelta = 0;
let avgEnergyDelta = 0;

if (entriesWithCoach.length > 0) {
  avgEffortDelta =
    entriesWithCoach.reduce(
      (sum, e) => sum + (Number(e.coachEffort) - Number(e.effort)),
      0
    ) / entriesWithCoach.length;

avgEnergyDelta =
  entriesWithCoach.reduce(
    (sum, e) => sum + (Number(e.coachEnergy) - parseEnergy(e.energy)),
    0
  ) / entriesWithCoach.length;
}

let followUpText = "";

const lowEffort = lastEffort <= 2;

if (persistentLowEnergy) {
  followUpText = "Vedvarende lav energi";
}
else if (lowEnergy && lowEffort) {
  followUpText = "Lav innsats og energi i siste refleksjon";
}
else if (lowEnergy) {
  followUpText = "Lav energi i siste refleksjon";
}
else if (lowEffort) {
  followUpText = "Lav innsats i siste refleksjon";
}

let weekEntriesHtml = "";
let trainingEntries = [];
let matchEntries = [];

if (selectedWeekEntries.length > 0) {

  trainingEntries = selectedWeekEntries.filter(e => e.type === "training");
  matchEntries = selectedWeekEntries.filter(e => e.type === "match");

}

let trainingAvgEffort = 0;
let trainingAvgEnergy = 0;

if (trainingEntries.length > 0) {

  trainingAvgEffort =
    trainingEntries.reduce((sum, e) => sum + (Number(e.effort) || 0), 0)
    / trainingEntries.length;

  trainingAvgEnergy =
    trainingEntries.reduce((sum, e) => sum + parseEnergy(e.energy), 0)
    / trainingEntries.length;

}

let matchAvgEffort = 0;
let matchAvgEnergy = 0;

if (matchEntries.length > 0) {

  matchAvgEffort =
    matchEntries.reduce((sum, e) => sum + (Number(e.effort) || 0), 0)
    / matchEntries.length;

  matchAvgEnergy =
    matchEntries.reduce((sum, e) => sum + parseEnergy(e.energy), 0)
    / matchEntries.length;

}

if (selectedWeek !== "all" && selectedWeekEntries.length > 0) {

  weekEntriesHtml = `
    <div class="stat-box">
      <strong>Refleksjoner uke ${selectedWeek}</strong><br><br>
      <table class="week-table">
	  ${trainingEntries.length > 0 ? `
<div style="margin-bottom:8px;">
  <strong>Snitt trening:</strong>
  Innsats ${trainingAvgEffort.toFixed(1)} |
  Energi ${trainingAvgEnergy.toFixed(1)}
</div>
` : ""}

${matchEntries.length > 0 ? `
<div style="margin-bottom:12px;">
  <strong>Kamp:</strong>
  Innsats ${matchAvgEffort.toFixed(1)} |
  Energi ${matchAvgEnergy.toFixed(1)}
</div>
` : ""}

  <thead>
    <tr>
      <th></th>
      <th>Innsats</th>
      <th>Energi</th>
    </tr>
  </thead>
  <tbody>

${trainingEntries.map(e => `
<tr>
<td><strong>Trening</strong></td>
<td>${Number(e.effort) || 0}</td>
<td>${parseEnergy(e.energy)}</td>
</tr>
`).join("")}

${matchEntries.map(e => `
<tr>
<td><strong>Kamp</strong></td>
<td>${Number(e.effort) || 0}</td>
<td>${parseEnergy(e.energy)}</td>
</tr>
`).join("")}

</tbody>
</table>
    </div>
  `;

}

statsDiv.innerHTML = `
   ${followUpText ? `<div class="followup-warning">${followUpText}</div>` : ""}
   ${weekEntriesHtml}
  <div class="stat-box">Antall refleksjoner: ${entries.length}</div>
  <div class="stat-box">Snitt innsats (spiller): ${avgEffort.toFixed(2)}</div>
  <div class="stat-box">Snitt energi (spiller): ${avgEnergy.toFixed(2)}</div>
  <div class="stat-box">Siste innsats: ${lastEffort}</div>
  <div class="stat-box">Siste energi: ${lastEnergy}</div>

<div class="stat-box coach-score-box">

    Innsats:
    <input type="number" id="coachEffortInput" min="1" max="5" step="1" style="width:60px;"><br><br>

    Energi:
    <input type="number" id="coachEnergyInput" min="1" max="5" step="1" style="width:60px;"><br><br>

    <button id="saveCoachScoreBtn">Lagre trener-score</button>
  </div>
`;

let calibrationText = "Ingen trener-score registrert enda.";

const effortDeltaRounded = avgEffortDelta.toFixed(2);
const energyDeltaRounded = avgEnergyDelta.toFixed(2);

if (entriesWithCoach.length === 1) {

  let effortText = "";
  let energyText = "";

  if (avgEffortDelta > 0) {
    effortText = `Trener vurderer innsats høyere enn spiller (${effortDeltaRounded}).`;
  } else if (avgEffortDelta < 0) {
    effortText = `Spiller vurderer innsats høyere enn trener (${effortDeltaRounded}).`;
  } else {
    effortText = `Lik vurdering av innsats (${effortDeltaRounded}).`;
  }

  if (avgEnergyDelta > 0) {
    energyText = `Trener vurderer energi høyere enn spiller (${energyDeltaRounded}).`;
  } else if (avgEnergyDelta < 0) {
    energyText = `Spiller vurderer energi høyere enn trener (${energyDeltaRounded}).`;
  } else {
    energyText = `Lik vurdering av energi (${energyDeltaRounded}).`;
  }

  calibrationText = `${effortText} ${energyText}`;

} else if (entriesWithCoach.length > 1) {

  if (avgEffortDelta > 0.5 || avgEnergyDelta > 0.5) {
    calibrationText = `Spilleren undervurderer seg selv (snitt avvik innsats: +${effortDeltaRounded}, energi: +${energyDeltaRounded}).`;
  } 
  else if (avgEffortDelta < -0.5 || avgEnergyDelta < -0.5) {
    calibrationText = `Spilleren overvurderer seg selv (snitt avvik innsats: ${effortDeltaRounded}, energi: ${energyDeltaRounded}).`;
  } 
  else {
    calibrationText = `God kalibrering mellom spiller og trener (snitt avvik innsats: ${effortDeltaRounded}, energi: ${energyDeltaRounded}).`;
  }

}

let calibrationClass = "calibration-neutral";

if (entriesWithCoach.length > 0) {
  const maxDelta = Math.max(
    Math.abs(avgEffortDelta),
    Math.abs(avgEnergyDelta)
  );

  if (maxDelta > 1) {
    calibrationClass = "calibration-red";
  } else if (maxDelta > 0.5) {
    calibrationClass = "calibration-yellow";
  } else {
    calibrationClass = "calibration-green";
  }
}

statsDiv.innerHTML += `
  <div class="stat-box ${calibrationClass}">
    <strong>Kalibrering</strong><br>
    ${calibrationText}
  </div>
`;

if (selectedWeek !== "all" && weekComparisonText) {

  statsDiv.innerHTML += `
    <div class="stat-box">
      <strong>Sammenligning med forrige uke</strong><br>
      ${weekComparisonText}
    </div>
  `;

}

if (selectedEntry?.coachEffort !== undefined) {
  document.getElementById("coachEffortInput").value = selectedEntry.coachEffort;
}

if (selectedEntry?.coachEnergy !== undefined) {
  document.getElementById("coachEnergyInput").value = selectedEntry.coachEnergy;
}

const saveBtn = document.getElementById("saveCoachScoreBtn");

saveBtn.addEventListener("click", async () => {
  const coachEffort = Number(document.getElementById("coachEffortInput").value);
  const coachEnergy = Number(document.getElementById("coachEnergyInput").value);

  if (!coachEffort || !coachEnergy) {
    alert("Fyll inn begge feltene.");
    return;
  }

  try {
    await updateDoc(
      doc(db, "refleksjoner", playerId, "entries", lastEntryId),
      {
        coachEffort,
        coachEnergy
      }
    );

    alert("Trener-score lagret.");

  } catch (err) {
    console.error(err);
    alert("Kunne ikke lagre trener-score.");
  }
});


  // Hent eventuell lagret AI-analyse
const analysisKey = selectedWeek && selectedWeek !== "all" ? selectedWeek : "all";

const aiSnap = await getDoc(
  doc(db, "aiAnalysis", playerId, "weeks", analysisKey)
);
  
  console.log("AI SNAP EXISTS:", aiSnap.exists());
console.log("PLAYER ID:", playerId);

  if (!aiSnap.exists()) {
    resultDiv.innerHTML = `
      <div class="analysis-empty">
        Ingen AI-analyse generert enda.
      </div>
    `;
    return;
  }

  const ai = aiSnap.data();

resultDiv.innerHTML = `
${selectedWeek === "all" ? `
<div class="analysis-block">
  <h3>Risikofaktorer</h3>
${
  Array.isArray(ai.riskFlags) && ai.riskFlags.length > 0
    ? "<ul>" + ai.riskFlags.map(r => `<li>${r}</li>`).join("") + "</ul>"
    : "<p>Ingen tydelige risikofaktorer identifisert.</p>"
}
</div>
` : ""}

<div class="analysis-block">
  <h3>Oppsummering</h3>
  <p>${ai.summary || "-"}</p>
</div>

  <div class="analysis-block">
    <h3>Utvikling</h3>
    <p>${ai.keyPatterns?.performanceTrend || "-"}</p>
  </div>
  
    <div class="analysis-block">
    <h3>Kalibrering (spiller vs trener)</h3>
    <p>${ai.calibrationAnalysis || "Ingen kalibreringsanalyse tilgjengelig."}</p>
  </div>

  <div class="analysis-block">
    <h3>Coaching-fokus</h3>
    <p>${ai.coachingFocus || "-"}</p>
  </div>
`;

}

/* =========================================
   TILBAKE-KNAPP
========================================= */

document.addEventListener("DOMContentLoaded", () => {
  const backBtn = document.getElementById("backBtn");
  if (backBtn) {
    backBtn.addEventListener("click", () => {
      window.history.back();
    });
  }
});

