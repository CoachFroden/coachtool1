import { db } from "./firebase-refleksjon.js";
import {
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const nameMap = {
  "theodor@vibliz.com": "Theodor",
  "frode@vibliz.com": "Frode",
  "coachfroden@gmail.com": "CoachFroden",
  "svein.drevsjo@gmail.com": "Svein Tore"
};

const list = document.getElementById("logList");

async function loadLogs(){

  const q = query(
    collection(db, "loginLogs"),
    orderBy("timestamp", "desc")
  );

  const snap = await getDocs(q);

  let users = {};

  snap.forEach(doc => {
    const data = doc.data();

    const uid = data.uid || "unknown";

    if(!users[uid]){
      users[uid] = {
        email: data.email || "Ukjent",
        count: 0,
        logins: []
      };
    }

    users[uid].count++;

    if(data.timestamp){
      users[uid].logins.push(data.timestamp);
    }

  });

  render(users);
}

function render(users){

  list.innerHTML = "";

  Object.values(users)
    .sort((a,b) => b.count - a.count)
    .forEach(user => {

      const displayName = nameMap[user.email] || user.email;

      const last = user.logins[0];

      const lastText = last
        ? last.toDate().toLocaleString()
        : "Ingen dato";

      // 🔥 STATUS
      const now = new Date();
      let statusColor = "gray";

      if(last){
        const diffHours = (now - last.toDate()) / (1000 * 60 * 60);

        if(diffHours < 24){
          statusColor = "#22c55e"; // grønn
        }
        else if(diffHours < 72){
          statusColor = "#facc15"; // gul
        }
        else{
          statusColor = "#ef4444"; // rød
        }
      }

      const div = document.createElement("div");
      div.className = "log-item";

      const details = document.createElement("div");
      details.className = "log-details";
      details.style.display = "none";

      // 🔽 alle innlogginger
      user.logins.forEach(ts => {
        const d = document.createElement("div");
        d.className = "log-detail-row";
        d.textContent = ts.toDate().toLocaleString();
        details.appendChild(d);
      });

      div.innerHTML = `
        <div class="log-top">
          <span class="log-name">
            <span class="status-dot" style="background:${statusColor}"></span>
            ${displayName}
          </span>
          <span class="log-count">${user.count}</span>
        </div>

        <div class="log-last">
          Sist: ${lastText}
        </div>
      `;

      // 🔥 toggle
      div.onclick = () => {
        const isOpen = details.style.display === "block";
        details.style.display = isOpen ? "none" : "block";
      };

      div.appendChild(details);
      list.appendChild(div);

    });

}

loadLogs();