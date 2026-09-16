import { db } from "./firebase-refleksjon.js";
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

const params = new URLSearchParams(window.location.search);
const source = params.get("source");
const matchId = params.get("matchId");
const saveBtn = document.getElementById("saveBtn");
const timeEl = document.getElementById("time");

if (source === "official" && matchId && saveBtn && timeEl) {
  saveBtn.addEventListener("click", () => {
    const value = String(timeEl.value || "").trim();
    if (!value) return;

    // edit-match.js lagrer først meta.startTime. Kjør etterpå slik at det eldre
    // meta.time-feltet ikke kan bli stående med et gammelt klokkeslett.
    window.setTimeout(async () => {
      try {
        await updateDoc(doc(db, "matches", matchId), {
          "meta.startTime": value,
          "meta.time": value
        });
      } catch (error) {
        console.error("Kunne ikke synkronisere kampstarttid:", error);
      }
    }, 600);
  });
}
